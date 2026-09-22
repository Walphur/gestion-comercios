import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { Modal, Input, NumericField, NumericInput, Select, Button } from "../components/ui";
import ProductThumb from "../components/ProductThumb";
import { useAppConfig } from "../context/AppConfig";
import { createProduct, listProducts, updateProduct } from "../db/products";
import { listVariants, saveProductVariants } from "../db/variants";
import { listProductBatches, saveProductBatches, type BatchDraft } from "../db/batches";
import { listKitComponents, saveProductKit, type KitComponentDraft } from "../db/kits";
import {
  listProductModifiers,
  saveProductModifiers,
  type ModifierDraft,
} from "../db/modifiers";
import {
  pickAndPreviewProductImage,
  removeProductImageFile,
  saveProductImageFile,
} from "../lib/productImages";
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
  track_batches: false,
  scale_plu: "",
  image_path: null,
  is_kit: false,
  is_daily_menu: false,
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
  const [batches, setBatches] = useState<BatchDraft[]>([]);
  const [kitItems, setKitItems] = useState<KitComponentDraft[]>([]);
  const [modifiers, setModifiers] = useState<ModifierDraft[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [kitSearch, setKitSearch] = useState("");
  const [pendingImageSource, setPendingImageSource] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [marginEdit, setMarginEdit] = useState<number | "">("");

  useEffect(() => {
    if (!open) return;
    void listProducts({ limit: 2000 })
      .then(setCatalog)
      .catch(console.error);
  }, [open]);

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
        track_batches: Boolean(product.track_batches),
        scale_plu: product.scale_plu ?? "",
        image_path: product.image_path ?? null,
        is_kit: Boolean(product.is_kit),
        is_daily_menu: Boolean(product.is_daily_menu),
      });
      setPendingImageSource(null);
      setImagePreview(null);
      setRemoveImage(false);
      if (product.cost > 0) {
        setMarginEdit(Math.round(((product.price - product.cost) / product.cost) * 1000) / 10);
      } else {
        setMarginEdit("");
      }
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
      if (fields.batches) {
        listProductBatches(product.id).then((rows) =>
          setBatches(
            rows.map((b) => ({
              id: b.id,
              lot_code: b.lot_code ?? "",
              expires_at: b.expires_at?.slice(0, 10) ?? "",
              qty: b.qty,
            })),
          ),
        );
      } else {
        setBatches([]);
      }
      void listKitComponents(product.id).then(setKitItems).catch(() => setKitItems([]));
      void listProductModifiers(product.id)
        .then((rows) =>
          setModifiers(rows.map((m) => ({ id: m.id, name: m.name, price_delta: m.price_delta }))),
        )
        .catch(() => setModifiers([]));
    } else {
      setForm({
        ...EMPTY,
        unit: rubroDef.units[0] ?? "unidad",
        track_batches: fields.batches,
      });
      setVariants([]);
      setBatches([]);
      setKitItems([]);
      setModifiers([]);
      setPendingImageSource(null);
      setImagePreview(null);
      setRemoveImage(false);
      setMarginEdit("");
    }
    setError("");
    setKitSearch("");
  }, [product, open, rubroDef, fields.batches, fields.variants, attrs]);

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const isKit = Boolean(form.is_kit);
  const useVariants = fields.variants && !isKit;
  const useBatches = fields.batches && Boolean(form.track_batches) && !isKit;
  const batchStock = batches.reduce((acc, b) => acc + (Number(b.qty) || 0), 0);

  const kitCandidates = useMemo(() => {
    const q = kitSearch.trim().toLowerCase();
    return catalog
      .filter((p) => p.active !== 0)
      .filter((p) => !p.is_kit)
      .filter((p) => !product || p.id !== product.id)
      .filter((p) => !kitItems.some((k) => k.component_product_id === p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.barcode ?? "").includes(q))
      .slice(0, 12);
  }, [catalog, kitItems, kitSearch, product]);

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
    if (isKit && kitItems.length === 0) {
      setError("Un combo necesita al menos un componente.");
      return;
    }
    setSaving(true);
    try {
      let imagePath = removeImage ? null : (form.image_path ?? null);
      const payload: ProductInput = {
        ...form,
        stock: isKit ? 0 : useBatches ? batchStock : form.stock,
        expires_at: fields.expiry && !isKit ? form.expires_at : null,
        track_batches: fields.batches && !isKit ? Boolean(form.track_batches) : false,
        scale_plu: fields.scalePlu ? form.scale_plu?.trim() || null : null,
        is_kit: isKit,
        image_path: imagePath,
      };
      const id = product
        ? (await updateProduct(product.id, payload), product.id)
        : await createProduct(payload);

      if (pendingImageSource) {
        imagePath = await saveProductImageFile(id, pendingImageSource);
        await updateProduct(id, { ...payload, image_path: imagePath });
      } else if (removeImage && product) {
        await removeProductImageFile(product.id);
        await updateProduct(id, { ...payload, image_path: null });
      }

      if (useVariants) {
        await saveProductVariants(id, variants);
      }
      if (fields.batches && !isKit) {
        await saveProductBatches(id, Boolean(payload.track_batches), batches);
      }
      await saveProductKit(
        id,
        isKit
          ? kitItems.map((k) => ({
              component_product_id: k.component_product_id,
              qty: k.qty,
            }))
          : [],
      );
      await saveProductModifiers(id, modifiers);
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handlePickImage() {
    try {
      const picked = await pickAndPreviewProductImage();
      if (!picked) return;
      setPendingImageSource(picked.sourcePath);
      setImagePreview(picked.previewUrl);
      setRemoveImage(false);
    } catch (e) {
      setError(String(e));
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
      {!product && rubroDef.productFormHint ? (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-ink-muted dark:border-slate-700 dark:bg-slate-900/40">
          {rubroDef.productFormHint}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 flex flex-wrap items-start gap-4">
          <ProductThumb
            imagePath={removeImage ? null : form.image_path}
            previewUrl={imagePreview}
            alt={form.name}
            size="lg"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              label="Nombre del producto *"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={rubroDef.productNamePlaceholder ?? "Ej: Remera lisa"}
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" className="!py-1.5 text-sm" onClick={() => void handlePickImage()}>
                <ImagePlus size={16} /> {imagePreview || form.image_path ? "Cambiar foto" : "Agregar foto"}
              </Button>
              {(imagePreview || form.image_path) && !removeImage && (
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1.5 text-sm"
                  onClick={() => {
                    setPendingImageSource(null);
                    setImagePreview(null);
                    setRemoveImage(true);
                    set("image_path", null);
                  }}
                >
                  Quitar foto
                </Button>
              )}
            </div>
            <p className="text-xs text-ink-muted">PNG, JPG o WebP. Se ve en Productos y en el punto de venta.</p>
          </div>
        </div>

        <div className="sm:col-span-2 rounded-xl border border-[var(--color-panel-border)] px-3 py-2.5">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold text-ink">Es un combo / kit</span>
              <span className="text-xs text-ink-muted">
                Al vender, descuenta stock de los productos que lo componen (menú, pack, etc.).
              </span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={isKit}
              onChange={(e) => {
                set("is_kit", e.target.checked);
                if (e.target.checked) {
                  set("track_batches", false);
                  setVariants([]);
                }
              }}
            />
          </label>
        </div>

        <div className="sm:col-span-2 rounded-xl border border-[var(--color-panel-border)] px-3 py-2.5">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold text-ink">Menú del día</span>
              <span className="text-xs text-ink-muted">
                Se destaca arriba en el punto de venta para venderlo más rápido.
              </span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={Boolean(form.is_daily_menu)}
              onChange={(e) => set("is_daily_menu", e.target.checked)}
            />
          </label>
        </div>

        <div className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--color-panel-border)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">Extras / modificadores</p>
              <p className="text-xs text-ink-muted">
                Al vender en el POS se pueden sumar (ej. extra queso, papas, sin cebolla).
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="!px-2 !py-1 text-xs"
              onClick={() => setModifiers((m) => [...m, { name: "", price_delta: 0 }])}
            >
              <Plus size={14} /> Agregar
            </Button>
          </div>
          {modifiers.length === 0 ? (
            <p className="text-sm text-ink-muted">Sin extras. Opcional.</p>
          ) : (
            <ul className="space-y-2">
              {modifiers.map((m, idx) => (
                <li key={m.id ?? `new-${idx}`} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
                  <Input
                    label={idx === 0 ? "Nombre" : undefined}
                    value={m.name}
                    onChange={(e) =>
                      setModifiers((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)),
                      )
                    }
                    placeholder="Ej: Extra queso"
                  />
                  <NumericInput
                    label={idx === 0 ? "Precio +" : undefined}
                    value={m.price_delta}
                    onChange={(v) =>
                      setModifiers((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, price_delta: v } : r)),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="mb-0.5 rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => setModifiers((rows) => rows.filter((_, i) => i !== idx))}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {fields.barcode && (
          <Input
            label="Código de barras"
            value={form.barcode ?? ""}
            onChange={(e) => set("barcode", e.target.value)}
            placeholder="Escaneá o escribí el código"
          />
        )}
        {fields.scalePlu && (
          <Input
            label="PLU balanza"
            value={form.scale_plu ?? ""}
            onChange={(e) => set("scale_plu", e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="Mismo número que en Kretz"
            hint="Para etiquetas de balanza (formato 2-5-5). No reemplaza el código de barras del producto."
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
          onChange={(v) => {
            set("cost", v);
            if (v > 0 && marginEdit !== "") {
              const m = Number(marginEdit);
              if (Number.isFinite(m)) {
                set("price", Math.round(v * (1 + m / 100) * 100) / 100);
              }
            }
          }}
        />
        <NumericInput
          label="Margen % (sobre costo)"
          value={marginEdit === "" ? 0 : marginEdit}
          onChange={(v) => {
            setMarginEdit(v);
            if (form.cost > 0) {
              set("price", Math.round(form.cost * (1 + v / 100) * 100) / 100);
            }
          }}
        />
        <NumericInput
          label={
            fields.unitMeasure && (form.unit === "kg" || form.unit === "kilogramo")
              ? "Precio de venta por kg"
              : fields.unitMeasure && (form.unit === "g" || form.unit === "gramo")
                ? "Precio de venta por gramo"
                : "Precio de venta"
          }
          value={form.price}
          onChange={(v) => {
            set("price", v);
            if (form.cost > 0) {
              setMarginEdit(Math.round(((v - form.cost) / form.cost) * 1000) / 10);
            } else {
              setMarginEdit("");
            }
          }}
        />
        {form.cost > 0 && typeof form.price === "number" && (
          <p className="sm:col-span-2 -mt-2 text-xs text-ink-muted">
            Podés cargar el <strong>margen %</strong> o el <strong>precio de venta</strong>: se
            recalcula el otro. Margen actual:{" "}
            {(((form.price - form.cost) / form.cost) * 100).toFixed(1)}%.
          </p>
        )}

        {!useVariants && !isKit && (
          <>
            {!useBatches && (
              <NumericInput
                label="Stock actual"
                value={form.stock}
                onChange={(v) => set("stock", v)}
              />
            )}
            {useBatches && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                  Stock por lotes
                </p>
                <p className="mt-0.5 text-sm tabular-nums text-ink">
                  Total: <strong>{batchStock}</strong> (suma de lotes)
                </p>
              </div>
            )}
            {fields.expiry && (
              <Input
                label="Vencimiento (opcional)"
                type="date"
                value={form.expires_at?.slice(0, 10) ?? ""}
                onChange={(e) => set("expires_at", e.target.value || null)}
                hint={
                  fields.batches
                    ? "Vencimiento general del producto. También podés poner fecha por lote abajo."
                    : undefined
                }
              />
            )}
            <NumericInput
              label="Stock mínimo (alerta)"
              value={form.min_stock}
              onChange={(v) => set("min_stock", v)}
            />
          </>
        )}

        {isKit && (
          <div className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--color-panel-border)] p-3">
            <div>
              <p className="text-sm font-semibold text-ink">Componentes del combo</p>
              <p className="text-xs text-ink-muted">
                El stock del combo no se lleva aparte: se descuenta el de cada ítem al vender.
              </p>
            </div>
            {kitItems.length > 0 && (
              <ul className="space-y-2">
                {kitItems.map((k) => (
                  <li
                    key={k.component_product_id}
                    className="flex min-w-0 items-center gap-2 rounded-lg bg-[var(--color-input-bg)] px-2 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{k.name}</span>
                    <NumericField
                      value={k.qty}
                      onChange={(n) =>
                        setKitItems((rows) =>
                          rows.map((r) =>
                            r.component_product_id === k.component_product_id
                              ? { ...r, qty: Math.max(0.001, n || 1) }
                              : r,
                          ),
                        )
                      }
                      className="!w-20 !rounded !border-slate-300 !px-2 !py-1"
                    />
                    <button
                      type="button"
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() =>
                        setKitItems((rows) =>
                          rows.filter((r) => r.component_product_id !== k.component_product_id),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Input
              label="Buscar producto para agregar"
              value={kitSearch}
              onChange={(e) => setKitSearch(e.target.value)}
              placeholder="Nombre o código…"
            />
            {kitSearch.trim() && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--color-panel-border)]">
                {kitCandidates.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-ink-muted">Sin resultados</p>
                ) : (
                  kitCandidates.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 border-b border-[var(--color-panel-border)] px-3 py-2 text-left text-sm last:border-0 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                      onClick={() => {
                        setKitItems((rows) => [
                          ...rows,
                          { component_product_id: p.id, name: p.name, qty: 1 },
                        ]);
                        setKitSearch("");
                      }}
                    >
                      <span className="min-w-0 truncate text-ink">{p.name}</span>
                      <Plus size={14} className="shrink-0 text-brand-600" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {fields.batches && !useVariants && !isKit && (
          <div className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--color-panel-border)] p-3">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold text-ink">Controlar por lotes</span>
                <span className="text-xs text-ink-muted">
                  Ideal para farmacia: cada partida con código, cantidad y vencimiento (FIFO).
                </span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-600"
                checked={Boolean(form.track_batches)}
                onChange={(e) => {
                  set("track_batches", e.target.checked);
                  if (e.target.checked && batches.length === 0) {
                    setBatches([{ lot_code: "", expires_at: "", qty: form.stock || 0 }]);
                  }
                }}
              />
            </label>
            {useBatches && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Lotes</p>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-2 !py-1 text-xs"
                    onClick={() =>
                      setBatches((b) => [...b, { lot_code: "", expires_at: "", qty: 0 }])
                    }
                  >
                    <Plus size={14} /> Agregar lote
                  </Button>
                </div>
                {batches.map((b, idx) => (
                  <div
                    key={b.id ?? `new-${idx}`}
                    className="grid grid-cols-[1fr_8rem_6rem_auto] items-end gap-2"
                  >
                    <Input
                      label={idx === 0 ? "Código de lote" : undefined}
                      value={b.lot_code}
                      onChange={(e) =>
                        setBatches((rows) =>
                          rows.map((row, i) =>
                            i === idx ? { ...row, lot_code: e.target.value } : row,
                          ),
                        )
                      }
                      placeholder="Ej: Lote A-01"
                    />
                    <Input
                      label={idx === 0 ? "Vence" : undefined}
                      type="date"
                      value={b.expires_at}
                      onChange={(e) =>
                        setBatches((rows) =>
                          rows.map((row, i) =>
                            i === idx ? { ...row, expires_at: e.target.value } : row,
                          ),
                        )
                      }
                    />
                    <NumericInput
                      label={idx === 0 ? "Cant." : undefined}
                      value={b.qty}
                      onChange={(v) =>
                        setBatches((rows) =>
                          rows.map((row, i) => (i === idx ? { ...row, qty: v } : row)),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="!px-2"
                      onClick={() => setBatches((rows) => rows.filter((_, i) => i !== idx))}
                      aria-label="Quitar lote"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
