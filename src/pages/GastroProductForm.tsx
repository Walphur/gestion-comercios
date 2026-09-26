import { useEffect, useMemo, useState } from "react";
import {
  ChefHat,
  CookingPot,
  ImagePlus,
  Package,
  Plus,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { Modal, Input, NumericField, NumericInput, Select, Button } from "../components/ui";
import ProductThumb from "../components/ProductThumb";
import { useAppConfig } from "../context/AppConfig";
import { createProduct, listProducts, updateProduct } from "../db/products";
import { createCategory } from "../db/categories";
import { listKitComponents, saveProductKit, type KitComponentDraft } from "../db/kits";
import { getProductRecipe, saveProductRecipe, type RecipeItemDraft } from "../db/recipes";
import { listStockMovementsForProduct, type StockMovementRow } from "../db/stock";
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
import { confirmDiscard } from "../lib/confirm";
import { formatDbError } from "../lib/dbError";
import {
  defaultsForGastroKind,
  recipeUnitCost,
  type PrepareMode,
  type ProductKind,
} from "../lib/recipeMath";
import type { Brand, Category, Product, ProductInput, Supplier } from "../types";

export type GastroCreateKind = "ingredient" | "prepared" | "kit" | "daily_menu";

interface Props {
  open: boolean;
  product: Product | null;
  /** Solo al crear: tipo elegido (o null para mostrar selector). */
  initialKind?: GastroCreateKind | null;
  categories: Category[];
  brands: Brand[];
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
  onCatalogChanged?: () => void;
}

const DAYS = [
  { id: 1, label: "Lun" },
  { id: 2, label: "Mar" },
  { id: 3, label: "Mié" },
  { id: 4, label: "Jue" },
  { id: 5, label: "Vie" },
  { id: 6, label: "Sáb" },
  { id: 0, label: "Dom" },
];

type MenuSchedule = { days: number[]; from: string; to: string };

function parseSchedule(raw: string | null | undefined): MenuSchedule {
  try {
    if (!raw) return { days: [1, 2, 3, 4, 5], from: "11:00", to: "15:00" };
    const j = JSON.parse(raw) as MenuSchedule;
    return {
      days: Array.isArray(j.days) ? j.days : [1, 2, 3, 4, 5],
      from: j.from || "11:00",
      to: j.to || "15:00",
    };
  } catch {
    return { days: [1, 2, 3, 4, 5], from: "11:00", to: "15:00" };
  }
}

function kindFromProduct(p: Product): GastroCreateKind {
  if (p.is_kit && p.is_daily_menu) return "daily_menu";
  if (p.is_kit || p.product_kind === "kit") return "kit";
  if (p.product_kind === "ingredient") return "ingredient";
  if (p.product_kind === "prepared") return "prepared";
  if (p.track_stock === 0) return "prepared";
  return "prepared";
}

const KIND_OPTIONS: {
  id: GastroCreateKind;
  title: string;
  description: string;
  icon: typeof Package;
}[] = [
  {
    id: "ingredient",
    title: "Insumo",
    description: "Papa, aceite, harina… Unidad, costo y stock. No sale en la carta.",
    icon: Package,
  },
  {
    id: "prepared",
    title: "Producto elaborado",
    description: "Papas fritas, milanesa… Con receta, producción o al momento.",
    icon: CookingPot,
  },
  {
    id: "kit",
    title: "Combo o promoción",
    description: "Milanesa + papas. Sin stock propio; descuenta componentes.",
    icon: UtensilsCrossed,
  },
  {
    id: "daily_menu",
    title: "Menú del día",
    description: "Como un combo, destacado en el POS y con horario opcional.",
    icon: ChefHat,
  },
];

const toggleCheckClass =
  "h-4 w-4 shrink-0 rounded border border-[var(--color-panel-border)] accent-brand-600 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30";

function labelMovement(t: string): string {
  switch (t) {
    case "sale":
      return "Venta";
    case "void":
      return "Anulación";
    case "production":
      return "Producción";
    case "production_use":
      return "Uso en producción";
    case "adjustment":
      return "Ajuste";
    default:
      return t;
  }
}

export default function GastroProductForm({
  open,
  product,
  initialKind = null,
  categories,
  suppliers,
  onClose,
  onSaved,
  onCatalogChanged,
}: Props) {
  const { currency, rubroDef } = useAppConfig();
  const [pickedKind, setPickedKind] = useState<GastroCreateKind | null>(null);
  const [form, setForm] = useState<ProductInput>({
    name: "",
    cost: 0,
    price: 0,
    stock: 0,
    min_stock: 0,
    unit: "porción",
    tax_rate: 21,
    track_stock: true,
    show_on_menu: false,
    is_kit: false,
    is_daily_menu: false,
    product_kind: "prepared",
    prepare_mode: "batch",
  });
  const [kitItems, setKitItems] = useState<(KitComponentDraft & { cost?: number; stock?: number; unit?: string })[]>([]);
  const [recipeItems, setRecipeItems] = useState<RecipeItemDraft[]>([]);
  const [yieldQty, setYieldQty] = useState(1);
  const [modifiers, setModifiers] = useState<ModifierDraft[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [schedule, setSchedule] = useState<MenuSchedule>(parseSchedule(null));
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [pendingImageSource, setPendingImageSource] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [localCategories, setLocalCategories] = useState(categories);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);

  const createKind = product ? kindFromProduct(product) : pickedKind ?? initialKind;
  const showTypePicker = !product && !createKind;

  useEffect(() => {
    if (!open) return;
    void listProducts({ limit: 3000 }).then(setCatalog).catch(console.error);
  }, [open]);

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSearch("");
    setPendingImageSource(null);
    setImagePreview(null);
    setRemoveImage(false);
    setShowNewCategory(false);
    setNewCategoryName("");

    if (!product) {
      setPickedKind(initialKind ?? null);
      if (initialKind) applyKindDefaults(initialKind);
      else {
        setForm({
          name: "",
          cost: 0,
          price: 0,
          stock: 0,
          min_stock: 0,
          unit: "porción",
          tax_rate: 21,
          track_stock: true,
          show_on_menu: false,
          is_kit: false,
          is_daily_menu: false,
          product_kind: "prepared",
          prepare_mode: "batch",
        });
      }
      setKitItems([]);
      setRecipeItems([]);
      setYieldQty(1);
      setModifiers([]);
      setMovements([]);
      setSchedule(parseSchedule(null));
      return;
    }

    const k = kindFromProduct(product);
    setPickedKind(k);
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
      image_path: product.image_path ?? null,
      is_kit: Boolean(product.is_kit),
      is_daily_menu: Boolean(product.is_daily_menu),
      track_stock: product.track_stock !== 0,
      show_on_menu: product.show_on_menu !== 0,
      product_kind: (product.product_kind as ProductKind) || (product.is_kit ? "kit" : "prepared"),
      prepare_mode: (product.prepare_mode as PrepareMode | null) ??
        (product.track_stock === 0 ? "on_demand" : "batch"),
      menu_schedule: product.menu_schedule ?? null,
    });
    setSchedule(parseSchedule(product.menu_schedule));
    void listKitComponents(product.id).then(async (items) => {
      const enriched = items.map((it) => {
        const p = catalog.find((c) => c.id === it.component_product_id);
        return {
          ...it,
          cost: p?.cost ?? 0,
          stock: p?.stock ?? 0,
          unit: p?.unit ?? "",
        };
      });
      setKitItems(enriched);
    });
    void getProductRecipe(product.id).then((r) => {
      if (!r) {
        setRecipeItems([]);
        setYieldQty(1);
        return;
      }
      setRecipeItems(r.items);
      setYieldQty(r.yield_qty);
    });
    void listProductModifiers(product.id).then(setModifiers).catch(() => setModifiers([]));
    void listStockMovementsForProduct(product.id, 15)
      .then(setMovements)
      .catch(() => setMovements([]));
  }, [open, product, initialKind]);

  // Re-enrich kit costs when catalog loads
  useEffect(() => {
    if (!kitItems.length || !catalog.length) return;
    setKitItems((rows) =>
      rows.map((it) => {
        const p = catalog.find((c) => c.id === it.component_product_id);
        return p
          ? { ...it, cost: p.cost, stock: p.stock, unit: p.unit, name: p.name }
          : it;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when catalog arrives
  }, [catalog]);

  function applyKindDefaults(kind: GastroCreateKind) {
    const asDaily = kind === "daily_menu";
    const baseKind: ProductKind = kind === "daily_menu" ? "kit" : kind;
    const d = defaultsForGastroKind(baseKind, asDaily);
    setForm((f) => ({
      ...f,
      name: f.name,
      ...d,
      product_kind: d.product_kind,
      prepare_mode: d.prepare_mode,
      is_kit: d.is_kit,
      is_daily_menu: d.is_daily_menu,
      track_stock: d.track_stock,
      show_on_menu: d.show_on_menu,
      unit: d.unit,
      price: d.price,
      stock: 0,
      cost: 0,
    }));
    setPickedKind(kind);
  }

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const calculatedRecipeCost = useMemo(
    () =>
      recipeUnitCost(
        recipeItems.map((i) => ({ qtyPerYield: i.qty, unitCost: i.cost })),
        yieldQty,
      ),
    [recipeItems, yieldQty],
  );

  const kitCost = useMemo(
    () => kitItems.reduce((s, k) => s + (k.cost ?? 0) * k.qty, 0),
    [kitItems],
  );

  const ingredientCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((p) => !p.is_kit)
      .filter(
        (p) =>
          p.product_kind === "ingredient" ||
          p.product_kind === "prepared" ||
          p.product_kind === "standard" ||
          !p.product_kind,
      )
      .filter((p) => !recipeItems.some((r) => r.ingredient_product_id === p.id))
      .filter((p) => !product || p.id !== product.id)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const rank = (p: Product) =>
          p.product_kind === "ingredient" ? 0 : p.product_kind === "prepared" ? 1 : 2;
        const d = rank(a) - rank(b);
        return d !== 0 ? d : a.name.localeCompare(b.name, "es");
      })
      .slice(0, 16);
  }, [catalog, recipeItems, search, product]);

  const kitCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((p) => !p.is_kit)
      .filter((p) => !kitItems.some((k) => k.component_product_id === p.id))
      .filter((p) => !product || p.id !== product.id)
      .filter((p) => p.product_kind !== "ingredient") // prefer elaborados/carta
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [catalog, kitItems, search, product]);

  // Also allow ingredients in kit search if user types
  const kitCandidatesFallback = useMemo(() => {
    if (kitCandidates.length > 0) return kitCandidates;
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((p) => !p.is_kit)
      .filter((p) => !kitItems.some((k) => k.component_product_id === p.id))
      .filter((p) => !product || p.id !== product.id)
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [kitCandidates, catalog, kitItems, search, product]);

  function requestClose(): boolean {
    void (async () => {
      if (await confirmDiscard()) onClose();
    })();
    return false;
  }

  async function persist(andCreateAnother: boolean) {
    if (!form.name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    const kind = createKind;
    if (!kind) {
      setError("Elegí el tipo de producto.");
      return;
    }
    const isKit = kind === "kit" || kind === "daily_menu";
    const isPrepared = kind === "prepared";
    if (isKit && kitItems.length === 0) {
      setError("El combo necesita al menos un componente.");
      return;
    }
    if (isPrepared && recipeItems.length === 0) {
      setError("Agregá al menos un insumo a la receta.");
      return;
    }
    if (isPrepared && calculatedRecipeCost <= 0) {
      setError("La receta no tiene costo: cargá el costo de los insumos.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const prepareMode: PrepareMode | null = isPrepared
        ? form.prepare_mode === "on_demand"
          ? "on_demand"
          : "batch"
        : null;
      const trackStock = kind === "ingredient" || (isPrepared && prepareMode === "batch");
      const showOnMenu =
        kind === "ingredient" || isPrepared
          ? form.show_on_menu === true
          : form.show_on_menu !== false;

      let imagePath = removeImage ? null : (form.image_path ?? null);
      const payload: ProductInput = {
        ...form,
        name: form.name.trim(),
        description: form.description?.trim().slice(0, 280) || null,
        product_kind: isKit ? "kit" : kind,
        prepare_mode: prepareMode,
        is_kit: isKit,
        is_daily_menu: kind === "daily_menu" || Boolean(form.is_daily_menu && isKit),
        track_stock: trackStock,
        show_on_menu: showOnMenu,
        stock: trackStock ? form.stock : 0,
        cost:
          isPrepared && calculatedRecipeCost > 0
            ? Math.round(calculatedRecipeCost * 100) / 100
            : isKit && kitCost > 0
              ? Math.round(kitCost * 100) / 100
              : form.cost,
        menu_schedule:
          kind === "daily_menu" ? JSON.stringify(schedule) : null,
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

      await saveProductKit(
        id,
        isKit
          ? kitItems.map((k) => ({
              component_product_id: k.component_product_id,
              qty: k.qty,
            }))
          : [],
      );
      await saveProductRecipe(
        id,
        isPrepared
          ? {
              yield_qty: yieldQty > 0 ? yieldQty : 1,
              items: recipeItems.map((r) => ({
                ingredient_product_id: r.ingredient_product_id,
                qty: r.qty,
              })),
            }
          : null,
      );
      await saveProductModifiers(id, isKit || isPrepared ? modifiers : []);

      onSaved();
      if (andCreateAnother && !product) {
        applyKindDefaults(kind);
        setKitItems([]);
        setRecipeItems([]);
        setYieldQty(1);
        setModifiers([]);
        setPendingImageSource(null);
        setImagePreview(null);
        setForm((f) => ({ ...f, name: "", description: "", barcode: "", stock: 0, price: 0 }));
      } else {
        onClose();
      }
    } catch (e) {
      setError(formatDbError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      const id = await createCategory(name);
      if (!id) return;
      const next = [
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
    }
  }

  const previewOnMenu = form.show_on_menu !== false && createKind !== "ingredient";
  const title = product
    ? "Editar producto"
    : showTypePicker
      ? "Nuevo producto"
      : `Nuevo: ${KIND_OPTIONS.find((k) => k.id === createKind)?.title ?? "producto"}`;

  return (
    <Modal open={open} title={title} onClose={onClose} onRequestClose={requestClose} wide>
      {showTypePicker ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            ¿Qué vas a cargar? Cada tipo muestra solo los campos que necesitás.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => applyKindDefaults(opt.id)}
                className="flex gap-3 rounded-xl border border-[var(--color-panel-border)] p-4 text-left transition hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-900/20"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/50">
                  <opt.icon size={22} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{opt.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{opt.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0 space-y-4">
            {!product && (
              <button
                type="button"
                className="text-xs text-brand-600 hover:underline"
                onClick={() => {
                  setPickedKind(null);
                  setError("");
                }}
              >
                ← Cambiar tipo
              </button>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Nombre"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={rubroDef.productNamePlaceholder}
                  autoFocus
                />
              </div>
              <Select
                label="Categoría"
                value={form.category_id ?? ""}
                onChange={(e) =>
                  set("category_id", e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">Sin categoría</option>
                {localCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Unidad"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
              >
                {(rubroDef.units.length
                  ? rubroDef.units
                  : ["unidad", "porción", "kg", "litro", "g", "ml"]
                ).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
              {showNewCategory ? (
                <div className="sm:col-span-2 flex gap-2">
                  <Input
                    label="Nueva categoría"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <Button type="button" className="mt-6" onClick={() => void handleCreateCategory()}>
                    Crear
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="sm:col-span-2 text-left text-xs text-brand-600 hover:underline"
                  onClick={() => setShowNewCategory(true)}
                >
                  + Nueva categoría
                </button>
              )}

              {createKind === "ingredient" && (
                <>
                  <NumericInput
                    label="Costo"
                    value={form.cost}
                    onChange={(v) => set("cost", v)}
                  />
                  <Select
                    label="Proveedor"
                    value={form.supplier_id ?? ""}
                    onChange={(e) =>
                      set("supplier_id", e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">Sin proveedor</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <NumericInput
                    label="Stock actual"
                    value={form.stock}
                    onChange={(v) => set("stock", v)}
                  />
                  <NumericInput
                    label="Stock mínimo"
                    value={form.min_stock}
                    onChange={(v) => set("min_stock", v)}
                  />
                </>
              )}

              {createKind === "prepared" && (
                <>
                  <div className="sm:col-span-2 rounded-xl border border-[var(--color-panel-border)] p-3 space-y-2">
                    <p className="text-sm font-semibold text-ink">¿Cómo se prepara?</p>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="radio"
                        className="mt-1"
                        checked={form.prepare_mode !== "on_demand"}
                        onChange={() => {
                          set("prepare_mode", "batch");
                          set("track_stock", true);
                        }}
                      />
                      <span>
                        <span className="font-medium">Se produce previamente</span>
                        <span className="block text-xs text-ink-muted">
                          Acción «Producir»: descuenta insumos y suma stock del elaborado.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="radio"
                        className="mt-1"
                        checked={form.prepare_mode === "on_demand"}
                        onChange={() => {
                          set("prepare_mode", "on_demand");
                          set("track_stock", false);
                          set("stock", 0);
                        }}
                      />
                      <span>
                        <span className="font-medium">Se prepara al momento</span>
                        <span className="block text-xs text-ink-muted">
                          Al vender, descuenta directo los insumos de la receta (sin stock del plato).
                        </span>
                      </span>
                    </label>
                  </div>
                  <NumericInput
                    label="Precio de venta"
                    value={form.price}
                    onChange={(v) => set("price", v)}
                  />
                  <div>
                    <p className="mb-1 text-xs font-medium text-ink-muted">Costo calculado</p>
                    <p className="text-sm tabular-nums text-ink">
                      {currency}
                      {calculatedRecipeCost.toFixed(2)}
                      <span className="ml-1 text-xs text-ink-muted">/ {form.unit}</span>
                    </p>
                  </div>
                  {form.prepare_mode !== "on_demand" && (
                    <>
                      <NumericInput
                        label="Stock actual"
                        value={form.stock}
                        onChange={(v) => set("stock", v)}
                      />
                      <NumericInput
                        label="Stock mínimo"
                        value={form.min_stock}
                        onChange={(v) => set("min_stock", v)}
                      />
                    </>
                  )}
                </>
              )}

              {(createKind === "kit" || createKind === "daily_menu") && (
                <>
                  <NumericInput
                    label="Precio de venta"
                    value={form.price}
                    onChange={(v) => set("price", v)}
                  />
                  <div>
                    <p className="mb-1 text-xs font-medium text-ink-muted">Costo componentes</p>
                    <p className="text-sm tabular-nums text-ink">
                      {currency}
                      {kitCost.toFixed(2)}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Receta */}
            {createKind === "prepared" && (
              <section className="space-y-3 rounded-xl border border-[var(--color-panel-border)] p-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">Receta</p>
                    <p className="text-xs text-ink-muted">
                      Insumos o elaborados por rendimiento. Ej: medallón → carne molida; hamburguesa →
                      1 medallón + pan.
                    </p>
                  </div>
                  <NumericInput
                    label="Rendimiento"
                    value={yieldQty}
                    onChange={(v) => setYieldQty(Math.max(0.001, v || 1))}
                    className="!w-28"
                  />
                </div>
                {recipeItems.length === 0 ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Receta incompleta: agregá insumos.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {recipeItems.map((r) => (
                      <li
                        key={r.ingredient_product_id}
                        className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2 rounded-lg bg-[var(--color-input-bg)] px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-ink">{r.name}</p>
                          <p className="text-[11px] text-ink-muted">
                            {currency}
                            {r.cost}/{r.unit} · stock {r.stock}
                          </p>
                        </div>
                        <NumericField
                          value={r.qty}
                          onChange={(n) =>
                            setRecipeItems((rows) =>
                              rows.map((x) =>
                                x.ingredient_product_id === r.ingredient_product_id
                                  ? { ...x, qty: Math.max(0.001, n || 0.001) }
                                  : x,
                              ),
                            )
                          }
                          className="!w-full !rounded !px-2 !py-1"
                        />
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() =>
                            setRecipeItems((rows) =>
                              rows.filter(
                                (x) => x.ingredient_product_id !== r.ingredient_product_id,
                              ),
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
                  label="Buscar insumo o elaborado"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Carne molida, medallón…"
                />
                {search.trim() && (
                  <ul className="max-h-36 overflow-y-auto rounded-lg border border-[var(--color-panel-border)]">
                    {ingredientCandidates.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50/50 dark:hover:bg-brand-900/20"
                          onClick={() => {
                            setRecipeItems((rows) => [
                              ...rows,
                              {
                                ingredient_product_id: p.id,
                                name: p.name,
                                unit: p.unit,
                                cost: p.cost,
                                stock: p.stock,
                                qty: p.product_kind === "prepared" ? 1 : 0.25,
                              },
                            ]);
                            setSearch("");
                          }}
                        >
                          <span className="min-w-0 truncate">
                            {p.name}
                            {p.product_kind === "prepared" ? (
                              <span className="ml-1 text-[10px] text-brand-600">elaborado</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-xs text-ink-muted">
                            {p.unit} · stock {p.stock}
                          </span>
                        </button>
                      </li>
                    ))}
                    {ingredientCandidates.length === 0 && (
                      <li className="px-3 py-2 text-xs text-ink-muted">
                        Sin coincidencias. Probá con el nombre del insumo o del elaborado.
                      </li>
                    )}
                  </ul>
                )}
              </section>
            )}

            {/* Combo builder */}
            {(createKind === "kit" || createKind === "daily_menu") && (
              <section className="space-y-3 rounded-xl border border-[var(--color-panel-border)] p-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Componentes</p>
                  <p className="text-xs text-ink-muted">
                    Sin stock propio: al vender se descuenta cada ítem (o sus insumos si es al
                    momento).
                  </p>
                </div>
                {kitItems.length === 0 ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Combo sin componentes.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {kitItems.map((k) => (
                      <li
                        key={k.component_product_id}
                        className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-2 rounded-lg bg-[var(--color-input-bg)] px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-ink">{k.name}</p>
                          <p className="text-[11px] text-ink-muted">
                            costo {currency}
                            {((k.cost ?? 0) * k.qty).toFixed(2)} · stock {k.stock ?? "—"}{" "}
                            {k.unit ?? ""}
                          </p>
                        </div>
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
                          className="!w-full !rounded !px-2 !py-1"
                        />
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() =>
                            setKitItems((rows) =>
                              rows.filter(
                                (r) => r.component_product_id !== k.component_product_id,
                              ),
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
                  label="Buscar componente"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Milanesa, papas fritas…"
                />
                {search.trim() && (
                  <ul className="max-h-36 overflow-y-auto rounded-lg border border-[var(--color-panel-border)]">
                    {kitCandidatesFallback.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50/50"
                          onClick={() => {
                            setKitItems((rows) => [
                              ...rows,
                              {
                                component_product_id: p.id,
                                name: p.name,
                                qty: 1,
                                cost: p.cost,
                                stock: p.stock,
                                unit: p.unit,
                              },
                            ]);
                            setSearch("");
                          }}
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="shrink-0 text-xs text-ink-muted">
                            {currency}
                            {p.price} · stock {p.stock}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {createKind === "daily_menu" && (
              <section className="space-y-3 rounded-xl border border-[var(--color-panel-border)] p-3">
                <p className="text-sm font-semibold text-ink">Disponibilidad</p>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d) => {
                    const on = schedule.days.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() =>
                          setSchedule((s) => ({
                            ...s,
                            days: on
                              ? s.days.filter((x) => x !== d.id)
                              : [...s.days, d.id],
                          }))
                        }
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                          on
                            ? "bg-brand-600 text-white"
                            : "bg-[var(--color-input-bg)] text-ink-muted"
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Desde"
                    type="time"
                    value={schedule.from}
                    onChange={(e) => setSchedule((s) => ({ ...s, from: e.target.value }))}
                  />
                  <Input
                    label="Hasta"
                    type="time"
                    value={schedule.to}
                    onChange={(e) => setSchedule((s) => ({ ...s, to: e.target.value }))}
                  />
                </div>
              </section>
            )}

            {(createKind === "prepared" ||
              createKind === "kit" ||
              createKind === "daily_menu") && (
              <>
                <Input
                  label="Descripción (carta web)"
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                  hint="Máx. 280 caracteres. En combos, si está vacío se listan los componentes."
                />
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--color-panel-border)] px-3 py-2.5">
                  <span>
                    <span className="block text-sm font-semibold text-ink">Mostrar en carta web</span>
                    <span className="text-xs text-ink-muted">
                      {createKind === "prepared"
                        ? "Por defecto off: el elaborado suele ir dentro de un combo."
                        : "Por defecto on para combos y menú."}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className={toggleCheckClass}
                    checked={form.show_on_menu === true}
                    onChange={(e) => set("show_on_menu", e.target.checked)}
                  />
                </label>
              </>
            )}

            {createKind !== "ingredient" && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="h-14 w-14 overflow-hidden rounded-lg border border-[var(--color-panel-border)]">
                  {imagePreview || form.image_path ? (
                    <ProductThumb
                      imagePath={imagePreview ? null : form.image_path}
                      previewUrl={imagePreview}
                      alt={form.name}
                      size="md"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink-muted">
                      <ImagePlus size={18} />
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1.5 text-sm"
                  onClick={async () => {
                    try {
                      const picked = await pickAndPreviewProductImage();
                      if (!picked) return;
                      setPendingImageSource(picked.sourcePath);
                      setImagePreview(picked.previewUrl);
                      setRemoveImage(false);
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  Foto
                </Button>
              </div>
            )}

            {(createKind === "prepared" || createKind === "kit") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">Extras / modificadores</p>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => setModifiers((m) => [...m, { name: "", price_delta: 0 }])}
                  >
                    <Plus size={14} /> Agregar
                  </Button>
                </div>
                {modifiers.map((m, idx) => (
                  <div key={m.id ?? idx} className="grid grid-cols-[1fr_6rem_auto] gap-2">
                    <Input
                      value={m.name}
                      placeholder="Extra queso"
                      onChange={(e) =>
                        setModifiers((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)),
                        )
                      }
                    />
                    <NumericField
                      value={m.price_delta}
                      onChange={(n) =>
                        setModifiers((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, price_delta: n } : r)),
                        )
                      }
                      className="!rounded !px-2 !py-2"
                    />
                    <button
                      type="button"
                      onClick={() => setModifiers((rows) => rows.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {product && movements.length > 0 && (
              <section className="space-y-2 rounded-xl border border-[var(--color-panel-border)] p-3">
                <p className="text-sm font-semibold text-ink">Movimientos de stock</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                  {movements.map((m) => (
                    <li key={m.id} className="flex justify-between gap-2 tabular-nums text-ink-muted">
                      <span className="min-w-0 truncate">
                        {m.created_at.slice(0, 16)} · {labelMovement(m.movement_type)}
                      </span>
                      <span className={m.qty < 0 ? "text-red-600" : "text-emerald-700"}>
                        {m.qty > 0 ? "+" : ""}
                        {m.qty}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-panel-border)] pt-3">
              <Button type="button" variant="secondary" onClick={() => void requestClose()}>
                Cancelar
              </Button>
              {!product && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => void persist(true)}
                >
                  Guardar y crear otro
                </Button>
              )}
              <Button type="button" disabled={saving} onClick={() => void persist(false)}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>

          {/* Vista previa carta */}
          <aside className="hidden min-w-0 lg:block">
            <div className="sticky top-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Vista previa carta
              </p>
              {!previewOnMenu ? (
                <p className="text-xs text-ink-muted">
                  No se muestra en walqo.pro/carta
                  {createKind === "ingredient" ? " (insumos ocultos por defecto)." : "."}
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="font-semibold text-ink">{form.name || "Sin nombre"}</p>
                  {(createKind === "kit" || createKind === "daily_menu") &&
                    kitItems.length > 0 && (
                      <p className="text-xs text-ink-muted">
                        {kitItems.map((k) => `${k.qty}× ${k.name}`).join(" · ")}
                      </p>
                    )}
                  {form.description?.trim() && (
                    <p className="text-xs text-ink-muted line-clamp-3">{form.description}</p>
                  )}
                  <p className="pt-1 text-sm font-semibold tabular-nums text-ink">
                    {currency}
                    {Number(form.price || 0).toLocaleString("es-AR")}
                  </p>
                  {createKind === "daily_menu" && (
                    <p className="text-[11px] text-brand-600">Menú del día</p>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </Modal>
  );
}
