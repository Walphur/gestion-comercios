import { Percent, Trash2, Package, TrendingUp, DollarSign } from "lucide-react";
import { Button } from "./ui";
import {
  bulkAdjustCostsByIds,
  bulkAdjustPricesByIds,
  bulkAdjustStockByIds,
  bulkApplyMarginByIds,
  bulkDeleteProducts,
} from "../db/products";
import { confirmAction } from "../lib/confirm";

interface Props {
  selectedIds: number[];
  onClear: () => void;
  onDone: () => void;
}

export default function ProductBulkBar({ selectedIds, onClear, onDone }: Props) {
  const n = selectedIds.length;
  if (n === 0) return null;

  async function runPricePct() {
    const input = prompt(`Ajustar precio de venta en % para ${n} producto(s) (ej: 10 o -5):`);
    if (input === null) return;
    const pct = Number(input);
    if (Number.isNaN(pct)) return alert("Valor inválido");
    const updated = await bulkAdjustPricesByIds(pct, selectedIds);
    alert(`Precios actualizados en ${updated} producto(s).`);
    onDone();
  }

  async function runCostPct() {
    const input = prompt(`Ajustar costo en % para ${n} producto(s):`);
    if (input === null) return;
    const pct = Number(input);
    if (Number.isNaN(pct)) return alert("Valor inválido");
    const updated = await bulkAdjustCostsByIds(pct, selectedIds);
    alert(`Costos actualizados en ${updated} producto(s).`);
    onDone();
  }

  async function runMargin() {
    const input = prompt(
      `Margen de ganancia % sobre el costo (precio = costo + margen). Ej: 30 para ${n} producto(s):`,
    );
    if (input === null) return;
    const pct = Number(input);
    if (Number.isNaN(pct)) return alert("Valor inválido");
    const updated = await bulkApplyMarginByIds(pct, selectedIds);
    alert(`Precios recalculados en ${updated} producto(s) (solo con costo > 0).`);
    onDone();
  }

  async function runStock() {
    const modeAns = prompt(
      `Stock para ${n} producto(s):\n- Escribí un número para SUMAR unidades (ej: 10)\n- O "fijo 25" para dejar stock en 25`,
    );
    if (modeAns === null) return;
    const fixed = modeAns.trim().toLowerCase().match(/^fijo\s+(-?\d+(?:\.\d+)?)/);
    let updated: number;
    if (fixed) {
      const val = Number(fixed[1]);
      if (Number.isNaN(val)) return alert("Valor inválido");
      updated = await bulkAdjustStockByIds(selectedIds, "set", val);
    } else {
      const val = Number(modeAns.trim());
      if (Number.isNaN(val)) return alert("Valor inválido");
      updated = await bulkAdjustStockByIds(selectedIds, "add", val);
    }
    alert(`Stock actualizado en ${updated} producto(s).`);
    onDone();
  }

  async function runDelete() {
    if (
      !(await confirmAction({
        title: "Eliminar en lote",
        message: `¿Eliminar ${n} producto(s) seleccionado(s)?`,
        detail: "Esta acción no se puede deshacer.",
        variant: "danger",
        confirmLabel: "Sí, eliminar",
      }))
    ) {
      return;
    }
    const updated = await bulkDeleteProducts(selectedIds);
    alert(`Se eliminaron ${updated} producto(s).`);
    onDone();
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-400/50 bg-brand-500/10 px-4 py-3">
      <span className="mr-2 text-sm font-semibold text-ink">
        {n} seleccionado{n === 1 ? "" : "s"}
      </span>
      <Button variant="secondary" onClick={() => void runPricePct()}>
        <Percent size={16} /> Precio %
      </Button>
      <Button variant="secondary" onClick={() => void runCostPct()}>
        <DollarSign size={16} /> Costo %
      </Button>
      <Button variant="secondary" onClick={() => void runMargin()}>
        <TrendingUp size={16} /> Margen %
      </Button>
      <Button variant="secondary" onClick={() => void runStock()}>
        <Package size={16} /> Stock
      </Button>
      <Button variant="secondary" onClick={() => void runDelete()} className="text-red-600">
        <Trash2 size={16} /> Eliminar
      </Button>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-sm text-ink-muted hover:text-ink"
      >
        Deseleccionar
      </button>
    </div>
  );
}
