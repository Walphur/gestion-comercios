import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Search, Percent, Upload } from "lucide-react";
import ProductImport from "../components/ProductImport";
import { useAuth } from "../context/AuthContext";
import { PageHeader, Button, Input } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import {
  listProducts,
  deleteProduct,
  bulkAdjustPrices,
  type ProductFilter,
} from "../db/products";
import { listCategories } from "../db/categories";
import type { Category, Product } from "../types";
import { formatMoney, formatQty } from "../lib/format";
import ProductForm from "./ProductForm";

export default function Products() {
  const { currency, rubroDef } = useAppConfig();
  const { can } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const reload = useCallback(async () => {
    const filter: ProductFilter = { search };
    const [p, c] = await Promise.all([listProducts(filter), listCategories()]);
    setProducts(p);
    setCategories(c);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(reload, 200);
    return () => clearTimeout(t);
  }, [reload]);

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
    const input = prompt("Ajustar precios de TODOS los productos por % (ej: 15 para subir 15%, -10 para bajar):");
    if (input === null) return;
    const pct = Number(input);
    if (Number.isNaN(pct)) return alert("Valor inválido");
    await bulkAdjustPrices(pct, null);
    reload();
  }

  const fields = rubroDef.fields;

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle={`${products.length} artículo(s)`}
        actions={
          <>
            {can("manage_products") && (
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload size={16} /> Importar CSV
              </Button>
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
            placeholder="Buscar por nombre, código o SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Producto</th>
                {fields.barcode && <th className="px-4 py-3">Código</th>}
                <th className="px-4 py-3 text-right">Costo</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    No hay productos todavía. Hacé clic en "Nuevo producto" para empezar.
                  </td>
                </tr>
              )}
              {products.map((p) => {
                const low = p.stock <= p.min_stock;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{p.name}</p>
                      {p.description && <p className="text-xs text-slate-400">{p.description}</p>}
                    </td>
                    {fields.barcode && (
                      <td className="px-4 py-3 text-slate-500">{p.barcode || p.sku || "—"}</td>
                    )}
                    <td className="px-4 py-3 text-right text-slate-500">{formatMoney(p.cost, currency)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(p.price, currency)}</td>
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
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />

      <ProductImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={reload}
      />
    </div>
  );
}
