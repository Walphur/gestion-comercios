import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Star,
  Package,
  Tag,
} from "lucide-react";
import StockBadge from "../components/StockBadge";
import { isLowStock } from "../lib/stock";
import PurchaseEntryModal from "../components/PurchaseEntryModal";
import ProductImport from "../components/ProductImport";
import CatalogManager from "../components/CatalogManager";
import ProductAddMenu, { type ProductAddChoice } from "../components/ProductAddMenu";
import ProductMoreActions from "../components/ProductMoreActions";
import ProductFilters, {
  toProductFilter,
  type CatalogFilterValues,
} from "../components/ProductFilters";
import { useAuth } from "../context/AuthContext";
import { PageHeader, Button, Input, PageContent, IconButton, DataTableShell, EmptyState, TablePagination } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { printProductLabels } from "../lib/prints/productLabels";
import {
  listProducts,
  deleteProduct,
  bulkAdjustPrices,
  countActiveProducts,
  countProducts,
  deleteAllActiveProducts,
  PRODUCT_PAGE_SIZE,
} from "../db/products";
import { listCategories } from "../db/categories";
import { listBrands } from "../db/brands";
import { listSuppliers } from "../db/suppliers";
import { countDemoProductsActive, removeDemoCatalog, seedDemoCatalog } from "../db/demo";
import {
  countCatalogProducts,
  countRecoverableProducts,
  reactivateImportProducts,
  purgeInactiveImportProducts,
  exportProductsCsv,
  pickExportProductsPath,
  removeSupermarketCatalog,
} from "../lib/tauri";
import { withRustDb } from "../lib/rustDb";
import type { Brand, Category, Product, Supplier } from "../types";
import { formatMoney, formatUnitShort } from "../lib/format";
import { confirmAction, confirmDelete } from "../lib/confirm";
import ProductForm from "./ProductForm";
import ProductBulkBar from "../components/ProductBulkBar";
import PercentPromptModal from "../components/PercentPromptModal";
import { showUserError, showUserSuccess } from "../lib/notice";
import { getPosFavoriteIds, togglePosFavorite as togglePosFavoriteDb } from "../db/posQuickPick";
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";
import { entitlementBlockedMessage } from "../config/planEntitlements";

const EMPTY_FILTERS: CatalogFilterValues = {
  categoryId: "",
  brandId: "",
  supplierId: "",
};

/** Nombre corto en listado: deja espacio a código/categoría/precios. */
const PRODUCT_NAME_LIST_MAX = 36;

