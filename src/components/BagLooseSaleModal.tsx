import { useMemo, useState } from "react";
import { Package, Scale } from "lucide-react";
import { Button, Input, Modal, SegmentToggle } from "./ui";
import type { Product } from "../types";
import { formatMoney, formatQty } from "../lib/format";
import {
  canSellBag,
  formatBagLooseStock,
  kgFromLoosePesos,
  looseSaleHint,
  previewLooseSale,
  productSellsLoose,
  roundBagLooseQty,
  type BagLooseMode,
} from "../lib/bagLoose";

type LooseInputMode = "pesos" | "peso";

interface Props {
  open: boolean;
  product: Product | null;
  currency: string;
  onClose: () => void;
  onConfirm: (mode: BagLooseMode, qty: number) => void;
}

export default function BagLooseSaleModal({
  open,
  product,
  currency,
  onClose,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<BagLooseMode>("bag");
  const [looseInput, setLooseInput] = useState<LooseInputMode>("pesos");
  const [kgText, setKgText] = useState("");
  const [pesosText, setPesosText] = useState("");

  const bagPrice = product?.price ?? 0;
  const loosePrice = product?.loose_price_per_kg ?? 0;
  const bagKg = product?.bag_kg ?? 0;
  const closed = product?.stock ?? 0;
  const openKg = product?.open_bag_kg ?? 0;

  const sellKg = useMemo(() => {
    if (looseInput === "pesos") {
      const p = parseFloat(pesosText.replace(",", "."));
      if (!Number.isFinite(p) || p <= 0) return 0;
      return kgFromLoosePesos(loosePrice, p);
    }
    const n = parseFloat(kgText.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return roundBagLooseQty(n);
  }, [looseInput, kgText, pesosText, loosePrice]);

  const loosePreview = useMemo(() => {
    if (!product || mode !== "loose") return null;
    return previewLooseSale(
      { closedBags: closed, openBagKg: openKg, bagKg },
      sellKg,
    );
  }, [product, mode, closed, openKg, bagKg, sellKg]);

  const bagOk = canSellBag(closed, 1);
  const stockLabel = product
    ? formatBagLooseStock(closed, openKg, formatQty)
    : "";

  function resetLooseFields() {
    setLooseInput("pesos");
    setKgText("");
    setPesosText("");
  }

  function resetAndClose() {
    setMode("bag");
    resetLooseFields();
    onClose();
  }

  function handleConfirm() {
    if (!product || !productSellsLoose(product)) return;
    if (mode === "bag") {
      if (!bagOk) {
        alert("No hay bolsas cerradas en stock.");
        return;
      }
      onConfirm("bag", 1);
      setMode("bag");
      resetLooseFields();
      onClose();
      return;
    }
    if (!(sellKg > 0) || !loosePreview?.ok) {
      alert(
        loosePreview?.error ??
          (looseInput === "pesos"
            ? "Ingresá un importe válido."
            : "Ingresá cuántos kilos vendés."),
      );
      return;
    }
    onConfirm("loose", sellKg);
    setMode("bag");
    resetLooseFields();
    onClose();
  }

  if (!product) return null;

  const hint =
    mode === "loose" && loosePreview
      ? looseSaleHint(loosePreview, formatQty)
      : null;

  return (
    <Modal open={open} title={product.name} onClose={resetAndClose}>
      <p className="mb-3 text-sm text-ink-muted">
        Stock: <strong className="text-ink">{stockLabel}</strong>
      </p>

      <div className="mb-4">
        <SegmentToggle
          value={mode === "bag"}
          onChange={(v) => {
            setMode(v ? "bag" : "loose");
            if (!v) resetLooseFields();
          }}
          onLabel="Bolsa"
          offLabel="Suelto"
          onActiveLabel="Bolsa"
          offActiveLabel="Suelto"
        />
      </div>

      {mode === "bag" ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-brand-200 bg-brand-50/80 p-3 text-sm dark:border-brand-800 dark:bg-brand-900/30">
            <p className="flex items-center gap-2 font-medium text-ink">
              <Package size={16} className="text-brand-600" />
              Precio bolsa: {formatMoney(bagPrice, currency)}
            </p>
            <p className="mt-1 text-ink-muted">
              Se descuenta 1 bolsa cerrada
              {bagKg > 0 ? ` (${formatQty(bagKg)} kg)` : ""}.
            </p>
          </div>
          {openKg > 1e-9 && bagOk ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Hay una bolsa abierta con {formatQty(openKg)} kg. Podés vender bolsa
              igual si hay cerradas.
            </p>
          ) : null}
          {!bagOk ? (
            <p className="text-sm text-danger">No hay bolsas cerradas para vender.</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Precio suelto:{" "}
            <strong className="text-ink">{formatMoney(loosePrice, currency)} / kg</strong>
            {bagKg > 0 ? (
              <>
                {" "}
                · Bolsa de {formatQty(bagKg)} kg
              </>
            ) : null}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLooseInput("pesos")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                looseInput === "pesos"
                  ? "border-brand-500 bg-brand-500/15 text-brand-800 dark:text-brand-200"
                  : "border-[var(--color-panel-border)]"
              }`}
            >
              Por importe ($)
            </button>
            <button
              type="button"
              onClick={() => setLooseInput("peso")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                looseInput === "peso"
                  ? "border-brand-500 bg-brand-500/15 text-brand-800 dark:text-brand-200"
                  : "border-[var(--color-panel-border)]"
              }`}
            >
              Por peso / kilos
            </button>
          </div>

          {looseInput === "pesos" ? (
            <Input
              label="El cliente paga (pesos)"
              type="number"
              min={0}
              value={pesosText}
              onChange={(e) => setPesosText(e.target.value)}
              placeholder="Ej. 8000"
              autoFocus
            />
          ) : (
            <Input
              label="Kilos"
              type="number"
              min={0}
              step="0.001"
              value={kgText}
              onChange={(e) => setKgText(e.target.value)}
              placeholder="Ej. 1,5"
              autoFocus
            />
          )}

          {sellKg > 0 && loosePreview ? (
            <div className="rounded-xl border border-brand-200 bg-brand-50/80 p-3 text-sm dark:border-brand-800 dark:bg-brand-900/30">
              <p className="flex items-center gap-2 font-medium text-ink">
                <Scale size={16} className="text-brand-600" />
                {formatQty(sellKg)} kg ·{" "}
                {formatMoney(loosePrice * sellKg, currency)}
              </p>
              {hint ? <p className="mt-1 text-ink-muted">{hint}</p> : null}
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={resetAndClose}>
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={
            mode === "bag"
              ? !bagOk
              : !(sellKg > 0) || !loosePreview?.ok
          }
        >
          Agregar al carrito
        </Button>
      </div>
    </Modal>
  );
}
