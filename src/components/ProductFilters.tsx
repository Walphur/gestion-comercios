import { Select } from "./ui";
import type { Brand, Category, Supplier } from "../types";

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
}

export default function ProductFilters({
  categories,
  brands,
  suppliers,
  value,
  onChange,
  className = "",
}: Props) {
  function set<K extends keyof CatalogFilterValues>(key: K, v: CatalogFilterValues[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${className}`}>
      <Select
        label="Categoría"
        value={value.categoryId}
        onChange={(e) =>
          set("categoryId", e.target.value === "" ? "" : Number(e.target.value))
        }
      >
        <option value="">Todas</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select
        label="Marca"
        value={value.brandId}
        onChange={(e) => set("brandId", e.target.value === "" ? "" : Number(e.target.value))}
      >
        <option value="">Todas</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Select
        label="Proveedor"
        value={value.supplierId}
        onChange={(e) =>
          set("supplierId", e.target.value === "" ? "" : Number(e.target.value))
        }
      >
        <option value="">Todos</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
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
