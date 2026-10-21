import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Barcode,
  Bell,
  Boxes,
  Check,
  CircleDollarSign,
  Gift,
  Package,
  Plus,
  Settings,
  Smartphone,
  Tag,
  Trash2,
} from "lucide-react";
import { getPhoneSettings, saveProductPhoneFields } from "../db/phoneUnits";
import { getUsdRate, usdToArs } from "../lib/usdRate";
import { formatMoney } from "../lib/format";
import { Modal, Input, NumericField, NumericInput, Select, Button } from "../components/ui";
import { KeyCap } from "../components/KeyboardShortcut";
import ProductThumb from "../components/ProductThumb";
import { useAppConfig } from "../context/AppConfig";
import { createProduct, listProducts, updateProduct } from "../db/products";
import { listServiceResourceIds, saveServiceResources } from "../db/serviceBooking";
import { listWorkshopResources } from "../db/workshopResources";
import { getResourceLabels } from "../config/resourceLabels";
import { createCategory } from "../db/categories";
import { createBrand } from "../db/brands";
import { listVariants, saveProductVariants } from "../db/variants";
import { listProductBatches, saveProductBatches, type BatchDraft } from "../db/batches";
import { listKitComponents, saveProductKit, type KitComponentDraft } from "../db/kits";
import { getProductRecipe, saveProductRecipe, type RecipeItemDraft } from "../db/recipes";
import { recipeUnitCost } from "../lib/recipeMath";
import type { ServiceItemKind } from "../components/ServiceItemKindMenu";
import {
  listProductModifiers,
  saveProductModifiers,
  type ModifierDraft,
} from "../db/modifiers";
import {
  isAllowedProductImage,
  pickAndPreviewProductImage,
  PRODUCT_IMAGE_TYPE_ERROR,
  removeProductImageFile,
  saveProductImageFile,
} from "../lib/productImages";
import { confirmDiscard, confirmDelete } from "../lib/confirm";
import { formatDbError } from "../lib/dbError";
import type { Brand, Category, Product, ProductInput, Supplier, VariantDraft } from "../types";

interface Props {
  open: boolean;
  product: Product | null;
  /** Estética: producto, insumo o servicio. Null al editar o en otros rubros. */
  createKind?: ServiceItemKind | null;
  categories: Category[];
  brands: Brand[];
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
  /** Refresh parent category/brand lists after inline create. */
  onCatalogChanged?: () => void;
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
  track_stock: true,
  show_on_menu: true,
};

const variantCellClass =
  "wt-field min-w-0 w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2.5 py-2 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-muted/55 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-500/25";

const toggleCheckClass =
  "h-4 w-4 shrink-0 rounded border border-[var(--color-panel-border)] accent-brand-600 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30";

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
    min_stock: 0,
  };
}

