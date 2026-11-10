import { useState } from "react";
import { Percent, Trash2, Package, TrendingUp, DollarSign, Tags, Truck, Shirt, Scale, Star, Printer, Globe } from "lucide-react";
import { Button } from "./ui";
import {
  bulkAdjustCostsByIds,
  bulkAdjustPricesByIds,
  bulkAdjustStockByIds,
  bulkApplyMarginByIds,
  bulkDeleteProducts,
  bulkSetShowOnMenuByFilter,
  bulkSetShowOnMenuByIds,
  bulkUpdateProductFieldsByIds,
  getProduct,
  type ProductFilter,
} from "../db/products";
import { confirmAction } from "../lib/confirm";
import { formatDbError, formatProductDeleteError } from "../lib/dbError";
import type { Brand, Category, Supplier } from "../types";
import PercentPromptModal from "./PercentPromptModal";
import StockAdjustModal from "./StockAdjustModal";
import ProductBulkAssignModal, { type BulkAssignField } from "./ProductBulkAssignModal";
import { addPosFavorites } from "../db/posQuickPick";
import { printProductLabels } from "../lib/prints/productLabels";
import { useAppConfig } from "../context/AppConfig";
import { showUserError } from "../lib/notice";

interface Props {
  selectedIds: number[];
  categories: Category[];
  brands: Brand[];
  suppliers: Supplier[];
  units: string[];
  showUnit: boolean;
  /** Precio %, Costo % y Margen %. */
  priceTools: boolean;
  labels: boolean;
  /** Mostrar/sacar de la tienda web (rubro con tienda y plan que la incluye). */
  webStore?: boolean;
  /** Toda la página está elegida y el filtro tiene más productos: se puede aplicar a todos. */
  filterScope?: { count: number; filter: ProductFilter } | null;
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
  priceTools,
  labels,
  webStore = false,
  filterScope = null,
  onClear,
  onDone,
}: Props) {
  const { currency, rubroDef } = useAppConfig();
  const webNoun = rubroDef.id === "gastronomia" ? "carta" : "tienda";
  const n = selectedIds.length;
  const [prompt, setPrompt] = useState<PromptKind>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [assignField, setAssignField] = useState<BulkAssignField | null>(null);
  const [webOpen, setWebOpen] = useState(false);
  const [webAllFiltered, setWebAllFiltered] = useState(false);

  if (n === 0) return null;

  async function applyWeb(show: boolean) {
    const scope = webAllFiltered ? filterScope : null;
    setWebOpen(false);
    setWebAllFiltered(false);
    await wrapDb(
      () =>
        scope
          ? bulkSetShowOnMenuByFilter(scope.filter, show)
          : bulkSetShowOnMenuByIds(selectedIds, show),
      (u) =>
        u === 0
          ? show
            ? `Ya estaban en la ${webNoun} web.`
            : `Ya estaban fuera de la ${webNoun} web.`
          : show
            ? `${u} producto(s) ahora se muestran en la ${webNoun} web.`
            : `${u} producto(s) ya no se muestran en la ${webNoun} web.`,
    );
  }

  async function wrapDb<T>(fn: () => Promise<T>, okMsg: (r: T) => string) {
    try {
      const r = await fn();
      alert(okMsg(r));
      onDone();
    } catch (e) {
      alert(formatDbError(e));
    }
  }

  async function printLabels() {
    try {
      const products = (
        await Promise.all(selectedIds.map((id) => getProduct(id)))
      ).filter((p): p is NonNullable<typeof p> => p != null);
      await printProductLabels(products, currency);
    } catch (e) {
      showUserError(e);
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
      alert(formatProductDeleteError(e));
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-400/50 bg-brand-500/10 px-4 py-3">
        <span className="mr-2 text-sm font-semibold text-ink">
          {n} seleccionado{n === 1 ? "" : "s"}
        </span>
        {priceTools && (
          <>
            <Button variant="secondary" onClick={() => setPrompt("price")}>
              <Percent size={16} /> Precio %
            </Button>
            <Button variant="secondary" onClick={() => setPrompt("cost")}>
              <DollarSign size={16} /> Costo %
            </Button>
            <Button variant="secondary" onClick={() => setPrompt("margin")}>
              <TrendingUp size={16} /> Margen %
            </Button>
          </>
        )}
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
        {labels && (
          <Button variant="secondary" onClick={() => printLabels()}>
            <Printer size={16} /> Etiquetas
          </Button>
        )}
        {webStore && (
          <Button variant="secondary" onClick={() => setWebOpen((v) => !v)} aria-expanded={webOpen}>
            <Globe size={16} /> {webNoun === "carta" ? "Carta web" : "Tienda web"}
          </Button>
        )}
        <Button variant="secondary" onClick={() => runDelete()} className="text-red-600">
          <Trash2 size={16} /> Eliminar
        </Button>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-sm text-ink-muted hover:text-ink"
        >
          Deseleccionar
        </button>
        {webStore && webOpen && (
          <div
            className="flex w-full min-w-0 flex-wrap items-center gap-2 border-t border-brand-400/30 pt-2"
            data-testid="bulk-web-store"
          >
            <span className="min-w-0 text-sm text-ink">
              ¿Se ven en tu {webNoun} de walqo.pro?
            </span>
            <Button variant="secondary" onClick={() => applyWeb(true)}>
              Mostrar
            </Button>
            <Button variant="secondary" onClick={() => applyWeb(false)}>
              Sacar de la {webNoun}
            </Button>
            {filterScope ? (
              <label className="inline-flex min-w-0 cursor-pointer items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--color-panel-border)]"
                  checked={webAllFiltered}
                  onChange={(e) => setWebAllFiltered(e.target.checked)}
                />
                Aplicar a los {filterScope.count.toLocaleString("es-AR")} de la lista (todas las páginas)
              </label>
            ) : null}
          </div>
        )}
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
