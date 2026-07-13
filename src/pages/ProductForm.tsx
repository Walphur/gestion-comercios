import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal, Input, NumericField, NumericInput, Select, Button } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { createProduct, updateProduct } from "../db/products";
import { listVariants, saveProductVariants } from "../db/variants";
import { confirmDiscard, confirmDelete } from "../lib/confirm";
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

const variantCellClass =
  "w-full rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand-500";

function VariantPriceInput({
  value,
  placeholder,
  onChange,
}: {
  value: number | "";
  placeholder: string;
  onChange: (value: number | "") => void;
}) {
  const [text, setText] = useState(value === "" ? "" : String(value));

  useEffect(() => {
    setText(value === "" ? "" : String(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "" || /^-?\d*(?:[.,]\d*)?$/.test(next)) {
          setText(next);
          onChange(next === "" ? "" : Number(next.replace(",", ".")) || 0);
        }
      }}
      onBlur={() => {
        if (text.trim() === "") {
          onChange("");
          setText("");
        }
      }}
      className={variantCellClass}
    />
  );
}

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

  function formHasChanges(): boolean {
    if (product) {
      return (
        form.name !== product.name ||
        form.price !== product.price ||
        form.cost !== product.cost ||
        form.stock !== product.stock
      );
    }
    return (
      form.name.trim() !== "" ||
      form.price !== 0 ||
      form.cost !== 0 ||
      form.stock !== 0 ||
      (form.barcode ?? "").trim() !== ""
    );
  }

  function requestClose(): boolean {
    if (!formHasChanges()) return true;
    void confirmDiscard("¿Cerrar el formulario sin guardar?").then((ok) => {
      if (ok) onClose();
    });
    return false;
  }

  function addVariant() {
    setVariants((v) => [...v, emptyVariant(attrs)]);
  }
  async function removeVariant(idx: number) {
    const label = variants[idx]?.attributes
      ? Object.values(variants[idx].attributes).filter(Boolean).join(" / ") || `Variante ${idx + 1}`
      : `Variante ${idx + 1}`;
    if (!(await confirmDelete(label, "Se quita solo esta variante del producto."))) return;
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
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
      await new Promise((r) => requestAnimationFrame(r));
    }
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
    <Modal
      open={open}
      title={product ? "Editar producto" : "Nuevo producto"}
      onClose={onClose}
      onRequestClose={requestClose}
      wide
    >
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

        <NumericInput
          label="Costo"
          value={form.cost}
          onChange={(v) => set("cost", v)}
        />
        <NumericInput
          label={
            fields.unitMeasure && (form.unit === "kg" || form.unit === "kilogramo")
              ? `Precio de venta por kg (margen: ${margin}%)`
              : fields.unitMeasure && (form.unit === "g" || form.unit === "gramo")
                ? `Precio de venta por gramo (margen: ${margin}%)`
                : `Precio de venta (margen: ${margin}%)`
          }
          value={form.price}
          onChange={(v) => set("price", v)}
        />

        {!useVariants && (
          <>
            <NumericInput
              label="Stock actual"
              value={form.stock}
              onChange={(v) => set("stock", v)}
            />
            <Input
              label="Vencimiento (opcional)"
              type="date"
              value={form.expires_at?.slice(0, 10) ?? ""}
              onChange={(e) => set("expires_at", e.target.value || null)}
            />
            <NumericInput
              label="Stock mínimo (alerta)"
              value={form.min_stock}
              onChange={(v) => set("min_stock", v)}
            />
          </>
        )}

        <NumericInput
          label="IVA (%)"
          value={form.tax_rate}
          onChange={(v) => set("tax_rate", v)}
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
                        <VariantPriceInput
                          value={v.price}
                          placeholder={String(form.price)}
                          onChange={(val) => setVariantField(idx, "price", val)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumericField
                          value={v.stock}
                          onChange={(n) => setVariantField(idx, "stock", n)}
                          className="!rounded !border-slate-300 !px-2 !py-1"
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
        <Button variant="secondary" onClick={() => requestClose() && onClose()}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </Modal>
  );
}
