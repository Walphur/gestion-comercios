import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Percent,
  Upload,
  Tags,
  Eraser,
  Download,
  Camera,
  Sparkles,
  Star,
} from "lucide-react";
import StockBadge from "../components/StockBadge";
import { isLowStock } from "../lib/stock";
import InvoiceScanModal from "../components/InvoiceScanModal";
import ProductImport from "../components/ProductImport";
import CatalogManager from "../components/CatalogManager";
import ProductFilters, {
  toProductFilter,
  type CatalogFilterValues,
} from "../components/ProductFilters";
import { useAuth } from "../context/AuthContext";
import { PageHeader, Button, Input } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import {
  listProducts,
  deleteProduct,
  bulkAdjustPrices,
} from "../db/products";
import { listCategories } from "../db/categories";
import { listBrands } from "../db/brands";
import { listSuppliers } from "../db/suppliers";
import { countDemoProductsActive, removeDemoCatalog, seedDemoCatalog } from "../db/demo";
import {
  countCatalogProducts,
  countRecoverableProducts,
  reactivateImportProducts,
  exportProductsCsv,
  getCatalogWizardState,
  pickExportProductsPath,
  removeSupermarketCatalog,
} from "../lib/tauri";
import { withRustDb } from "../lib/rustDb";
import type { Brand, Category, Product, Supplier } from "../types";
import { formatMoney, formatUnitShort } from "../lib/format";
import { confirmAction, confirmDelete } from "../lib/confirm";
import ProductForm from "./ProductForm";
import ProductBulkBar from "../components/ProductBulkBar";
import SupermarketCatalogModal from "../components/SupermarketCatalogModal";
import PercentPromptModal from "../components/PercentPromptModal";
import { formatDbError, isDbCorruptionError } from "../lib/dbError";
import { getPosFavoriteIds, togglePosFavorite as togglePosFavoriteDb } from "../db/posQuickPick";

const EMPTY_FILTERS: CatalogFilterValues = {
  categoryId: "",
  brandId: "",
  supplierId: "",
};