export default function ProductForm({
  open,
  product,
  createKind = null,
  categories,
  brands,
  suppliers,
  onClose,
  onSaved,
  onCatalogChanged,
}: Props) {
  const { rubroDef, phoneStore, currency } = useAppConfig();
  const fields = rubroDef.fields;
  const attrs = rubroDef.variantAttributes;
  const [form, setForm] = useState<ProductInput>(EMPTY);
  const [serialized, setSerialized] = useState(false);
  const [priceUsd, setPriceUsd] = useState(0);
  const [warrantyNew, setWarrantyNew] = useState<number | null>(null);
  const [warrantyUsed, setWarrantyUsed] = useState<number | null>(null);
  const [usdRate, setUsdRate] = useState(0);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [batches, setBatches] = useState<BatchDraft[]>([]);
  const [kitItems, setKitItems] = useState<KitComponentDraft[]>([]);
  const [recipeItems, setRecipeItems] = useState<RecipeItemDraft[]>([]);
  const [durationMin, setDurationMin] = useState(0);
  const [resourceIds, setResourceIds] = useState<number[]>([]);
  const [staff, setStaff] = useState<{ id: number; name: string }[]>([]);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [modifiers, setModifiers] = useState<ModifierDraft[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [kitSearch, setKitSearch] = useState("");
  const [pendingImageSource, setPendingImageSource] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [marginEdit, setMarginEdit] = useState<number | "">("");
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);
  const [localBrands, setLocalBrands] = useState<Brand[]>(brands);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);

  useEffect(() => {
    if (!open) return;
    void listProducts({ limit: 2000 })
      .then(setCatalog)
      .catch(console.error);
    if (phoneStore) {
      void getUsdRate()
        .then((r) => setUsdRate(r.rate))
        .catch(() => setUsdRate(0));
    }
  }, [open, phoneStore]);

  useEffect(() => {
    if (!open) return;
    setSerialized(Boolean(product?.serialized));
    setPriceUsd(product?.price_usd ?? 0);
    setWarrantyNew(product?.warranty_months_new ?? null);
    setWarrantyUsed(product?.warranty_months_used ?? null);
    if (!phoneStore) return;
    void getPhoneSettings()
      .then((d) => {
        setWarrantyNew((v) => v ?? d.warrantyNewMonths);
        setWarrantyUsed((v) => v ?? d.warrantyUsedMonths);
      })
      .catch(console.error);
  }, [open, product, phoneStore]);

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  useEffect(() => {
    setLocalBrands(brands);
  }, [brands]);

  useEffect(() => {
    if (!open) return;
    setShowNewCategory(false);
    setShowNewBrand(false);
    setNewCategoryName("");
    setNewBrandName("");
  }, [open]);

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name || creatingCategory) return;
    setCreatingCategory(true);
    try {
      const id = await createCategory(name);
      if (!id) {
        setError("No se pudo crear la categoría.");
        return;
      }
      const next: Category[] = [
        ...localCategories.filter((c) => c.id !== id),
        { id, name, created_at: new Date().toISOString() },
      ].sort((a, b) => a.name.localeCompare(b.name, "es"));
      setLocalCategories(next);
      set("category_id", id);
      setNewCategoryName("");
      setShowNewCategory(false);
      onCatalogChanged?.();
    } catch (e) {
      setError(formatDbError(e));
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleCreateBrand() {
    const name = newBrandName.trim();
    if (!name || creatingBrand) return;
    setCreatingBrand(true);
    try {
      const id = await createBrand(name);
      if (!id) {
        setError("No se pudo crear la marca.");
        return;
      }
      const next: Brand[] = [
        ...localBrands.filter((b) => b.id !== id),
        { id, name, created_at: new Date().toISOString() },
      ].sort((a, b) => a.name.localeCompare(b.name, "es"));
      setLocalBrands(next);
      set("brand_id", id);
      setNewBrandName("");
      setShowNewBrand(false);
      onCatalogChanged?.();
    } catch (e) {
      setError(formatDbError(e));
    } finally {
      setCreatingBrand(false);
    }
  }

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
        track_stock: product.track_stock !== 0,
        show_on_menu: product.show_on_menu !== 0,
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
              min_stock: v.min_stock ?? 0,
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
      void getProductRecipe(product.id)
        .then((recipe) => setRecipeItems(recipe?.items ?? []))
        .catch(() => setRecipeItems([]));
      setDurationMin(product.duration_min && product.duration_min > 0 ? product.duration_min : 0);
      void listServiceResourceIds(product.id).then(setResourceIds).catch(() => setResourceIds([]));
      void listProductModifiers(product.id)
        .then((rows) =>
          setModifiers(rows.map((m) => ({ id: m.id, name: m.name, price_delta: m.price_delta }))),
        )
        .catch(() => setModifiers([]));
    } else {
      const serviceCreate = rubroDef.id === "estetica" && createKind === "service";
      const clinicService = rubroDef.id === "clinica" && createKind === "service";
      const workshopService = rubroDef.id === "taller" && createKind === "service";
      const supplyCreate = rubroDef.id === "estetica" && createKind === "supply";
      const productCreate =
        (rubroDef.id === "estetica" || rubroDef.id === "clinica" || rubroDef.id === "taller") &&
        createKind === "product";
      setForm({
        ...EMPTY,
        unit: serviceCreate || workshopService
          ? "servicio"
          : clinicService
            ? "práctica"
            : productCreate || supplyCreate
              ? "unidad"
              : (rubroDef.units[0] ?? "unidad"),
        track_batches: fields.batches,
        track_stock: serviceCreate || clinicService || workshopService ? false : rubroDef.id !== "gastronomia",
        product_kind: serviceCreate ? "prepared" : supplyCreate ? "ingredient" : "standard",
        prepare_mode: serviceCreate ? "on_demand" : null,
        show_on_menu: !supplyCreate,
        price: supplyCreate ? 0 : 0,
      });
      setVariants([]);
      setBatches([]);
      setKitItems([]);
      setRecipeItems([]);
      setDurationMin(0);
      setResourceIds([]);
      setRecipeSearch("");
      setModifiers([]);
      setPendingImageSource(null);
      setImagePreview(null);
      setRemoveImage(false);
      setMarginEdit("");
    }
    setError("");
    setKitSearch("");
    if (open && (rubroDef.id === "estetica" || rubroDef.id === "clinica" || rubroDef.id === "taller")) {
      void listWorkshopResources()
        .then((rows) => setStaff(rows.map((row) => ({ id: row.id, name: row.name }))))
        .catch(() => setStaff([]));
    } else if (!open) {
      setStaff([]);
    }
  }, [product, open, rubroDef, fields.batches, fields.variants, attrs, createKind]);

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const isKit = Boolean(form.is_kit);
  const showGastroMenu = rubroDef.id === "gastronomia";
  const serviceItem = rubroDef.id === "estetica" && (form.product_kind === "prepared" || form.unit === "servicio");
  const practiceUnit = form.unit
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const catalogService =
    serviceItem ||
    (rubroDef.id === "clinica" &&
      (practiceUnit === "practica" || practiceUnit === "sesion")) ||
    (rubroDef.id === "taller" && practiceUnit === "servicio");
  const supplyItem = rubroDef.id === "estetica" && form.product_kind === "ingredient";
  /** Solo gastronomía: platos sin inventario vs bebidas/insumos. En otros rubros siempre se lleva stock. */
  const showTrackStockToggle = showGastroMenu;
  const tracksStock = catalogService ? false : showTrackStockToggle ? form.track_stock !== false : true;
  const showPhoneFields = phoneStore && !catalogService && !supplyItem && !isKit;
  const serializedOn = showPhoneFields && serialized;
  const usdPriced = showPhoneFields && priceUsd > 0;
  const useVariants = fields.variants && !isKit && !serializedOn;
  const useBatches = fields.batches && Boolean(form.track_batches) && !isKit && tracksStock;
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
  function setVariantField(idx: number, key: "price" | "stock" | "min_stock", value: number | "") {
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
        description: showGastroMenu
          ? (form.description?.trim().slice(0, 280) || null)
          : form.description?.trim() || null,
        stock: isKit || !tracksStock
          ? 0
          : serializedOn
            ? (product?.stock ?? 0)
            : useBatches
              ? batchStock
              : form.stock,
        price: usdPriced && usdRate > 0 ? usdToArs(priceUsd, usdRate) : form.price,
        cost:
          serviceItem && recipeItems.length > 0 && !(Number(form.cost) > 0)
            ? Math.round(
                recipeUnitCost(
                  recipeItems.map((item) => ({ qtyPerYield: item.qty, unitCost: item.cost })),
                  1,
                ) * 100,
              ) / 100
            : form.cost,
        expires_at: fields.expiry && !isKit ? form.expires_at : null,
        track_batches: fields.batches && !isKit && tracksStock ? Boolean(form.track_batches) : false,
        scale_plu: fields.scalePlu ? form.scale_plu?.trim() || null : null,
        is_kit: isKit,
        is_daily_menu: showGastroMenu ? Boolean(form.is_daily_menu) : false,
        track_stock: catalogService ? false : showTrackStockToggle ? tracksStock : true,
        show_on_menu: supplyItem ? false : showGastroMenu ? form.show_on_menu !== false : true,
        unit: supplyItem
          ? "unidad"
          : serviceItem || (rubroDef.id === "taller" && catalogService)
            ? "servicio"
            : form.unit,
        product_kind: supplyItem ? "ingredient" : serviceItem ? "prepared" : form.product_kind ?? "standard",
        prepare_mode: serviceItem ? "on_demand" : form.prepare_mode ?? null,
        duration_min: catalogService && durationMin >= 5 ? Math.round(durationMin) : null,
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

      if (phoneStore) {
        await saveProductPhoneFields(id, {
          serialized: serializedOn,
          price_usd: showPhoneFields && priceUsd > 0 ? priceUsd : null,
          warranty_months_new: showPhoneFields ? warrantyNew : null,
          warranty_months_used: showPhoneFields ? warrantyUsed : null,
        });
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
      await saveProductModifiers(id, showGastroMenu ? modifiers : []);
      await saveServiceResources(id, catalogService ? resourceIds : []);
      if (rubroDef.id === "estetica") {
        await saveProductRecipe(
          id,
          serviceItem && recipeItems.length
            ? {
                yield_qty: 1,
                items: recipeItems.map((item) => ({
                  ingredient_product_id: item.ingredient_product_id,
                  qty: item.qty,
                })),
              }
            : null,
        );
      }
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
      if (!isAllowedProductImage(picked.sourcePath)) {
        setError(PRODUCT_IMAGE_TYPE_ERROR);
        return;
      }
      if (error === PRODUCT_IMAGE_TYPE_ERROR) setError("");
      setPendingImageSource(picked.sourcePath);
      setImagePreview(picked.previewUrl);
      setRemoveImage(false);
    } catch (e) {
      setError(String(e));
    }
  }

  const nameError = error === "El nombre es obligatorio." ? error : "";
  const kitError = error === "Un combo necesita al menos un componente." ? error : "";
  const imageError = error === PRODUCT_IMAGE_TYPE_ERROR ? error : "";
  const formError = nameError || kitError || imageError ? "" : error;
  const saleLabel =
    fields.unitMeasure && (form.unit === "kg" || form.unit === "kilogramo")
      ? "Precio de venta por kg"
      : fields.unitMeasure && (form.unit === "g" || form.unit === "gramo")
        ? "Precio de venta por gramo"
        : "Precio de venta";
  const unitChoices = [...rubroDef.units];
  if (form.unit && !unitChoices.includes(form.unit)) unitChoices.unshift(form.unit);
  const showIdentification = Boolean(fields.barcode || fields.sku || fields.scalePlu);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      document.getElementById("product-name")?.focus();
    }, 40);
    return () => window.clearTimeout(t);
  }, [open, product?.id]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return;
      if (el.closest("button")) return;
      e.preventDefault();
      void handleSave();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Modal
      open={open}
      title={
        product
          ? supplyItem
            ? "Editar insumo"
            : catalogService
              ? "Editar servicio"
              : "Editar producto"
          : supplyItem
            ? "Nuevo insumo"
            : catalogService
              ? "Nuevo servicio"
              : "Nuevo producto"
      }
      subtitle={
        supplyItem
          ? "Stock para usar en un servicio. No se vende en el punto de venta ni se reserva."
          : catalogService
            ? rubroDef.id === "taller"
              ? "Sale en turnos y órdenes. No descuenta stock."
              : serviceItem
                ? "Sale en la reserva. Los insumos son opcionales: si no cargás ninguno, el servicio queda solo."
                : "Sale en turnos. No lleva código ni stock."
            : product
              ? "Actualizá los datos del producto"
              : "Agregá un producto a tu catálogo"
      }
      onClose={onClose}
      onRequestClose={requestClose}
      size="form"
      icon={<Package size={18} />}
      footer={
        <div className="min-w-0">
          {formError ? (
            <p className="pf-footer__error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="pf-footer">
            <div className="pf-footer__side">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (requestClose()) onClose();
                }}
              >
                Cancelar
              </Button>
              <KeyCap>Esc</KeyCap>
            </div>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                "Guardando..."
              ) : (
                <>
                  <Check size={16} />
                  {catalogService ? "Guardar servicio" : supplyItem ? "Guardar insumo" : "Guardar producto"}
                  <KeyCap className="pf-keycap-on">Enter</KeyCap>
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="pf-form">
        {!product && rubroDef.productFormHint ? (
          <p className="pf-hint">{rubroDef.productFormHint}</p>
        ) : null}

        <section className="pf-section">
          <div className="pf-basic">
            <div className="pf-photo">
              <div className="pf-photo__frame">
                <ProductThumb
                  imagePath={removeImage ? null : form.image_path}
                  previewUrl={imagePreview}
                  alt={form.name}
                  size="card"
                  className="!h-full !w-full !rounded-none !bg-transparent !ring-0"
                />
              </div>
              <button type="button" className="pf-photo__btn" onClick={() => void handlePickImage()}>
                {imagePreview || (form.image_path && !removeImage) ? "Cambiar foto" : "Agregar foto"}
              </button>
              {(imagePreview || form.image_path) && !removeImage ? (
                <button
                  type="button"
                  className="pf-photo__remove"
                  onClick={() => {
                    setPendingImageSource(null);
                    setImagePreview(null);
                    setRemoveImage(true);
                    set("image_path", null);
                  }}
                >
                  Quitar foto
                </button>
              ) : null}
            </div>

            <div className="pf-basic__name">
              <Input
                id="product-name"
                label={
                  catalogService
                    ? "Nombre del servicio *"
                    : supplyItem
                      ? "Nombre del insumo *"
                      : "Nombre del producto *"
                }
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={
                  catalogService
                    ? rubroDef.id === "clinica"
                      ? "Ej. Limpieza, control, sesión"
                      : rubroDef.id === "taller"
                        ? "Ej. Tren delantero, frenos, service"
                        : "Ej. Corte, color, barba, uñas"
                    : supplyItem
                      ? "Ej. Esmalte, tintura, crema"
                      : (rubroDef.productNamePlaceholder ?? "Ej. Coca Cola 1.5L")
                }
                autoFocus
                error={nameError}
              />
            </div>

            {!catalogService && <div className="pf-combo">
              <span className="pf-combo__icon" aria-hidden>
                <Gift size={16} />
              </span>
              <span className="pf-combo__text">
                <p className="pf-combo__title">Combo o promoción</p>
              </span>
              <input
                type="checkbox"
                className="pf-switch"
                checked={isKit}
                aria-label="Combo o promoción"
                onChange={(e) => {
                  set("is_kit", e.target.checked);
                  if (e.target.checked) {
                    set("track_batches", false);
                    setVariants([]);
                  }
                }}
              />
            </div>}
          </div>
          {imageError ? <p className="pf-inline-error">{imageError}</p> : null}

          {isKit && (
            <div className="pf-kit pf-reveal">
              <div>
                <p className="text-sm font-semibold text-ink">Componentes del combo</p>
                <p className="text-xs text-ink-muted">
                  El stock del combo no se lleva aparte: se descuenta el de cada ítem al vender.
                </p>
              </div>
              {kitItems.length > 0 && (
                <ul className="mt-2 space-y-2">
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
                        className="!w-20 !rounded !border-[var(--color-panel-border)] !px-2 !py-1"
                      />
                      <button
                        type="button"
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() =>
                          setKitItems((rows) =>
                            rows.filter((r) => r.component_product_id !== k.component_product_id),
                          )
                        }
                        aria-label="Quitar componente"
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2">
                <Input
                  label="Buscar producto para agregar"
                  value={kitSearch}
                  onChange={(e) => setKitSearch(e.target.value)}
                  placeholder="Nombre o código…"
                />
              </div>
              {kitSearch.trim() && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[var(--color-panel-border)]">
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
              {kitError ? (
                <p className="field-error" role="alert">
                  {kitError}
                </p>
              ) : null}
            </div>
          )}
        </section>

        {showIdentification && !catalogService ? (
          <section className="pf-section">
            <h3 className="pf-section__title">
              <Barcode size={15} aria-hidden />
              Identificación
            </h3>
            <div className="pf-grid pf-grid--2">
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
                  placeholder="Código interno"
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
            </div>
          </section>
        ) : null}

        {!catalogService && <section className="pf-section">
          <h3 className="pf-section__title">
            <Tag size={15} aria-hidden />
            Organización
          </h3>
          <div className="pf-grid pf-grid--2">
            {fields.category && (
              <div className="min-w-0">
                <Select
                  label="Categoría"
                  value={form.category_id ?? ""}
                  onChange={(e) => set("category_id", e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Sin categoría</option>
                  {localCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                {showNewCategory ? (
                  <div className="mt-2 flex min-w-0 items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Input
                        label="Nueva categoría"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleCreateCategory();
                          }
                        }}
                        placeholder="Ej: Bebidas"
                        autoFocus
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      loading={creatingCategory}
                      onClick={() => void handleCreateCategory()}
                      disabled={!newCategoryName.trim()}
                    >
                      Crear
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowNewCategory(false);
                        setNewCategoryName("");
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
                    onClick={() => setShowNewCategory(true)}
                  >
                    + Nueva categoría
                  </button>
                )}
              </div>
            )}

            <div className="min-w-0">
              <Select
                label="Marca"
                value={form.brand_id ?? ""}
                onChange={(e) => set("brand_id", e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Sin marca</option>
                {localBrands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              {showNewBrand ? (
                <div className="mt-2 flex min-w-0 items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      label="Nueva marca"
                      value={newBrandName}
                      onChange={(e) => setNewBrandName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleCreateBrand();
                        }
                      }}
                      placeholder="Ej: Coca-Cola"
                      autoFocus
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    loading={creatingBrand}
                    onClick={() => void handleCreateBrand()}
                    disabled={!newBrandName.trim()}
                  >
                    Crear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowNewBrand(false);
                      setNewBrandName("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
                  onClick={() => setShowNewBrand(true)}
                >
                  + Nueva marca
                </button>
              )}
            </div>

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

            {fields.unitMeasure && !serviceItem && !supplyItem && (
              <Select label="Unidad de medida" value={form.unit} onChange={(e) => set("unit", e.target.value)}>
                {unitChoices.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </section>}

        {showPhoneFields ? (
          <section className="pf-section">
            <h3 className="pf-section__title">
              <Smartphone size={15} aria-hidden />
              Celular
            </h3>
            <label className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3">
              <input
                type="checkbox"
                className={`${toggleCheckClass} mt-0.5`}
                checked={serialized}
                onChange={(e) => setSerialized(e.target.checked)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">Se vende por IMEI o número de serie</span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Cada equipo se carga en Celulares con su IMEI. Al vender se elige cuál sale y el stock es la
                  cantidad de equipos cargados.
                </span>
              </span>
            </label>
            <div className="pf-grid pf-grid--2 mt-3">
              <NumericInput
                label="Precio en dólares (US$)"
                value={priceUsd}
                min={0}
                onChange={(v) => setPriceUsd(Math.max(0, v))}
                hint={
                  priceUsd > 0
                    ? usdRate > 0
                      ? `En pesos: ${formatMoney(usdToArs(priceUsd, usdRate), currency)} (dólar a ${formatMoney(usdRate, currency)}). Cambia con la cotización.`
                      : "Cargá la cotización del dólar en Celulares para pasarlo a pesos."
                    : "Dejalo en 0 si lo vendés en pesos."
                }
              />
              <div className="grid min-w-0 grid-cols-2 gap-3">
                <NumericInput
                  label="Garantía nuevo (meses)"
                  value={warrantyNew ?? 0}
                  min={0}
                  onChange={(v) => setWarrantyNew(Math.round(Math.max(0, v)))}
                />
                <NumericInput
                  label="Garantía usado (meses)"
                  value={warrantyUsed ?? 0}
                  min={0}
                  onChange={(v) => setWarrantyUsed(Math.round(Math.max(0, v)))}
                />
              </div>
            </div>
          </section>
        ) : null}

        <section className="pf-section">
          <h3 className="pf-section__title">
            <CircleDollarSign size={15} aria-hidden />
            {catalogService ? "Precio" : "Precio y stock"}
          </h3>
          <div className="pf-price-flow">
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
            <div className="pf-price-op" aria-hidden>
              <ArrowRight size={18} />
            </div>
            <div className="pf-sale">
              <NumericInput
                className="pf-sale-input"
                label={usdPriced ? `${saleLabel} (sale del dólar)` : saleLabel}
                disabled={usdPriced && usdRate > 0}
                value={usdPriced && usdRate > 0 ? usdToArs(priceUsd, usdRate) : form.price}
                onChange={(v) => {
                  set("price", v);
                  if (form.cost > 0) {
                    setMarginEdit(Math.round(((v - form.cost) / form.cost) * 1000) / 10);
                  } else {
                    setMarginEdit("");
                  }
                }}
              />
            </div>
          </div>
          {form.cost > 0 && typeof form.price === "number" && (
            <p className="pf-formula">
              Podés cargar el <strong>margen %</strong> o el <strong>precio de venta</strong>: se
              recalcula el otro. Margen actual:{" "}
              {(((form.price - form.cost) / form.cost) * 100).toFixed(1)}%.
            </p>
          )}

          {catalogService ? (
            <div className="mt-4 min-w-0">
              <p className="text-sm font-semibold text-ink">Duración del turno</p>
              <p className="mt-1 text-xs text-ink-muted">
                Los horarios libres salen de esta duración. Una consulta de 15 minutos se ofrece cada 15.
                Un trabajo de 120 minutos entra pocas veces en el día. Si no elegís, queda en 60 minutos cada 30.
              </p>
              <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                {[15, 30, 45, 60, 90, 120, 180, 240].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      durationMin === mins
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-[var(--color-panel-border)] text-ink"
                    }`}
                    onClick={() => setDurationMin(mins)}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <p className="text-sm font-semibold text-ink">Quién lo hace</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Si no marcás a nadie, lo puede tomar cualquier {getResourceLabels(rubroDef.id).pickerLabel.toLowerCase()} del equipo.
                </p>
                {staff.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-muted">
                    Todavía no hay gente cargada en Turnos. El servicio queda disponible para todo el equipo.
                  </p>
                ) : (
                  <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                    {staff.map((person) => {
                      const on = resourceIds.includes(person.id);
                      return (
                        <button
                          key={person.id}
                          type="button"
                          className={`max-w-full truncate rounded-full border px-3 py-1 text-xs font-semibold ${
                            on
                              ? "border-brand-600 bg-brand-50 text-brand-800"
                              : "border-[var(--color-panel-border)] text-ink"
                          }`}
                          onClick={() =>
                            setResourceIds((ids) =>
                              on ? ids.filter((id) => id !== person.id) : [...ids, person.id],
                            )
                          }
                        >
                          {person.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {serviceItem ? (
            <div className="mt-4 min-w-0">
              <p className="text-sm font-semibold text-ink">Insumos del servicio</p>
              <p className="mt-1 text-xs text-ink-muted">
                Opcional. Al cobrar el servicio se descuenta esta cantidad. Si no agregás nada, no se mueve stock.
              </p>
              <Input
                className="mt-2"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
                placeholder="Buscar insumo"
              />
              {recipeSearch.trim() ? (
                <div className="mt-2 max-h-36 min-w-0 overflow-auto rounded-lg border border-[var(--color-panel-border)]">
                  {catalog
                    .filter((item) => item.product_kind === "ingredient" && item.active !== 0)
                    .filter((item) => !product || item.id !== product.id)
                    .filter((item) => !recipeItems.some((row) => row.ingredient_product_id === item.id))
                    .filter((item) => item.name.toLowerCase().includes(recipeSearch.trim().toLowerCase()))
                    .slice(0, 8)
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="block w-full min-w-0 truncate px-3 py-2 text-left text-sm hover:bg-brand-50"
                        onClick={() => {
                          setRecipeItems((rows) => [
                            ...rows,
                            {
                              ingredient_product_id: item.id,
                              name: item.name,
                              unit: item.unit,
                              cost: item.cost,
                              stock: item.stock,
                              qty: 1,
                            },
                          ]);
                          setRecipeSearch("");
                        }}
                      >
                        {item.name}
                      </button>
                    ))}
                </div>
              ) : null}
              {recipeItems.length === 0 ? (
                <p className="mt-2 text-xs text-ink-muted">Sin insumos. El servicio se reserva y se cobra igual.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {recipeItems.map((item) => (
                    <div key={item.ingredient_product_id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_88px_auto] items-center gap-2">
                      <p className="min-w-0 truncate text-sm text-ink">{item.name}</p>
                      <NumericInput
                        value={item.qty}
                        onChange={(value) =>
                          setRecipeItems((rows) =>
                            rows.map((row) =>
                              row.ingredient_product_id === item.ingredient_product_id
                                ? { ...row, qty: typeof value === "number" ? value : row.qty }
                                : row,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-2"
                        onClick={() =>
                          setRecipeItems((rows) => rows.filter((row) => row.ingredient_product_id !== item.ingredient_product_id))
                        }
                      >
                        Quitar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {!useVariants && !isKit && tracksStock && (
            <div className="pf-stock">
              {serializedOn ? (
                <div className="pf-stock__banner">
                  <p className="pf-stock__banner-kicker">Stock por IMEI</p>
                  <p className="mt-0.5 text-sm tabular-nums text-ink">
                    {product ? (
                      <>
                        Equipos en stock: <strong>{product.stock}</strong>. Se suman cargando el IMEI en Celulares.
                      </>
                    ) : (
                      "Guardá el producto y cargá cada equipo con su IMEI en Celulares."
                    )}
                  </p>
                </div>
              ) : useBatches ? (
                <div className="pf-stock__banner">
                  <p className="pf-stock__banner-kicker">Stock por lotes</p>
                  <p className="mt-0.5 text-sm tabular-nums text-ink">
                    Total: <strong>{batchStock}</strong> (suma de lotes)
                  </p>
                </div>
              ) : (
                <div className="pf-stock__cell">
                  <p className="pf-stock__label">
                    <Boxes size={14} aria-hidden />
                    Stock actual
                  </p>
                  <NumericInput value={form.stock} onChange={(v) => set("stock", v)} />
                </div>
              )}
              <div className="pf-stock__cell">
                <p className="pf-stock__label">
                  <Bell size={14} aria-hidden />
                  Stock mínimo (alerta)
                </p>
                <NumericInput value={form.min_stock} onChange={(v) => set("min_stock", v)} />
              </div>
            </div>
          )}

          {useVariants && (
            <div className="mt-3 min-w-0">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                <h3 className="min-w-0 truncate text-sm font-semibold text-ink">
                  Variantes ({attrs.join(" / ")})
                </h3>
                <Button variant="secondary" onClick={addVariant} className="shrink-0 px-3 py-1.5 text-xs">
                  <Plus size={14} /> Agregar variante
                </Button>
              </div>

              {variants.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--color-panel-border)] px-3 py-4 text-center text-sm text-ink-muted">
                  Sin variantes. Agregá combinaciones de {attrs.join(" y ")} con su stock.
                </p>
              ) : (
                <div className="pf-variant-scroll rounded-lg border border-[var(--color-panel-border)]">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="bg-[var(--color-input-bg)] text-left text-xs uppercase text-ink-muted">
                      <tr>
                        {attrs.map((a) => (
                          <th key={a} className="px-2 py-2 font-semibold">
                            {a}
                          </th>
                        ))}
                        <th className="w-28 px-2 py-2 font-semibold">Precio</th>
                        <th className="w-24 px-2 py-2 font-semibold">Stock</th>
                        <th className="w-28 px-2 py-2 font-semibold">Stock mín.</th>
                        <th className="w-10 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-panel-border)]">
                      {variants.map((v, idx) => (
                        <tr key={idx}>
                          {attrs.map((a) => (
                            <td key={a} className="px-2 py-1.5">
                              <input
                                value={v.attributes[a] ?? ""}
                                onChange={(e) => setVariantAttr(idx, a, e.target.value)}
                                placeholder={a}
                                className={variantCellClass}
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
                            <input
                              type="text"
                              inputMode="decimal"
                              value={String(v.stock)}
                              onChange={(e) => {
                                const next = e.target.value;
                                if (next === "" || /^-?\d*(?:[.,]\d*)?$/.test(next)) {
                                  setVariantField(
                                    idx,
                                    "stock",
                                    next === "" ? 0 : Number(next.replace(",", ".")) || 0,
                                  );
                                }
                              }}
                              className={variantCellClass}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={String(v.min_stock)}
                              onChange={(e) => {
                                const next = e.target.value;
                                if (next === "" || /^-?\d*(?:[.,]\d*)?$/.test(next)) {
                                  setVariantField(
                                    idx,
                                    "min_stock",
                                    next === "" ? 0 : Number(next.replace(",", ".")) || 0,
                                  );
                                }
                              }}
                              className={variantCellClass}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => void removeVariant(idx)}
                              className="rounded p-1 text-ink-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                              aria-label="Quitar variante"
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
              <p className="mt-2 text-xs text-ink-muted">
                El stock total del producto se calcula sumando las variantes. Si dejás el precio vacío, se
                usa el precio general. Con stock mínimo por talle/color, sale alerta cuando esa variante
                baja del umbral.
              </p>
            </div>
          )}
        </section>

        {!catalogService && <section className="pf-section pf-section--quiet">
          <h3 className="pf-section__title">
            <Settings size={15} aria-hidden />
            Más opciones
          </h3>
          <div className="pf-grid pf-grid--2">
            {fields.expiry && !isKit && (
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
              label="IVA (%)"
              value={form.tax_rate}
              onChange={(v) => set("tax_rate", v)}
            />
            {!fields.barcode && (
              <Input
                label="Código de barras"
                value={form.barcode ?? ""}
                onChange={(e) => set("barcode", e.target.value)}
                placeholder="Escaneá o escribí el código"
              />
            )}
            {!fields.sku && (
              <Input
                label="SKU / Código interno"
                value={form.sku ?? ""}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="Código interno"
              />
            )}
            {!fields.unitMeasure && (
              <Select label="Unidad de medida" value={form.unit} onChange={(e) => set("unit", e.target.value)}>
                {unitChoices.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {fields.batches && !useVariants && !isKit && tracksStock && (
            <div className="mt-3 min-w-0 space-y-3 rounded-xl border border-[var(--color-panel-border)] p-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">Controlar por lotes</span>
                  <span className="text-xs text-ink-muted">
                    Ideal para farmacia: cada partida con código, cantidad y vencimiento (FIFO).
                  </span>
                </span>
                <input
                  type="checkbox"
                  className={toggleCheckClass}
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
                  <div className="flex items-center justify-between gap-2">
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
                    <div key={b.id ?? `new-${idx}`} className="pf-lot">
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

          {showGastroMenu ? (
            <div className="mt-3 min-w-0 space-y-3">
              <label className="block min-w-0 text-sm">
                <span className="mb-1 block font-medium text-ink">Qué incluye (carta web)</span>
                <textarea
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                  rows={3}
                  maxLength={280}
                  placeholder="Ej: Pan, medallón de carne, lechuga, tomate, cheddar, papas…"
                  className="wt-field min-w-0 w-full resize-y rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2.5 py-2 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-muted/55 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-500/25"
                />
                <span className="mt-1 block text-xs text-ink-muted">
                  Se muestra debajo del nombre en walqo.pro/carta. Si es un combo y dejás vacío,
                  se listan solos los componentes del combo.
                </span>
              </label>

              {showTrackStockToggle ? (
                <div className="pf-toggle">
                  <span className="pf-toggle__text">
                    <span className="block text-sm font-semibold text-ink">Llevar inventario</span>
                    <span className="text-xs text-ink-muted">
                      Activá para bebidas, insumos o mercadería. Desactivá en platos hechos al momento
                      (hamburguesa, milanesa): no resta stock ni queda en negativo.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className={toggleCheckClass}
                    checked={tracksStock}
                    disabled={isKit}
                    onChange={(e) => {
                      set("track_stock", e.target.checked);
                      if (!e.target.checked) {
                        set("track_batches", false);
                        set("stock", 0);
                      }
                    }}
                  />
                </div>
              ) : null}
              {showTrackStockToggle && isKit && (
                <p className="text-xs text-ink-muted">
                  En combos o promociones el stock se descuenta de cada componente (según su propia
                  opción de inventario).
                </p>
              )}

              <div className="pf-toggle">
                <span className="pf-toggle__text">
                  <span className="block text-sm font-semibold text-ink">Menú del día</span>
                  <span className="text-xs text-ink-muted">
                    Se destaca arriba en el punto de venta para venderlo más rápido.
                  </span>
                </span>
                <input
                  type="checkbox"
                  className={toggleCheckClass}
                  checked={Boolean(form.is_daily_menu)}
                  onChange={(e) => set("is_daily_menu", e.target.checked)}
                />
              </div>

              <div className="pf-toggle">
                <span className="pf-toggle__text">
                  <span className="block text-sm font-semibold text-ink">Mostrar en carta web</span>
                  <span className="text-xs text-ink-muted">
                    Desactivá insumos o productos que no quieras en walqo.pro/carta (ej. medallón,
                    papas sueltas).
                  </span>
                </span>
                <input
                  type="checkbox"
                  className={toggleCheckClass}
                  checked={form.show_on_menu !== false}
                  onChange={(e) => set("show_on_menu", e.target.checked)}
                />
              </div>

              <div className="min-w-0 space-y-3 rounded-xl border border-[var(--color-panel-border)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
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
                      <li key={m.id ?? `new-${idx}`} className="pf-inline-3">
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
                          aria-label="Quitar extra"
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </section>}
      </div>
    </Modal>
  );
}
