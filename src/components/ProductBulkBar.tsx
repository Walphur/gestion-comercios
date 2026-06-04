import { useState } from "react";
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
import { formatDbError, isDbCorruptionError } from "../lib/dbError";
import PercentPromptModal from "./PercentPromptModal";
import StockAdjustModal from "./StockAdjustModal";

interface Props {
  selectedIds: number[];
  onClear: () => void;
  onDone: () => void;
}

type PromptKind = "price" | "cost" | "margin" | null;

export default function ProductBulkBar({ selectedIds, onClear, onDone }: Props) {
  const n = selectedIds.length;
  const [prompt, setPrompt] = useState<PromptKind>(null);
  const [stockOpen, setStockOpen] = useState(false);

  if (n === 0) return null;

  async function wrapDb<T>(fn: () => Promise<T>, okMsg: (r: T) => string) {
    try {
      const r = await fn();
      alert(okMsg(r));
      onDone();
    } catch (e) {
      alert(formatDbError(e));
    }
  }

  const promptConfig =
    prompt === "price"
      ? {
          title: "Ajustar precio de venta",
          description: `Porcentaje para ${n} producto(s). Ej: 10 sube 10%, -5 baja 5%.`,
          onConfirm: (pct: number) =>
            void wrapDb(
              () => bulkAdjustPricesByIds(pct, selectedIds),
              (u) => `Precios actualizados en ${u} producto(s).`,
            ),
        }
      : prompt === "cost"
        ? {
            title: "Ajustar costo",
            description: `Porcentaje de costo para ${n} producto(s).`,
            onConfirm: (pct: number) =>
              void wrapDb(
                () => bulkAdjustCostsByIds(pct, selectedIds),
                (u) => `Costos actualizados en ${u} producto(s).`,
              ),
          }
        : prompt === "margin"
          ? {
              title: "Aplicar margen",
              description: `Margen % sobre el costo (precio = costo + margen) para ${n} producto(s). Solo artículos con costo > 0.`,
              onConfirm: (pct: number) =>
                void wrapDb(
                  () => bulkApplyMarginByIds(pct, selectedIds),
                  (u) => `Precios recalculados en ${u} producto(s).`,
                ),
            }
          : null;

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
    try {
      const updated = await bulkDeleteProducts(selectedIds);
      alert(`Se eliminaron ${updated} producto(s).`);
      onDone();
    } catch (e) {
      alert(formatDbError(e));
      if (isDbCorruptionError(e)) return;
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-400/50 bg-brand-500/10 px-4 py-3">
        <span className="mr-2 text-sm font-semibold text-ink">
          {n} seleccionado{n === 1 ? "" : "s"}
        </span>
        <Button variant="secondary" onClick={() => setPrompt("price")}>
          <Percent size={16} /> Precio %
        </Button>
        <Button variant="secondary" onClick={() => setPrompt("cost")}>
          <DollarSign size={16} /> Costo %
        </Button>
        <Button variant="secondary" onClick={() => setPrompt("margin")}>
          <TrendingUp size={16} /> Margen %
        </Button>
        <Button variant="secondary" onClick={() => setStockOpen(true)}>
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

      {promptConfig && (
        <PercentPromptModal
          open={prompt !== null}
          title={promptConfig.title}
          description={promptConfig.description}
          onClose={() => setPrompt(null)}
          onConfirm={promptConfig.onConfirm}
        />
      )}

      <StockAdjustModal
        open={stockOpen}
        productCount={n}
        onClose={() => setStockOpen(false)}
        onConfirm={(mode, value) =>
          void wrapDb(
            () => bulkAdjustStockByIds(selectedIds, mode, value),
            (u) => `Stock actualizado en ${u} producto(s).`,
          )
        }
      />
    </>
  );
}
