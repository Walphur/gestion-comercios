import { useEffect, useState } from "react";
import { Modal, Input, Select, Button } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { createProduct, updateProduct } from "../db/products";
import type { Category, Product, ProductInput } from "../types";

interface Props {
  open: boolean;
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY: ProductInput = {
  sku: "",
  barcode: "",
  name: "",
  description: "",
  category_id: null,
  cost: 0,
  price: 0,
  stock: 0,
  min_stock: 0,
  unit: "unidad",
  tax_rate: 21,
};

export default function ProductForm({ open, product, categories, onClose, onSaved }: Props) {
  const { rubroDef } = useAppConfig();
  const fields = rubroDef.fields;
  const [form, setForm] = useState<ProductInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (product) {
      setForm({
        sku: product.sku ?? "",
        barcode: product.barcode ?? "",
        name: product.name,
        description: product.description ?? "",
        category_id: product.category_id,
        cost: product.cost,
        price: product.price,
        stock: product.stock,
        min_stock: product.min_stock,
        unit: product.unit,
        tax_rate: product.tax_rate,
      });
    } else {
      setForm({ ...EMPTY, unit: rubroDef.units[0] ?? "unidad" });
    }
    setError("");
  }, [product, open, rubroDef]);

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const margin =
    form.cost > 0 ? (((form.price - form.cost) / form.cost) * 100).toFixed(1) : "—";

  async function handleSave() {
    if (!form.name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      if (product) await updateProduct(product.id, form);
      else await createProduct(form);
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={product ? "Editar producto" : "Nuevo producto"} onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="Nombre del producto *"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Ej: Coca Cola 500ml"
            autoFocus
          />
        </div>

        {fields.barcode && (
          <Input
            label="Código de barras"
            value={form.barcode ?? ""}
            onChange={(e) => set("barcode", e.target.value)}
            placeholder="Escaneá o escribí el código"
          />
        )}
        {fields.sku && (
          <Input
            label="SKU / Código interno"
            value={form.sku ?? ""}
            onChange={(e) => set("sku", e.target.value)}
          />
        )}

        {fields.category && (
          <Select
            label="Categoría"
            value={form.category_id ?? ""}
            onChange={(e) => set("category_id", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}

        {fields.unitMeasure && (
          <Select label="Unidad de medida" value={form.unit} onChange={(e) => set("unit", e.target.value)}>
            {rubroDef.units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        )}

        <Input
          label="Costo"
          type="number"
          step="0.01"
          value={form.cost}
          onChange={(e) => set("cost", Number(e.target.value))}
        />
        <Input
          label={`Precio de venta (margen: ${margin}%)`}
          type="number"
          step="0.01"
          value={form.price}
          onChange={(e) => set("price", Number(e.target.value))}
        />

        <Input
          label="Stock actual"
          type="number"
          step="0.001"
          value={form.stock}
          onChange={(e) => set("stock", Number(e.target.value))}
        />
        <Input
          label="Stock mínimo (alerta)"
          type="number"
          step="0.001"
          value={form.min_stock}
          onChange={(e) => set("min_stock", Number(e.target.value))}
        />

        <Input
          label="IVA (%)"
          type="number"
          step="0.01"
          value={form.tax_rate}
          onChange={(e) => set("tax_rate", Number(e.target.value))}
        />

        {fields.variants && (
          <div className="sm:col-span-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
            Las variantes de {rubroDef.variantAttributes.join(" / ")} se cargarán en la
            próxima etapa. Por ahora podés cargar el producto base.
          </div>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </Modal>
  );
}