function shortProductName(name: string, max = PRODUCT_NAME_LIST_MAX): string {
  const t = name.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export default function Products() {
  const { currency, rubroDef } = useAppConfig();
  const { can, user } = useAuth();
  const { facturaIa, catalogSuper } = usePlanEntitlements();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [catalogFilters, setCatalogFilters] = useState<CatalogFilterValues>(EMPTY_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [demoCount, setDemoCount] = useState(0);
  const [removingDemo, setRemovingDemo] = useState(false);
  const [importTab, setImportTab] = useState<"list" | "supermarket">("list");
  const [catalogCounts, setCatalogCounts] = useState({ supermarket: 0, legacy: 0 });
  const [recoverableCount, setRecoverableCount] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [purgingRecoverable, setPurgingRecoverable] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [page, setPage] = useState(1);
  const [clearingAll, setClearingAll] = useState(false);
  const removableCatalog = catalogCounts.supermarket;
  const [removingSupermarket, setRemovingSupermarket] = useState(false);
  const [purchaseEntryOpen, setPurchaseEntryOpen] = useState(false);
  const [purchaseEntryAutoIa, setPurchaseEntryAutoIa] = useState(false);
  const [focusedProduct, setFocusedProduct] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [posFavoriteIds, setPosFavoriteIds] = useState<Set<number>>(new Set());
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const reloadMeta = useCallback(async () => {
    const [c, b, s] = await Promise.all([
      listCategories(),
      listBrands(),
      listSuppliers(),
    ]);
    setCategories(c);
    setBrands(b);
    setSuppliers(s);
  }, []);

  const reload = useCallback(async () => {
    const filter = {
      ...toProductFilter(search, catalogFilters),
      page,
      pageSize: PRODUCT_PAGE_SIZE,
    };
    const [p, totalActive, totalFiltered] = await Promise.all([
      listProducts(filter),
      countActiveProducts(),
      countProducts(toProductFilter(search, catalogFilters)),
    ]);
    setProducts(p);
    setActiveCount(totalActive);
    setFilteredCount(totalFiltered);
    await reloadMeta();
    const favIds = await getPosFavoriteIds();
    setPosFavoriteIds(new Set(favIds));
  }, [search, catalogFilters, page, reloadMeta]);

  useEffect(() => {
    setPage(1);
  }, [search, catalogFilters]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredCount / PRODUCT_PAGE_SIZE));
    if (page > maxPage) setPage(maxPage);
  }, [filteredCount, page]);

  useEffect(() => {
    const t = setTimeout(reload, 200);
    return () => clearTimeout(t);
  }, [reload]);

  useEffect(() => {
    if (!can("manage_products")) return;
    const abrir = searchParams.get("abrir");
    const nuevo = searchParams.get("nuevo");
    if (nuevo === "1") {
      setAddMenuOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("nuevo");
      setSearchParams(next, { replace: true });
      return;
    }
    if (abrir !== "importar" && abrir !== "supermercado") return;
    setImportTab(abrir === "supermercado" || searchParams.get("tipo") === "super" ? "supermarket" : "list");
    setImportOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("abrir");
    next.delete("tipo");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, can]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(products.map((p) => p.id));
      const next = new Set<number>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [products]);

  const refreshCatalogCounts = useCallback(() => {
    countCatalogProducts()
      .then(setCatalogCounts)
      .catch(() => setCatalogCounts({ supermarket: 0, legacy: 0 }));
    countRecoverableProducts()
      .then((c) => setRecoverableCount(c.inactive_imports))
      .catch(() => setRecoverableCount(0));
  }, []);

  useEffect(() => {
    countDemoProductsActive().then(setDemoCount).catch(console.error);
    refreshCatalogCounts();
  }, [products, refreshCatalogCounts]);

  function handleAddChoice(choice: ProductAddChoice) {
    switch (choice) {
      case "manual":
        openNew();
        break;
      case "excel":
        setImportTab("list");
        setImportOpen(true);
        break;
      case "premium":
        if (!catalogSuper) {
          showUserError(entitlementBlockedMessage("catalogSuper"), "Plan mensual");
          return;
        }
        setImportTab("supermarket");
        setImportOpen(true);
        break;
      case "invoice":
        if (!facturaIa) {
          showUserError(entitlementBlockedMessage("facturaIa"), "Plan mensual");
          return;
        }
        setPurchaseEntryAutoIa(true);
        setPurchaseEntryOpen(true);
        break;
    }
  }

  async function handleLoadDemo() {
    const r = await seedDemoCatalog();
    showUserSuccess(`Se cargaron ${r.added} productos de ejemplo.`);
    reload();
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setFormOpen(true);
  }

  const handleDelete = useCallback(
    async (p: Product) => {
      if (!(await confirmDelete(p.name))) return;
      try {
        await deleteProduct(p.id);
        setFocusedProduct((prev) => (prev?.id === p.id ? null : prev));
        reload();
      } catch (e) {
        showUserError(e);
      }
    },
    [reload],
  );

  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape") {
        if (formOpen || importOpen || catalogOpen || purchaseEntryOpen) {
          if (typing) return;
          e.preventDefault();
          const ok = await confirmAction({
            title: "Cerrar ventana",
            message: "¿Cerrar esta ventana?",
            detail: "Si estabas editando, los cambios no guardados se pierden.",
            variant: "default",
            confirmLabel: "Cerrar",
          });
          if (!ok) return;
          setFormOpen(false);
          setImportOpen(false);
          setCatalogOpen(false);
          setPurchaseEntryOpen(false);
        } else if (search.trim()) {
          e.preventDefault();
          if (
            await confirmAction({
              message: "¿Limpiar la búsqueda?",
              variant: "default",
              confirmLabel: "Limpiar",
            })
          ) {
            setSearch("");
          }
        }
      }
      if ((e.key === "Delete" || e.key === "Supr") && focusedProduct && !typing && !formOpen) {
        e.preventDefault();
        void handleDelete(focusedProduct);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formOpen, importOpen, catalogOpen, purchaseEntryOpen, search, focusedProduct, handleDelete]);

  async function applyBulkPricePct(pct: number) {
    try {
      const n = await bulkAdjustPrices(pct, {
        categoryId: catalogFilters.categoryId === "" ? null : catalogFilters.categoryId,
        brandId: catalogFilters.brandId === "" ? null : catalogFilters.brandId,
        supplierId: catalogFilters.supplierId === "" ? null : catalogFilters.supplierId,
      });
      showUserSuccess(`Precios actualizados en ${n} producto(s).`);
      reload();
    } catch (e) {
      showUserError(e);
    }
  }

  async function handleExportCsv() {
    try {
      await withRustDb(async () => {
        const path = await pickExportProductsPath();
        if (!path) return;
        const n = await exportProductsCsv(path);
        showUserSuccess(`Se exportaron ${n} productos correctamente.`);
      });
    } catch (e) {
      showUserError(e);
    }
  }

  async function handleRemoveSupermarket() {
    const ok = await confirmAction({
      title: "Quitar catálogo masivo",
      message: `¿Quitar ${removableCatalog > 0 ? removableCatalog.toLocaleString("es-AR") : "los"} productos importados del listado grande?`,
      detail:
        "Solo quita el catálogo masivo de supermercado (~190.000). No toca tus Excel ni productos cargados a mano.",
      variant: "danger",
      confirmLabel: "Sí, quitar catálogo",
    });
    if (!ok) return;
    setRemovingSupermarket(true);
    try {
      const n = await withRustDb(() => removeSupermarketCatalog(false));
      showUserSuccess(
        n > 0
          ? `Se quitaron ${n.toLocaleString("es-AR")} productos del catálogo.`
          : "No había productos del catálogo para quitar.",
      );
      await reload();
      refreshCatalogCounts();
    } catch (e) {
      showUserError(e);
    } finally {
      setRemovingSupermarket(false);
    }
  }

  async function handleRecoverImports() {
    if (
      !(await confirmAction({
        title: "Recuperar productos",
        message: `¿Reactivar ${recoverableCount.toLocaleString("es-AR")} producto(s) que se ocultaron por error?`,
        detail:
          "Pasa si se usó «Quitar catálogo» con un Excel importado. No recupera el catálogo masivo de supermercado que quitaste a propósito.",
        confirmLabel: "Sí, recuperar",
      }))
    ) {
      return;
    }
    setRecovering(true);
    try {
      const n = await withRustDb(() => reactivateImportProducts());
      showUserSuccess(
        n > 0
          ? `Se recuperaron ${n.toLocaleString("es-AR")} productos.`
          : "No había productos para recuperar.",
      );
      await reload();
      refreshCatalogCounts();
    } catch (e) {
      showUserError(e);
    } finally {
      setRecovering(false);
    }
  }

  async function handlePurgeRecoverable() {
    if (
      !(await confirmAction({
        title: "Eliminar recuperados",
        message: `Se van a borrar definitivamente ${recoverableCount.toLocaleString("es-AR")} producto(s) ocultos (ya no se podrán recuperar).`,
        detail:
          "Libera espacio en la base. No toca productos activos. Si alguno tuvo ventas, se deja.",
        variant: "danger",
        confirmLabel: "Sí, borrar definitivamente",
      }))
    ) {
      return;
    }
    setPurgingRecoverable(true);
    try {
      const n = await withRustDb(() => purgeInactiveImportProducts());
      showUserSuccess(
        n > 0
          ? `Se borraron ${n.toLocaleString("es-AR")} productos recuperables.`
          : "No había productos para borrar (o están vinculados a ventas).",
      );
      await reload();
      refreshCatalogCounts();
    } catch (e) {
      showUserError(e);
    } finally {
      setPurgingRecoverable(false);
    }
  }

  async function handleRemoveDemo() {
    if (
      !(await confirmAction({
        title: "Quitar ejemplos",
        message: "¿Quitar todos los productos de ejemplo del catálogo?",
        variant: "danger",
        confirmLabel: "Sí, quitar",
      }))
    ) {
      return;
    }
    setRemovingDemo(true);
    try {
      const n = await removeDemoCatalog();
      showUserSuccess(
        n > 0 ? `Se quitaron ${n} productos de ejemplo.` : "No había productos de ejemplo activos.",
      );
      await reload();
      refreshCatalogCounts();
    } catch (e) {
      showUserError(e);
    } finally {
      setRemovingDemo(false);
    }
  }

  async function handleClearAllProducts() {
    if (
      !(await confirmAction({
        title: "Eliminar todos los productos",
        message: `Se van a ocultar ${activeCount} producto(s) del catálogo. Después podés volver a importar lista.xlsx limpio. ¿Continuar?`,
        variant: "danger",
        confirmLabel: "Sí, eliminar todos",
      }))
    ) {
      return;
    }
    setClearingAll(true);
    try {
      const n = await deleteAllActiveProducts();
      showUserSuccess(n > 0 ? `Se eliminaron ${n} productos.` : "No había productos activos.");
      clearSelection();
      await reload();
      refreshCatalogCounts();
    } catch (e) {
      showUserError(e);
    } finally {
      setClearingAll(false);
    }
  }

  const fields = rubroDef.fields;
  const allVisibleSelected =
    products.length > 0 && products.every((p) => selectedIds.has(p.id));
  const someSelected = selectedIds.size > 0;

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function afterBulk() {
    clearSelection();
    reload();
  }

  async function handleTogglePosFavorite(productId: number) {
    const nowFav = await togglePosFavoriteDb(productId);
    setPosFavoriteIds((prev) => {
      const next = new Set(prev);
      if (nowFav) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle={
          filteredCount > PRODUCT_PAGE_SIZE
            ? `${filteredCount.toLocaleString("es-AR")} con filtros · página ${page}`
            : `${activeCount.toLocaleString("es-AR")} artículo${activeCount === 1 ? "" : "s"}`
        }
        actions={
          <>
            <ProductMoreActions
              canManage={can("manage_products")}
              demoCount={demoCount}
              recoverableCount={recoverableCount}
              activeCount={activeCount}
              removingDemo={removingDemo}
              recovering={recovering}
              purgingRecoverable={purgingRecoverable}
              clearingAll={clearingAll}
              onCatalog={() => setCatalogOpen(true)}
              onExport={() => void handleExportCsv()}
              onBulkPrice={() => setBulkPriceOpen(true)}
              onRecover={() => void handleRecoverImports()}
              onPurgeRecoverable={() => void handlePurgeRecoverable()}
              onRemoveDemo={() => void handleRemoveDemo()}
              onLoadDemo={() => void handleLoadDemo()}
              onPurchaseEntry={() => setPurchaseEntryOpen(true)}
              onClearAll={() => void handleClearAllProducts()}
            />
            {can("manage_products") && (
              <Button onClick={() => setAddMenuOpen(true)}>
                <Plus size={16} /> Agregar producto
              </Button>
            )}
          </>
        }
      />

      <PageContent>
        <div className="mb-4 relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, código, marca, proveedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="mb-4">
          <ProductFilters
            categories={categories}
            brands={brands}
            suppliers={suppliers}
            value={catalogFilters}
            onChange={setCatalogFilters}
          />
        </div>

        {(catalogFilters.categoryId !== "" ||
          catalogFilters.brandId !== "" ||
          catalogFilters.supplierId !== "") && (
          <button
            type="button"
            onClick={() => setCatalogFilters(EMPTY_FILTERS)}
            className="mb-4 text-sm text-brand-700 hover:underline"
          >
            Limpiar filtros
          </button>
        )}

        <ProductBulkBar
          selectedIds={[...selectedIds]}
          categories={categories}
          brands={brands}
          suppliers={suppliers}
          units={rubroDef.units}
          showUnit={fields.unitMeasure}
          onClear={clearSelection}
          onDone={afterBulk}
        />

        <DataTableShell
          className="data-table-wrap--products"
          footer={
            <TablePagination
              page={page}
              totalPages={Math.max(1, Math.ceil(filteredCount / PRODUCT_PAGE_SIZE))}
              total={filteredCount}
              pageSize={PRODUCT_PAGE_SIZE}
              onPage={setPage}
            />
          }
        >
          <div className="products-list">
            <div className="products-list__head" role="row">
              <div className="products-list__check">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allVisibleSelected;
                  }}
                  onChange={toggleSelectAll}
                  title="Seleccionar todos los visibles"
                  className="h-4 w-4 rounded border-[var(--color-panel-border)]"
                />
              </div>
              <div className="products-list__actions" title="Acciones">
                Acc.
              </div>
              <div className="products-list__product">Producto</div>
              <div className="products-list__code">{fields.barcode ? "Código" : ""}</div>
              <div className="products-list__cat">Categoría</div>
              <div className="products-list__brand">Marca</div>
              <div className="products-list__unit">{fields.unitMeasure ? "Unid." : ""}</div>
              <div className="products-list__money">Costo</div>
              <div className="products-list__money">Precio</div>
              <div className="products-list__stock">Stock</div>
            </div>

            {products.length === 0 && (
              <div className="products-list__empty">
                <EmptyState
                  compact
                  icon={Package}
                  title="No hay productos"
                  description="No hay productos con estos filtros. Agregá uno para empezar a vender."
                  action={
                    can("manage_products") ? (
                      <Button size="sm" onClick={() => setAddMenuOpen(true)}>
                        <Plus size={16} /> Agregar producto
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            )}

            {products.map((p) => {
              const low = isLowStock(p.stock, p.min_stock);
              return (
                <div
                  key={p.id}
                  role="row"
                  tabIndex={0}
                  onFocus={() => setFocusedProduct(p)}
                  onClick={() => setFocusedProduct(p)}
                  className={[
                    "products-list__row",
                    focusedProduct?.id === p.id ? "is-focused" : "",
                    selectedIds.has(p.id) ? "is-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="products-list__check">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-[var(--color-panel-border)]"
                    />
                  </div>
                  <div className="products-list__actions">
                    <div className="row-actions">
                      <IconButton
                        label={
                          posFavoriteIds.has(p.id)
                            ? "Quitar de favoritos"
                            : "Favorito en punto de venta"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleTogglePosFavorite(p.id);
                        }}
                        className={
                          posFavoriteIds.has(p.id) ? "text-amber-500 hover:text-amber-600" : ""
                        }
                      >
                        <Star
                          size={14}
                          className={posFavoriteIds.has(p.id) ? "fill-current" : ""}
                        />
                      </IconButton>
                      <IconButton label="Editar" onClick={() => openEdit(p)}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton
                        label="Imprimir etiqueta"
                        onClick={(e) => {
                          e.stopPropagation();
                          void printProductLabels([p], currency).catch((err) => showUserError(err));
                        }}
                      >
                        <Tag size={14} />
                      </IconButton>
                      <IconButton
                        label="Eliminar"
                        variant="danger"
                        onClick={() => handleDelete(p)}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  </div>
                  <div className="products-list__product">
                    <p className="products-list__name" title={p.name}>
                      {shortProductName(p.name)}
                    </p>
                    {p.supplier_name ? (
                      <p className="products-list__sub" title={p.supplier_name}>
                        {shortProductName(p.supplier_name, 28)}
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="products-list__code"
                    title={fields.barcode ? p.barcode || p.sku || undefined : undefined}
                  >
                    {fields.barcode ? p.barcode || p.sku || "—" : ""}
                  </div>
                  <div className="products-list__cat" title={p.category_name ?? undefined}>
                    {p.category_name ?? "—"}
                  </div>
                  <div className="products-list__brand" title={p.brand_name ?? undefined}>
                    {p.brand_name ?? "—"}
                  </div>
                  <div className="products-list__unit">
                    {fields.unitMeasure ? formatUnitShort(p.unit) : ""}
                  </div>
                  <div className="products-list__money is-cost is-muted">
                    {formatMoney(p.cost ?? 0, currency)}
                  </div>
                  <div className="products-list__money">{formatMoney(p.price, currency)}</div>
                  <div className="products-list__stock">
                    <StockBadge qty={p.stock} unit={p.unit} low={low} />
                  </div>
                </div>
              );
            })}
          </div>
        </DataTableShell>
      </PageContent>

      <ProductAddMenu
        open={addMenuOpen}
        onClose={() => setAddMenuOpen(false)}
        onChoose={handleAddChoice}
      />

      <ProductForm
        open={formOpen}
        product={editing}
        categories={categories}
        brands={brands}
        suppliers={suppliers}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />

      <ProductImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => {
          reload();
          refreshCatalogCounts();
        }}
        initialTab={importTab}
        supermarketImportedCount={removableCatalog}
        onRemoveSupermarket={handleRemoveSupermarket}
        removingSupermarket={removingSupermarket}
      />

      <CatalogManager
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onUpdated={reload}
      />

      <PurchaseEntryModal
        open={purchaseEntryOpen}
        onClose={() => {
          setPurchaseEntryOpen(false);
          setPurchaseEntryAutoIa(false);
        }}
        onDone={reload}
        userId={user?.id ?? null}
        currency={currency}
        autoStartIa={purchaseEntryAutoIa}
      />

      <PercentPromptModal
        open={bulkPriceOpen}
        title="Ajuste masivo de precios"
        description="Porcentaje sobre los productos que coincidan con los filtros activos (categoría, marca, proveedor). Ej: 15 sube 15%, -10 baja 10%."
        onClose={() => setBulkPriceOpen(false)}
        onConfirm={(pct) => void applyBulkPricePct(pct)}
      />
    </div>
  );
}
