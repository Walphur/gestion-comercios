import { useState } from "react";
import { Percent, Trash2, Package, TrendingUp, DollarSign, Tags, Truck, Shirt, Scale, Star } from "lucide-react";
import { Button } from "./ui";
import {
  bulkAdjustCostsByIds,
  bulkAdjustPricesByIds,
  bulkAdjustStockByIds,
  bulkApplyMarginByIds,
  bulkDeleteProducts,
  bulkUpdateProductFieldsByIds,
} from "../db/products";
import { confirmAction } from "../lib/confirm";
import { formatDbError, isDbCorruptionError } from "../lib/dbError";
import type { Brand, Category, Supplier } from "../types";
import PercentPromptModal from "./PercentPromptModal";
import StockAdjustModal from "./StockAdjustModal";
import ProductBulkAssignModal, { type BulkAssignField } from "./ProductBulkAssignModal";
import { addPosFavorites } from "../db/posQuickPick";

interface Props {
  selectedIds: number[];
  categories: Category[];
  brands: Brand[];
  suppliers: Supplier[];
  units: string[];
  showUnit: boolean;
  onClear: () => void;
  onDone: () => void;
}

type PromptKind = "price" | "cost" | "margin" | null;

export default function ProductBulkBar({
  selectedIds,
  categories,
  brands,
  suppliers,
  units,
  showUnit,
  onClear,
  onDone,
}: Props) {
  const n = selectedIds.length;
  const [prompt, setPrompt] = useState<PromptKind>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [assignField, setAssignField] = useState<BulkAssignField | null>(null);

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

  function assignOptions(field: BulkAssignField) {
    if (field === "category") {
      return categories.map((c) => ({ value: String(c.id), label: c.name }));
    }
    if (field === "brand") {
      return brands.map((b) => ({ value: String(b.id), label: b.name }));
    }
    if (field === "supplier") {
      return suppliers.map((s) => ({ value: String(s.id), label: s.name }));
    }
    return units.map((u) => ({ value: u, label: u }));
  }

  async function applyAssign(field: BulkAssignField, raw: string | null) {
    const patch =
      field === "category"
        ? { category_id: raw == null ? null : Number(raw) }
        : field === "brand"
          ? { brand_id: raw == null ? null : Number(raw) }
          : field === "supplier"
            ? { supplier_id: raw == null ? null : Number(raw) }
            : { unit: raw ?? "" };
    await wrapDb(
      () => bulkUpdateProductFieldsByIds(selectedIds, patch),
      (u) => `${u} producto(s) actualizado(s).`,
    );
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
        <Button variant="secondary" onClick={() => setAssignField("category")}>
          <Tags size={16} /> Categoría
        </Button>
        <Button variant="secondary" onClick={() => setAssignField("brand")}>
          <Shirt size={16} /> Marca
        </Button>
        <Button variant="secondary" onClick={() => setAssignField("supplier")}>
          <Truck size={16} /> Proveedor
        </Button>
        {showUnit && (
          <Button variant="secondary" onClick={() => setAssignField("unit")}>
            <Scale size={16} /> Unidad
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() =>
            void wrapDb(
              () => addPosFavorites(selectedIds).then(() => selectedIds.length),
              (u) => `${u} producto(s) en favoritos del POS.`,
            )
          }
        >
          <Star size={16} /> Favorito POS
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

      <ProductBulkAssignModal
        open={assignField !== null}
        field={assignField}
        productCount={n}
        options={assignField ? assignOptions(assignField) : []}
        onClose={() => setAssignField(null)}
        onConfirm={(value) => {
          if (assignField) void applyAssign(assignField, value);
        }}
      />
    </>
  );
}
