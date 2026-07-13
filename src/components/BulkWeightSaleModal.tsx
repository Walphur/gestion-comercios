import { useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { Button, Input, Modal } from "./ui";
import type { Product } from "../types";
import { formatMoney, formatQty } from "../lib/format";
import {
  pricePerKg,
  productSoldByWeight,
  qtyFromKg,
  qtyFromPesos,
  qtyInKg,
} from "../lib/weightSale";

type Mode = "pesos" | "peso";
type WeightInput = "kg" | "g";

interface Props {
  open: boolean;
  product: Product | null;
  currency: string;
  onClose: () => void;
  onConfirm: (qty: number) => void;
}

export default function BulkWeightSaleModal({
  open,
  product,
  currency,
  onClose,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<Mode>("pesos");
  const [weightInput, setWeightInput] = useState<WeightInput>("g");
  const [pesos, setPesos] = useState("");
  const [weight, setWeight] = useState("");

  const unit = product?.unit ?? "kg";
  const unitPrice = product?.price ?? 0;
  const perKg = product ? pricePerKg(unit, unitPrice) : 0;

  const qty = useMemo(() => {
    if (!product || !productSoldByWeight(unit)) return 0;
    if (mode === "pesos") {
      const p = parseFloat(pesos.replace(",", "."));
      if (!Number.isFinite(p) || p <= 0) return 0;
      return qtyFromPesos(unit, unitPrice, p);
    }
    const w = parseFloat(weight.replace(",", "."));
    if (!Number.isFinite(w) || w <= 0) return 0;
    if (weightInput === "g") {
      return qtyFromKg(unit, w / 1000);
    }
    return qtyFromKg(unit, w);
  }, [mode, pesos, weight, weightInput, product, unit, unitPrice]);

  const linePreview = unitPrice * qty;
  const kgEquiv = qtyInKg(unit, qty);

  function resetAndClose() {
    setPesos("");
    setWeight("");
    setMode("pesos");
    setWeightInput("g");
    onClose();
  }

  function handleConfirm() {
    if (qty <= 0) {
      alert("Ingresá un importe o un peso válido.");
      return;
    }
    onConfirm(qty);
    setPesos("");
    setWeight("");
    onClose();
  }

  if (!product) return null;

  return (
    <Modal open={open} title={`Venta a granel — ${product.name}`} onClose={resetAndClose}>
      <p className="mb-4 text-sm text-ink-muted">
        Precio: <strong>{formatMoney(unitPrice, currency)}</strong> por{" "}
        {unit === "g" || unit === "gramo" ? "gramo" : "kg"} ({formatMoney(perKg, currency)} / kg)
      </p>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("pesos")}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
            mode === "pesos"
              ? "border-brand-500 bg-brand-500/15 text-brand-800"
              : "border-[var(--color-panel-border)]"
          }`}
        >
          Por importe ($)
        </button>
        <button
          type="button"
          onClick={() => setMode("peso")}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
            mode === "peso"
              ? "border-brand-500 bg-brand-500/15 text-brand-800"
              : "border-[var(--color-panel-border)]"
          }`}
        >
          Por peso
        </button>
      </div>

      {mode === "pesos" ? (
        <Input
          label="El cliente paga (pesos)"
          type="number"
          min={0}
          value={pesos}
          onChange={(e) => setPesos(e.target.value)}
          placeholder="Ej. 8000"
          autoFocus
        />
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setWeightInput("g")}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                weightInput === "g" ? "border-brand-500 bg-brand-500/15" : ""
              }`}
            >
              Gramos
            </button>
            <button
              type="button"
              onClick={() => setWeightInput("kg")}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                weightInput === "kg" ? "border-brand-500 bg-brand-500/15" : ""
              }`}
            >
              Kilos
            </button>
          </div>
          <Input
            label={weightInput === "g" ? "Peso en gramos" : "Peso en kilos"}
            type="number"
            min={0}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder={weightInput === "g" ? "Ej. 3077" : "Ej. 3.077"}
            autoFocus
          />
        </div>
      )}

      {qty > 0 && (
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/80 p-3 text-sm dark:border-brand-800 dark:bg-brand-900/30">
          <p className="flex items-center gap-2 font-medium text-ink">
            <Scale size={16} className="text-brand-600" />
            Cantidad: {formatQty(qty)} {unit === "g" || unit === "gramo" ? "g" : "kg"}
          </p>
          <p className="mt-1 text-ink-muted">
            ≈ {formatQty(kgEquiv)} kg · Total línea: {formatMoney(linePreview, currency)}
          </p>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={resetAndClose}>
          Cancelar
        </Button>
        <Button onClick={handleConfirm} disabled={qty <= 0}>
          Agregar al carrito
        </Button>
      </div>
    </Modal>
  );
}
