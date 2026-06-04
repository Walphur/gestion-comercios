import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Search, Percent, Upload, Tags, Eraser } from "lucide-react";
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
import { importSupermarketCatalog } from "../lib/tauri";
import type { Brand, Category, Product, Supplier } from "../types";
import { formatMoney, formatQty } from "../lib/format";
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

  async function handleDelete(p: Product) {
    if (confirm(`¿Eliminar "${p.name}"?`)) {
      await deleteProduct(p.id);
      reload();
    }
  }

  async function handleBulkPrice() {
    const input = prompt(
      "Ajustar precios por % (ej: 15 para subir 15%, -10 para bajar). Dejá vacío para todos los productos filtrados:",
    );
    if (input === null) return;
    const pct = Number(input);
    if (Number.isNaN(pct)) return alert("Valor inválido");
    const catId =
      catalogFilters.categoryId === "" ? null : catalogFilters.categoryId;
    await bulkAdjustPrices(pct, catId);
    reload();
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
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  <Upload size={16} /> Otro CSV
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
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Producto</th>
                {fields.barcode && <th className="px-4 py-3">Código</th>}
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Marca</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No hay productos con estos filtros. Importá un catálogo o agregá artículos
                    manualmente.
                  </td>
                </tr>
              )}
              {products.map((p) => {
                const low = p.stock <= p.min_stock;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{p.name}</p>
                      {p.supplier_name && (
                        <p className="text-xs text-slate-400">{p.supplier_name}</p>
                      )}
                    </td>
                    {fields.barcode && (
                      <td className="px-4 py-3 text-slate-500">{p.barcode || p.sku || "—"}</td>
                    )}
                    <td className="px-4 py-3 text-slate-500">{p.category_name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{p.brand_name ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(p.price, currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          low ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {formatQty(p.stock)} {p.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-brand-600"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
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
    </div>
  );
}
