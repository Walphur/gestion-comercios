import { useCallback, useEffect, useState } from "react";
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
import { countDemoProductsActive, removeDemoCatalog } from "../db/demo";
import {
  countSupermarketProducts,
  exportProductsCsv,
  pickExportProductsPath,
  removeSupermarketCatalog,
} from "../lib/tauri";
import type { Brand, Category, Product, Supplier } from "../types";
import { formatMoney } from "../lib/format";
import { confirmAction, confirmDelete } from "../lib/confirm";
import ProductForm from "./ProductForm";
import ProductBulkBar from "../components/ProductBulkBar";
import SupermarketCatalogModal from "../components/SupermarketCatalogModal";
import PercentPromptModal from "../components/PercentPromptModal";
import { formatDbError } from "../lib/dbError";
import { closeDb } from "../db";

const EMPTY_FILTERS: CatalogFilterValues = {
  categoryId: "",
  brandId: "",
  supplierId: "",
};

export default function Products() {
  const { currency, rubroDef } = useAppConfig();
  const { can } = useAuth();
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
  const [supermarketCount, setSupermarketCount] = useState(0);
  const [removingSupermarket, setRemovingSupermarket] = useState(false);
  const [invoiceScanOpen, setInvoiceScanOpen] = useState(false);
  const [focusedProduct, setFocusedProduct] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);

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
  }, [search, catalogFilters, reloadMeta]);

  useEffect(() => {
    const t = setTimeout(reload, 200);
    return () => clearTimeout(t);
  }, [reload]);

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

  useEffect(() => {
    countDemoProductsActive().then(setDemoCount).catch(console.error);
    countSupermarketProducts().then(setSupermarketCount).catch(() => setSupermarketCount(0));
  }, [products]);

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
      const path = await pickExportProductsPath();
      if (!path) return;
      const n = await exportProductsCsv(path);
      alert(`Exportados ${n} productos a:\n${path}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRemoveSupermarket() {
    let legacy = false;
    if (supermarketCount === 0) {
      legacy = await confirmAction({
        title: "Catálogo de versión anterior",
        message: "¿Buscar también productos importados en versiones anteriores?",
        detail:
          "Puede afectar artículos con código de barras que hayas cargado a mano desde el mismo listado masivo.",
        variant: "default",
        confirmLabel: "Sí, incluir compatibilidad",
      });
    }
    const ok = await confirmAction({
      title: "Quitar catálogo masivo",
      message:
        legacy
          ? "¿Quitar el catálogo supermercado (modo compatibilidad)?"
          : `¿Quitar ${supermarketCount > 0 ? supermarketCount.toLocaleString("es-AR") : "los"} productos del catálogo supermercado?`,
      detail: "No borra los productos que cargaste manualmente.",
      variant: "danger",
      confirmLabel: "Sí, quitar catálogo",
    });
    if (!ok) return;
    setRemovingSupermarket(true);
    try {
      await closeDb();
      const n = await removeSupermarketCatalog(legacy);
      alert(
        n > 0
          ? `Se quitaron ${n.toLocaleString("es-AR")} productos del catálogo masivo.`
          : "No había productos del catálogo para quitar.",
      );
      await reload();
    } catch (e) {
      alert(formatDbError(e));
    } finally {
      setRemovingSupermarket(false);
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
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingDemo(false);
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
                  <Tags size={16} /> Catálogo
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
                <Button
                  variant="secondary"
                  onClick={handleRemoveSupermarket}
                  disabled={removingSupermarket}
                  className="text-red-600"
                >
                  <Eraser size={16} />{" "}
                  {removingSupermarket
                    ? "Quitando catálogo…"
                    : supermarketCount > 0
                      ? `Quitar catálogo (${supermarketCount})`
                      : "Quitar catálogo masivo"}
                </Button>
                <Button variant="secondary" onClick={() => setInvoiceScanOpen(true)}>
                  <Camera size={16} /> Factura (IA)
                </Button>
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

        <ProductBulkBar
          selectedIds={[...selectedIds]}
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
                <th className="text-right">Precio</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={8} className="cell-empty">
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
                    <td className="text-right font-medium tabular-nums">
                      {formatMoney(p.price, currency)}
                    </td>
                    <td className="text-right">
                      <StockBadge qty={p.stock} unit={p.unit} low={low} />
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
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
