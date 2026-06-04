import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal, Input, Select, Button } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { createProduct, updateProduct } from "../db/products";
import { listVariants, saveProductVariants } from "../db/variants";
import type { Brand, Category, Product, ProductInput, Supplier, VariantDraft } from "../types";

interface Props {
  open: boolean;
  product: Product | null;
  categories: Category[];
  brands: Brand[];
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY: ProductInput = {
  sku: "",
  barcode: "",
  name: "",
  description: "",
  category_id: null,
  brand_id: null,
  supplier_id: null,
  cost: 0,
  price: 0,
  stock: 0,
  min_stock: 0,
  unit: "unidad",
  tax_rate: 21,
  expires_at: null,
};

function emptyVariant(attrs: string[]): VariantDraft {
  return {
    attributes: Object.fromEntries(attrs.map((a) => [a, ""])),
    sku: "",
    barcode: "",
    price: "",
    stock: 0,
  };
}

export default function ProductForm({
  open,
  product,
  categories,
  brands,
  suppliers,
  onClose,
  onSaved,
}: Props) {
  const { rubroDef } = useAppConfig();
  const fields = rubroDef.fields;
  const attrs = rubroDef.variantAttributes;
  const [form, setForm] = useState<ProductInput>(EMPTY);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
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
        brand_id: product.brand_id ?? null,
        supplier_id: product.supplier_id ?? null,
        cost: product.cost,
        price: product.price,
        stock: product.stock,
        min_stock: product.min_stock,
        unit: product.unit,
        tax_rate: product.tax_rate,
        expires_at: product.expires_at ?? null,
      });
      if (fields.variants && product.has_variants) {
        listVariants(product.id).then((vs) =>
          setVariants(
            vs.map((v) => ({
              id: v.id,
              attributes: { ...Object.fromEntries(attrs.map((a) => [a, ""])), ...v.attributes },
              sku: v.sku ?? "",
              barcode: v.barcode ?? "",
              price: v.price ?? "",
              stock: v.stock,
            })),
          ),
        );
      } else {
        setVariants([]);
      }
    } else {
      setForm({ ...EMPTY, unit: rubroDef.units[0] ?? "unidad" });
      setVariants([]);
    }
    setError("");
  }, [product, open, rubroDef]);

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const useVariants = fields.variants;
  const margin = form.cost > 0 ? (((form.price - form.cost) / form.cost) * 100).toFixed(1) : "—";

  function addVariant() {
    setVariants((v) => [...v, emptyVariant(attrs)]);
  }
  function removeVariant(idx: number) {
    setVariants((v) => v.filter((_, i) => i !== idx));
  }
  function setVariantAttr(idx: number, attr: string, value: string) {
    setVariants((v) =>
      v.map((row, i) =>
        i === idx ? { ...row, attributes: { ...row.attributes, [attr]: value } } : row,
      ),
    );
  }
  function setVariantField(idx: number, key: "price" | "stock", value: number | "") {
    setVariants((v) => v.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const id = product ? (await updateProduct(product.id, form), product.id) : await createProduct(form);
      if (useVariants) {
        await saveProductVariants(id, variants);
      }
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
            placeholder="Ej: Remera lisa"
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
          <Input label="SKU / Código interno" value={form.sku ?? ""} onChange={(e) => set("sku", e.target.value)} />
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

        <Select
          label="Marca"
          value={form.brand_id ?? ""}
          onChange={(e) => set("brand_id", e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Sin marca</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>

        <Select
          label="Proveedor"
          value={form.supplier_id ?? ""}
          onChange={(e) => set("supplier_id", e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Sin proveedor</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>

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

        {!useVariants && (
          <>
            <Input
              label="Stock actual"
              type="number"
              step="0.001"
              value={form.stock}
              onChange={(e) => set("stock", Number(e.target.value))}
            />
            <Input
              label="Vencimiento (opcional)"
              type="date"
              value={form.expires_at?.slice(0, 10) ?? ""}
              onChange={(e) => set("expires_at", e.target.value || null)}
            />
            <Input
              label="Stock mínimo (alerta)"
              type="number"
              step="0.001"
              value={form.min_stock}
              onChange={(e) => set("min_stock", Number(e.target.value))}
            />
          </>
        )}

        <Input
          label="IVA (%)"
          type="number"
          step="0.01"
          value={form.tax_rate}
          onChange={(e) => set("tax_rate", Number(e.target.value))}
        />
      </div>

      {useVariants && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              Variantes ({attrs.join(" / ")})
            </h3>
            <Button variant="secondary" onClick={addVariant} className="px-3 py-1.5 text-xs">
              <Plus size={14} /> Agregar variante
            </Button>
          </div>

          {variants.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-400">
              Sin variantes. Agregá combinaciones de {attrs.join(" y ")} con su stock.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    {attrs.map((a) => (
                      <th key={a} className="px-3 py-2">
                        {a}
                      </th>
                    ))}
                    <th className="px-3 py-2 w-28">Precio</th>
                    <th className="px-3 py-2 w-24">Stock</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {variants.map((v, idx) => (
                    <tr key={idx}>
                      {attrs.map((a) => (
                        <td key={a} className="px-2 py-1.5">
                          <input
                            value={v.attributes[a] ?? ""}
                            onChange={(e) => setVariantAttr(idx, a, e.target.value)}
                            placeholder={a}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand-500"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={v.price}
                          placeholder={String(form.price)}
                          onChange={(e) =>
                            setVariantField(idx, "price", e.target.value === "" ? "" : Number(e.target.value))
                          }
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={v.stock}
                          onChange={(e) => setVariantField(idx, "stock", Number(e.target.value))}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand-500"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => removeVariant(idx)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-400">
            El stock total del producto se calcula sumando las variantes. Si dejás el precio vacío, se
            usa el precio general.
          </p>
        </div>
      )}

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
