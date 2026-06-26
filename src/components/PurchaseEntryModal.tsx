import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Barcode, PackagePlus, Trash2 } from "lucide-react";
import { Modal, Button, Input, NumericField } from "./ui";
import { findByBarcode, getBarcodeQuantityFactor } from "../db/products";
import { applyPurchaseEntry } from "../db/purchaseEntry";
import { formatDbError } from "../lib/dbError";
import { formatMoney } from "../lib/format";
import { FACTURA_IA_URL } from "../config/support";
import { openExternalUrl } from "../lib/openExternal";
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
}

let lineKey = 0;
function nextKey() {
  lineKey += 1;
  return `pl-${lineKey}`;
}

function priceFromCost(cost: number, marginPct: number): number {
  if (cost <= 0) return 0;
  return Math.round(cost * (1 + marginPct / 100) * 100) / 100;
}

function productToLine(p: Product, qty: number, marginPct: number): DraftLine {
  return {
    key: nextKey(),
    productId: p.id,
    barcode: p.barcode ?? p.sku ?? undefined,
    name: p.name,
    qty,
    unitCost: p.cost,
    salePrice: p.price > 0 ? p.price : priceFromCost(p.cost, marginPct),
    isNew: false,
  };
}

export default function PurchaseEntryModal({
  open,
  onClose,
  onDone,
  userId,
  currency,
}: Props) {
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [scan, setScan] = useState("");
  const [marginPct, setMarginPct] = useState(30);
  const [supplierNote, setSupplierNote] = useState("");
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setLines([]);
    setScan("");
    setSupplierNote("");
    setMarginPct(30);
  }, []);

  useEffect(() => {
    if (open) {
      reset();
      setTimeout(() => scanRef.current?.focus(), 80);
    }
  }, [open, reset]);

  function applyMarginToAll(pct: number) {
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        salePrice: l.unitCost > 0 ? priceFromCost(l.unitCost, pct) : l.salePrice,
      })),
    );
  }

  async function handleScanEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !scan.trim()) return;
    e.preventDefault();
    const code = scan.trim();
    setScan("");

    const factor = await getBarcodeQuantityFactor(code);
    const product = await findByBarcode(code);

    if (product) {
      setLines((prev) => {
        const idx = prev.findIndex((l) => l.productId === product.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], qty: copy[idx].qty + factor };
          return copy;
        }
        return [...prev, productToLine(product, factor, marginPct)];
      });
    } else {
      setLines((prev) => [
        ...prev,
        {
          key: nextKey(),
          barcode: code,
          name: "",
          qty: factor,
          unitCost: 0,
          salePrice: 0,
          isNew: true,
        },
      ]);
    }
    scanRef.current?.focus();
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if ("unitCost" in patch && patch.unitCost != null) {
          next.salePrice = priceFromCost(patch.unitCost, marginPct);
        }
        return next;
      }),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function handleConfirm() {
    if (lines.length === 0) {
      alert("Escaneá o cargá al menos un producto.");
      return;
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

  return (
    <Modal open={open} title="Ingreso por factura de compra" onClose={onClose} wide>
      <p className="mb-4 text-sm text-ink-muted">
        Escaneá con el lector o escribí el código y Enter. Si el producto no existe, completá nombre,
        costo y precio. Al confirmar se suma stock y se actualizan costos y precios de venta.{" "}
        <button
          type="button"
          className="text-brand-600 underline hover:text-brand-500 dark:text-brand-300"
          onClick={() => void openExternalUrl(FACTURA_IA_URL)}
        >
          ¿Tenés foto de factura? Usá Factura con IA (web)
        </button>
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input
          label="Proveedor / nota (opcional)"
          placeholder="Ej. Coca-Cola, factura 12345"
          value={supplierNote}
          onChange={(e) => setSupplierNote(e.target.value)}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-muted">
            Margen sobre costo (%)
          </span>
          <NumericField
            className="w-full"
            value={marginPct}
            min={0}
            onChange={(v) => {
              setMarginPct(v);
              applyMarginToAll(v);
            }}
          />
        </label>
        <div className="flex items-end">
          <p className="text-sm text-ink-muted">
            Total costo: <strong className="text-ink">{formatMoney(totalCost, currency)}</strong>
          </p>
        </div>
      </div>

      <div className="relative mb-4">
        <Barcode
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-500"
        />
        <input
          ref={scanRef}
          type="text"
          className="w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-3 pl-10 pr-3 text-sm text-ink outline-none focus:border-brand-500"
          placeholder="Escaneá o escribí código de barras · Enter para agregar"
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={(e) => void handleScanEnter(e)}
          disabled={busy}
        />
      </div>

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
              {lines.map((l) => (
                <tr key={l.key} className="border-t border-[var(--color-panel-border)]">
                  <td className="px-3 py-2">
                    {l.isNew ? (
                      <input
                        type="text"
                        className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1.5 text-sm"
                        placeholder="Nombre del producto"
                        value={l.name}
                        onChange={(e) => updateLine(l.key, { name: e.target.value })}
                        autoFocus={l.isNew && !l.name}
                      />
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
                      onClick={() => removeLine(l.key)}
                      aria-label="Quitar línea"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--color-panel-border)] px-4 py-10 text-center text-sm text-ink-muted">
          <PackagePlus size={28} className="mx-auto mb-2 opacity-50" />
          Escaneá el primer producto de la factura
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