export default function Products() {
  const { currency, rubroDef } = useAppConfig();
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalogInInstaller, setCatalogInInstaller] = useState<boolean | null>(null);
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
  const [supermarketModalOpen, setSupermarketModalOpen] = useState(false);
  const [catalogCounts, setCatalogCounts] = useState({ supermarket: 0, legacy: 0 });
  const [recoverableCount, setRecoverableCount] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const removableCatalog = catalogCounts.supermarket;
  const [removingSupermarket, setRemovingSupermarket] = useState(false);
  const [invoiceScanOpen, setInvoiceScanOpen] = useState(false);
  const [focusedProduct, setFocusedProduct] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [posFavoriteIds, setPosFavoriteIds] = useState<Set<number>>(new Set());

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
    const filter = toProductFilter(search, catalogFilters);
    const p = await listProducts(filter);
    setProducts(p);
    await reloadMeta();
    const favIds = await getPosFavoriteIds();
    setPosFavoriteIds(new Set(favIds));
  }, [search, catalogFilters, reloadMeta]);

  useEffect(() => {
    const t = setTimeout(reload, 200);
    return () => clearTimeout(t);
  }, [reload]);

  useEffect(() => {
    getCatalogWizardState()
      .then((s) => setCatalogInInstaller(s.catalog_ready || s.bundled))
      .catch(() => setCatalogInInstaller(false));
  }, []);

  useEffect(() => {
    if (searchParams.get("abrir") === "supermercado" && can("manage_products")) {
      setSupermarketModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("abrir");
      setSearchParams(next, { replace: true });
    }
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
      await deleteProduct(p.id);
      setFocusedProduct((prev) => (prev?.id === p.id ? null : prev));
      reload();
    },
    [reload],
  );

  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape") {
        if (formOpen || importOpen || catalogOpen || invoiceScanOpen) {
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
          setInvoiceScanOpen(false);
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
  }, [formOpen, importOpen, catalogOpen, invoiceScanOpen, search, focusedProduct, handleDelete]);

  async function applyBulkPricePct(pct: number) {
    try {
      const n = await bulkAdjustPrices(pct, {
        categoryId: catalogFilters.categoryId === "" ? null : catalogFilters.categoryId,
        brandId: catalogFilters.brandId === "" ? null : catalogFilters.brandId,
        supplierId: catalogFilters.supplierId === "" ? null : catalogFilters.supplierId,
      });
      alert(`Precios actualizados en ${n} producto(s).`);
      reload();
    } catch (e) {
      alert(formatDbError(e));
    }
  }

  async function handleExportCsv() {
    try {
      await withRustDb(async () => {
        const path = await pickExportProductsPath();
        if (!path) return;
        const n = await exportProductsCsv(path);
        alert(`Exportados ${n} productos a:\n${path}`);
      });
    } catch (e) {
      const msg = formatDbError(e);
      alert(
        isDbCorruptionError(e)
          ? `${msg}\n\nAndá a Administración → «Restaurar desde copia .bak» y volvé a intentar.`
          : msg,
      );
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
      alert(
        n > 0
          ? `Se quitaron ${n.toLocaleString("es-AR")} productos del catálogo masivo.`
          : "No había productos del catálogo para quitar.",
      );
      await reload();
      refreshCatalogCounts();
    } catch (e) {
      const msg = formatDbError(e);
      alert(
        isDbCorruptionError(e)
          ? `${msg}\n\nPara los 20 de prueba usá «Quitar ejemplos». Reparar: Administración → Base de datos.`
          : msg,
      );
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
      alert(
        n > 0
          ? `Se recuperaron ${n.toLocaleString("es-AR")} productos.`
          : "No había productos para recuperar.",
      );
      await reload();
      refreshCatalogCounts();
    } catch (e) {
      alert(formatDbError(e));
    } finally {
      setRecovering(false);
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
      alert(n > 0 ? `Se quitaron ${n} productos de ejemplo.` : "No había productos de ejemplo activos.");
      await reload();
      refreshCatalogCounts();
    } catch (e) {
      const msg = formatDbError(e);
      alert(
        isDbCorruptionError(e)
          ? `${msg}\n\nUsá «Quitar ejemplos», no «Quitar catálogo». Si sigue: Administración → Reparar o Restaurar .bak.`
          : msg,
      );
    } finally {
      setRemovingDemo(false);
    }
  }

  const fields = rubroDef.fields;
  const colCount =
    7 + (fields.barcode ? 1 : 0) + (fields.unitMeasure ? 1 : 0);
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
        subtitle={`${products.length} artículo(s) mostrados`}
        actions={
          <>
            {can("manage_products") && (
              <>
                <Button variant="secondary" onClick={() => setCatalogOpen(true)}>
                  <Tags size={16} /> Categorías y marcas
                </Button>
                {demoCount > 0 && (
                  <Button
                    variant="secondary"
                    onClick={handleRemoveDemo}
                    disabled={removingDemo}
                  >
                    <Eraser size={16} />{" "}
                    {removingDemo ? "Quitando…" : `Quitar ejemplos (${demoCount})`}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setSupermarketModalOpen(true)}>
                  <Upload size={16} /> Catálogo supermercado
                </Button>
                {recoverableCount > 0 && (
                  <Button
                    variant="secondary"
                    onClick={handleRecoverImports}
                    disabled={recovering}
                  >
                    {recovering
                      ? "Recuperando…"
                      : `Recuperar productos (${recoverableCount})`}
                  </Button>
                )}
                {removableCatalog > 0 && (
                  <Button
                    variant="secondary"
                    onClick={handleRemoveSupermarket}
                    disabled={removingSupermarket}
                    className="text-red-600"
                  >
                    <Eraser size={16} />{" "}
                    {removingSupermarket
                      ? "Quitando catálogo…"
                      : `Quitar catálogo super (${removableCatalog})`}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setInvoiceScanOpen(true)}>
                  <Camera size={16} /> Factura (IA)
                </Button>
                {demoCount === 0 && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const r = await seedDemoCatalog();
                      alert(`Ejemplos: ${r.added} nuevos, ${r.skipped} ya existían.`);
                      reload();
                    }}
                  >
                    <Sparkles size={16} /> Cargar ejemplos
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  <Upload size={16} /> Excel / CSV
                </Button>
                <Button variant="secondary" onClick={handleExportCsv}>
                  <Download size={16} /> Exportar CSV
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={() => setBulkPriceOpen(true)}>
              <Percent size={16} /> Ajuste masivo
            </Button>
            <Button onClick={openNew}>
              <Plus size={16} /> Nuevo producto
            </Button>
          </>
        }
      />

      <div className="p-8">
        {can("manage_products") && (
          <div className="mb-6 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-ink">
            <p className="font-semibold">Módulo super (~190.000) — opcional</p>
            <p className="mt-1 text-ink-muted">
              {catalogInInstaller
                ? "Instalador con módulo super. Botón «Catálogo supermercado» arriba."
                : "App base sin super. «Excel / CSV» para tu lista; el catálogo grande es aparte."}
              {" "}
              Los ~20 de prueba se quitan con «Quitar ejemplos», no con «Quitar catálogo» (ese es solo
              para importaciones masivas del módulo super).
            </p>
          </div>
        )}
        <div className="mb-4 relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, código, marca, proveedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ProductFilters
          className="mb-4"
          categories={categories}
          brands={brands}
          suppliers={suppliers}
          value={catalogFilters}
          onChange={setCatalogFilters}
        />

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

        <p className="mb-3 text-sm text-ink-muted">
          Marcá productos con la casilla de la izquierda (o el encabezado para seleccionar todos los
          visibles). Aparece una barra para cambiar categoría, proveedor, unidad, precios, etc.
        </p>

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

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10">
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
                </th>
                <th>Producto</th>
                {fields.barcode && <th>Código</th>}
                <th>Categoría</th>
                <th>Marca</th>
                {fields.unitMeasure && <th>Unidad</th>}
                <th className="text-right">Precio</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="cell-empty">
                    No hay productos con estos filtros. Importá un catálogo o agregá artículos
                    manualmente.
                  </td>
                </tr>
              )}
              {products.map((p) => {
                const low = isLowStock(p.stock, p.min_stock);
                return (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    onFocus={() => setFocusedProduct(p)}
                    onClick={() => setFocusedProduct(p)}
                    className={`${
                      focusedProduct?.id === p.id ? "ring-1 ring-inset ring-brand-400/60" : ""
                    } ${selectedIds.has(p.id) ? "bg-brand-500/5" : ""}`}
                  >
                    <td className="w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-[var(--color-panel-border)]"
                      />
                    </td>
                    <td>
                      <p className="font-medium">{p.name}</p>
                      {p.supplier_name && (
                        <p className="text-xs text-ink-muted">{p.supplier_name}</p>
                      )}
                    </td>
                    {fields.barcode && (
                      <td className="cell-muted">{p.barcode || p.sku || "—"}</td>
                    )}
                    <td className="cell-muted">{p.category_name ?? "—"}</td>
                    <td className="cell-muted">{p.brand_name ?? "—"}</td>
                    {fields.unitMeasure && (
                      <td className="cell-muted">{formatUnitShort(p.unit)}</td>
                    )}
                    <td className="text-right font-medium tabular-nums">
                      {formatMoney(p.price, currency)}
                    </td>
                    <td className="text-right">
                      <StockBadge qty={p.stock} unit={p.unit} low={low} />
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          title={
                            posFavoriteIds.has(p.id)
                              ? "Quitar de favoritos POS"
                              : "Favorito en punto de venta"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleTogglePosFavorite(p.id);
                          }}
                          className={`rounded-lg p-2 hover:bg-amber-500/10 ${
                            posFavoriteIds.has(p.id)
                              ? "text-amber-500"
                              : "text-ink-muted hover:text-amber-600"
                          }`}
                        >
                          <Star
                            size={16}
                            className={posFavoriteIds.has(p.id) ? "fill-current" : ""}
                          />
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          className="rounded-lg p-2 text-ink-muted hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/40"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="rounded-lg p-2 text-ink-muted hover:bg-red-500/10 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
        onDone={reload}
      />

      <CatalogManager
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onUpdated={reload}
      />

      <InvoiceScanModal open={invoiceScanOpen} onClose={() => setInvoiceScanOpen(false)} />

      <SupermarketCatalogModal
        open={supermarketModalOpen}
        onClose={() => setSupermarketModalOpen(false)}
        onDone={reload}
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
