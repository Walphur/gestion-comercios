import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FileUp, PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { Modal, Button, Input, NumericField } from "./ui";
import { findByBarcode, getBarcodeQuantityFactor, listProducts } from "../db/products";
import { applyPurchaseEntry } from "../db/purchaseEntry";
import { formatDbError } from "../lib/dbError";
import { formatMoney } from "../lib/format";
import { FACTURA_IA_URL } from "../config/support";
import { openExternalUrl } from "../lib/openExternal";
import { parsePurchaseGuideCsv } from "../lib/parsePurchaseGuideCsv";
import { pickProductsImportFile, readTextFile } from "../lib/tauri";
import type { Product } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  userId: number | null;
  currency: string;
}

interface DraftLine {
  key: string;
  productId?: number;
  barcode?: string;
  name: string;
  qty: number;
  unitCost: number;
  salePrice: number;
  isNew: boolean;
  pendingLink?: boolean;
  supplierCode?: string;
}

let lineKey = 0;
function nextKey() {
  lineKey += 1;
  return `pl-${lineKey}`;
}

function productToLine(p: Product, qty: number): DraftLine {
  return {
    key: nextKey(),
    productId: p.id,
    barcode: p.barcode ?? p.sku ?? undefined,
    name: p.name,
    qty,
    unitCost: p.cost,
    salePrice: p.price,
    isNew: false,
  };
}

function looksLikeBarcode(text: string): boolean {
  const t = text.trim();
  return /^\d{4,}$/.test(t);
}

