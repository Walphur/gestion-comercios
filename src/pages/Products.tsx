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
import { exportProductsCsv, importSupermarketCatalog, pickExportProductsPath } from "../lib/tauri";
import type { Brand, Category, Product, Supplier } from "../types";
import { formatMoney } from "../lib/format";
import { confirmAction } from "../lib/confirm";
import ProductForm from "./ProductForm";

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
  const [importingSuper, setImportingSuper] = useState(false);
  const [invoiceScanOpen, setInvoiceScanOpen] = useState(false);
  const [focusedProduct, setFocusedProduct] = useState<Product | null>(null);

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
    countDemoProductsActive().then(setDemoCount).catch(console.error);
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
      if (!confirmAction(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) return;
      await deleteProduct(p.id);
      setFocusedProduct((prev) => (prev?.id === p.id ? null : prev));
      reload();
    },
    [reload],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape") {
        if (formOpen || importOpen || catalogOpen || invoiceScanOpen) {
          if (typing) return;
          e.preventDefault();
          if (
            !confirmAction(
              "¿Cerrar esta ventana? Si estabas editando, los cambios no guardados se pierden.",
            )
          ) {
            return;
          }
          setFormOpen(false);
          setImportOpen(false);
          setCatalogOpen(false);
          setInvoiceScanOpen(false);
        } else if (search.trim()) {
          e.preventDefault();
          if (confirmAction("¿Limpiar la búsqueda?")) setSearch("");
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

  async function handleBulkPrice() {
    const input = prompt(
      "Ajustar precios por % (ej: 15 para subir 15%, -10 para bajar). Se aplica a los filtros activos (categoría / marca / proveedor).",
    );
    if (input === null) return;
    const pct = Number(input);
    if (Number.isNaN(pct)) return alert("Valor inválido");
    const n = await bulkAdjustPrices(pct, {
      categoryId: catalogFilters.categoryId === "" ? null : catalogFilters.categoryId,
      brandId: catalogFilters.brandId === "" ? null : catalogFilters.brandId,
      supplierId: catalogFilters.supplierId === "" ? null : catalogFilters.supplierId,
    });
    alert(`Precios actualizados en ${n} producto(s).`);
    reload();
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

  async function handleImportSupermarket() {
    if (
      !confirm(
        "Se importará productos_supermercado.csv (~190.000 productos). Puede tardar 15-25 minutos. ¿Continuar?",
      )
    ) {
      return;
    }
    setImportingSuper(true);
    try {
      const r = await importSupermarketCatalog(false);
      const removed = await removeDemoCatalog();
      alert(
        `Importación terminada.\n${r.inserted} nuevos · ${r.updated} actualizados · ${r.skipped} omitidos` +
          (removed > 0 ? `\n${removed} productos de ejemplo quitados.` : ""),
      );
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setImportingSuper(false);
    }
  }

  async function handleRemoveDemo() {
    if (!confirm("¿Quitar todos los productos de ejemplo del catálogo?")) return;
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
                <Button
                  variant="secondary"
                  onClick={handleImportSupermarket}
                  disabled={importingSuper}
                >
                  <Upload size={16} />{" "}
                  {importingSuper ? "Importando catálogo…" : "Catálogo supermercado"}
                </Button>
                <Button variant="secondary" onClick={() => setInvoiceScanOpen(true)}>
                  <Camera size={16} /> Factura (IA)
                </Button>
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  <Upload size={16} /> Otro CSV
                </Button>
                <Button variant="secondary" onClick={handleExportCsv}>
                  <Download size={16} /> Exportar CSV
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={handleBulkPrice}>
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

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
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
                  <td colSpan={7} className="cell-empty">
                    No hay productos con estos filtros. Importá un catálogo o agregá artículos
                    manualmente.
                  </td>
                </tr>
              )}
              {products.map((p) => {
                const low = p.stock <= p.min_stock;
                return (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    onFocus={() => setFocusedProduct(p)}
                    onClick={() => setFocusedProduct(p)}
                    className={focusedProduct?.id === p.id ? "ring-1 ring-inset ring-brand-400/60" : ""}
                  >
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
    </div>
  );
}
