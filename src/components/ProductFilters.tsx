import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Select } from "./ui";
import type { Brand, Category, Supplier } from "../types";
import { useIsMobile } from "../hooks/useIsMobile";

/** Valor especial: productos sin categoría / marca / proveedor. */
export const FILTER_NONE = -1;

export interface CatalogFilterValues {
  categoryId: number | "";
  brandId: number | "";
  supplierId: number | "";
}

interface Props {
  categories: Category[];
  brands: Brand[];
  suppliers: Supplier[];
  value: CatalogFilterValues;
  onChange: (v: CatalogFilterValues) => void;
  className?: string;
  showGoods?: boolean;
  /** En el celular los filtros quedan plegados detrás de «Filtrar». */
  collapseOnMobile?: boolean;
}

export default function ProductFilters({
  categories,
  brands,
  suppliers,
  value,
  onChange,
  className = "",
  showGoods = true,
  collapseOnMobile = true,
}: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  function set<K extends keyof CatalogFilterValues>(key: K, v: CatalogFilterValues[K]) {
    onChange({ ...value, [key]: v });
  }

  function parseId(raw: string): number | "" {
    if (raw === "") return "";
    return Number(raw);
  }

  if (collapseOnMobile && isMobile && !open) {
    const active = [value.categoryId, value.brandId, value.supplierId].filter((v) => v !== "").length;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
          active
            ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-200"
            : "border-[var(--color-panel-border)] text-ink-muted"
        } ${className}`}
      >
        <SlidersHorizontal size={16} />
        Filtrar{active ? ` (${active})` : ""}
      </button>
    );
  }

  return (
    <div className={`grid grid-cols-1 gap-3 ${showGoods ? "sm:grid-cols-3" : ""} ${className}`}>
      <Select
        label="Categoría"
        value={value.categoryId}
        onChange={(e) => set("categoryId", parseId(e.target.value))}
      >
        <option value="">Todas</option>
        <option value={FILTER_NONE}>Sin categoría</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {showGoods && (
      <>
      <Select
        label="Marca"
        value={value.brandId}
        onChange={(e) => set("brandId", parseId(e.target.value))}
      >
        <option value="">Todas</option>
        <option value={FILTER_NONE}>Sin marca</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Select
        label="Proveedor"
        value={value.supplierId}
        onChange={(e) => set("supplierId", parseId(e.target.value))}
      >
        <option value="">Todos</option>
        <option value={FILTER_NONE}>Sin proveedor</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      </>
      )}
    </div>
  );
}

export function toProductFilter(
  search: string,
  catalog: CatalogFilterValues,
  onlyLowStock?: boolean,
) {
  return {
    search,
    categoryId: catalog.categoryId === "" ? undefined : catalog.categoryId,
    brandId: catalog.brandId === "" ? undefined : catalog.brandId,
    supplierId: catalog.supplierId === "" ? undefined : catalog.supplierId,
    onlyLowStock,
  };
}