export default function PurchaseEntryModal({
  open,
  onClose,
  onDone,
  userId,
  currency,
}: Props) {
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<Product[]>([]);
  const [supplierNote, setSupplierNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkLineKey, setLinkLineKey] = useState<string | null>(null);
  const queryRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setLines([]);
    setQuery("");
    setSearchHits([]);
    setSupplierNote("");
    setLinkLineKey(null);
  }, []);

  useEffect(() => {
    if (open) {
      reset();
      setTimeout(() => queryRef.current?.focus(), 80);
    }
  }, [open, reset]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || looksLikeBarcode(q)) {
      setSearchHits([]);
      return;
    }
    const t = setTimeout(() => {
      void listProducts({ search: q }).then(setSearchHits);
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  function linkProductToLine(lineKey: string, product: Product, qtyOverride?: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== lineKey) return l;
        const qty = qtyOverride ?? l.qty;
        return {
          ...l,
          productId: product.id,
          barcode: product.barcode ?? product.sku ?? l.barcode,
          name: product.name,
          unitCost: l.unitCost > 0 ? l.unitCost : product.cost,
          salePrice: l.salePrice > 0 ? l.salePrice : product.price,
          qty,
          isNew: false,
          pendingLink: false,
        };
      }),
    );
    setLinkLineKey(null);
  }

  function addOrMergeProduct(product: Product, qty: number) {
    if (linkLineKey) {
      linkProductToLine(linkLineKey, product, qty);
      return;
    }

    const pending = lines.find((l) => l.pendingLink);
    if (pending) {
      linkProductToLine(pending.key, product, pending.qty);
      return;
    }

    setLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === product.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + qty };
        return copy;
      }
      return [...prev, productToLine(product, qty)];
    });
  }

  function addManualLine(name = "", barcode?: string) {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        barcode,
        name,
        qty: 1,
        unitCost: 0,
        salePrice: 0,
        isNew: true,
      },
    ]);
  }

  function pickProduct(product: Product) {
    void (async () => {
      const factor = await getBarcodeQuantityFactor(product.barcode ?? "");
      addOrMergeProduct(product, factor);
      setQuery("");
      setSearchHits([]);
      queryRef.current?.focus();
    })();
  }

  async function handleQueryEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !query.trim()) return;
    e.preventDefault();
    const text = query.trim();

    if (looksLikeBarcode(text)) {
      const factor = await getBarcodeQuantityFactor(text);
      const product = await findByBarcode(text);
      if (product) {
        addOrMergeProduct(product, factor);
        setQuery("");
        setSearchHits([]);
        queryRef.current?.focus();
        return;
      }
      addManualLine("", text);
      setQuery("");
      setSearchHits([]);
      return;
    }

    const hits = await listProducts({ search: text });
    if (hits.length === 1) {
      pickProduct(hits[0]);
      return;
    }
    if (hits.length > 1) {
      setSearchHits(hits);
      return;
    }

    addManualLine(text);
    setQuery("");
    setSearchHits([]);
  }

  async function loadGuideCsv() {
    setBusy(true);
    try {
      const path = await pickProductsImportFile();
      if (!path) return;
      const text = await readTextFile(path);
      const guide = parsePurchaseGuideCsv(text);
      const draft: DraftLine[] = guide.map((g) => ({
        key: nextKey(),
        name: g.name,
        qty: g.qty,
        unitCost: g.unitCost,
        salePrice: g.salePrice,
        isNew: true,
        pendingLink: true,
        supplierCode: g.supplierCode,
      }));
      setLines(draft);
      setLinkLineKey(draft[0]?.key ?? null);
      setSupplierNote((prev) => prev || "Factura con IA");
    } catch (e) {
      alert(formatDbError(e));
    } finally {
      setBusy(false);
      queryRef.current?.focus();
    }
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    if (linkLineKey === key) setLinkLineKey(null);
  }

  async function handleConfirm() {
    if (lines.length === 0) {
      alert("Agregá al menos un producto.");
      return;
    }
    for (const l of lines) {
      if (!l.name.trim()) {
        alert("Completá el nombre de todos los productos.");
        return;
      }
      if (l.qty <= 0) {
        alert("La cantidad debe ser mayor a cero.");
        return;
      }
    }
    const unlinked = lines.filter((l) => l.pendingLink && !l.productId);
    if (unlinked.length > 0) {
      const ok = window.confirm(
        `${unlinked.length} producto(s) no están vinculados al catálogo.\n` +
          "Se darán de alta como productos nuevos. ¿Continuar?",
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await applyPurchaseEntry(
        lines.map((l) => ({
          productId: l.productId,
          barcode: l.barcode,
          name: l.name,
          qty: l.qty,
          unitCost: l.unitCost,
          salePrice: l.salePrice,
        })),
        { userId, supplierNote },
      );
      alert(
        `Ingreso registrado.\n${r.updated} actualizado(s) · ${r.created} nuevo(s) · ${r.totalUnits} unidad(es) al stock.`,
      );
      onDone();
      onClose();
    } catch (e) {
      alert(formatDbError(e));
    } finally {
      setBusy(false);
    }
  }

  const totalCost = lines.reduce((a, l) => a + l.unitCost * l.qty, 0);
  const pendingCount = lines.filter((l) => l.pendingLink).length;

  return (
    <Modal open={open} title="Ingreso por factura de compra" onClose={onClose} wide>
      <p className="mb-4 text-sm text-ink-muted">
        Escaneá, buscá por nombre o agregá manualmente. En cada fila podés cambiar cantidad, costo
        y precio de venta.{" "}
        <button
          type="button"
          className="text-brand-600 underline hover:text-brand-500 dark:text-brand-300"
          onClick={() => void openExternalUrl(FACTURA_IA_URL)}
        >
          Factura con IA (web)
        </button>
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void loadGuideCsv()} disabled={busy}>
          <FileUp size={16} /> Cargar guía CSV
        </Button>
        <Button variant="secondary" onClick={() => addManualLine()} disabled={busy}>
          <Plus size={16} /> Agregar línea
        </Button>
        {pendingCount > 0 && (
          <span className="self-center text-sm text-amber-700 dark:text-amber-300">
            {pendingCount} sin vincular — tocá la fila y buscá o escaneá
          </span>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Input
          label="Proveedor / nota (opcional)"
          placeholder="Ej. Coca-Cola, factura 12345"
          value={supplierNote}
          onChange={(e) => setSupplierNote(e.target.value)}
        />
        <div className="flex items-end">
          <p className="text-sm text-ink-muted">
            Total costo: <strong className="text-ink">{formatMoney(totalCost, currency)}</strong>
          </p>
        </div>
      </div>

      <div className="relative mb-2">
        <Search
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-500"
        />
        <input
          ref={queryRef}
          type="text"
          className="w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-3 pl-10 pr-3 text-sm text-ink outline-none focus:border-brand-500"
          placeholder={
            linkLineKey
              ? "Buscá por nombre o escaneá código de la fila seleccionada…"
              : "Buscar por nombre, escanear código de barras · Enter"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => void handleQueryEnter(e)}
          disabled={busy}
        />
      </div>

      {searchHits.length > 0 && (
        <ul className="mb-4 max-h-44 overflow-auto rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] text-sm shadow-sm">
          {searchHits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-2 border-b border-[var(--color-panel-border)] px-3 py-2 text-left last:border-0 hover:bg-brand-500/10"
                onClick={() => pickProduct(p)}
              >
                <span>
                  <span className="font-medium text-ink">{p.name}</span>
                  {(p.barcode || p.sku) && (
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {[p.barcode, p.sku].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {formatMoney(p.price, currency)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 ? (
        <div className="max-h-[min(50vh,360px)] overflow-auto rounded-xl border border-[var(--color-panel-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-panel)] text-left text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="w-20 px-2 py-2 font-medium">Cant.</th>
                <th className="w-28 px-2 py-2 font-medium">Costo</th>
                <th className="w-28 px-2 py-2 font-medium">Venta</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const isLinkTarget = linkLineKey === l.key;
                const editableName = l.isNew || l.pendingLink;
                return (
                  <tr
                    key={l.key}
                    className={`border-t border-[var(--color-panel-border)] ${
                      l.pendingLink
                        ? isLinkTarget
                          ? "bg-amber-100/80 dark:bg-amber-950/40"
                          : "bg-amber-50/60 dark:bg-amber-950/20"
                        : ""
                    }`}
                    onClick={() => {
                      if (l.pendingLink) setLinkLineKey(l.key);
                    }}
                  >
                    <td className="px-3 py-2">
                      {editableName ? (
                        <div>
                          <input
                            type="text"
                            className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1.5 text-sm"
                            placeholder="Nombre del producto"
                            value={l.name}
                            onChange={(e) => updateLine(l.key, { name: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                          />
                          {l.pendingLink && (
                            <div className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                              {isLinkTarget
                                ? "Buscá arriba o escaneá para vincular al catálogo"
                                : "Tocá para vincular con tu catálogo (opcional)"}
                            </div>
                          )}
                          {l.supplierCode && (
                            <div className="mt-0.5 text-xs text-ink-muted">
                              Ref. proveedor: {l.supplierCode}
                            </div>
                          )}
                          {l.barcode && !l.productId && (
                            <div className="mt-0.5 text-xs text-ink-muted">Cód. {l.barcode}</div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-ink">{l.name}</div>
                          {l.barcode && (
                            <div className="text-xs text-ink-muted">{l.barcode}</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <NumericField
                        className="w-full px-2 py-1.5"
                        value={l.qty}
                        min={0.001}
                        onChange={(v) => updateLine(l.key, { qty: v })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <NumericField
                        className="w-full px-2 py-1.5"
                        value={l.unitCost}
                        min={0}
                        onChange={(v) => updateLine(l.key, { unitCost: v })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <NumericField
                        className="w-full px-2 py-1.5"
                        value={l.salePrice}
                        min={0}
                        onChange={(v) => updateLine(l.key, { salePrice: v })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLine(l.key);
                        }}
                        aria-label="Quitar línea"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--color-panel-border)] px-4 py-10 text-center text-sm text-ink-muted">
          <PackagePlus size={28} className="mx-auto mb-2 opacity-50" />
          Buscá un producto, escaneá o tocá «Agregar línea»
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button onClick={() => void handleConfirm()} disabled={busy || lines.length === 0}>
          {busy ? "Guardando…" : "Confirmar ingreso"}
        </Button>
      </div>
    </Modal>
  );
}
