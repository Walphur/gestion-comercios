import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDownUp, Package, CalendarClock, PackagePlus, Camera } from "lucide-react";
import { listExpiringProducts, listExpiringBatches, type ExpiringProduct, type ExpiringBatch } from "../db/expiry";
import { formatDateShort } from "../lib/format";
import StockBadge from "../components/StockBadge";
import { PageHeader, Button, Input, Modal, PageContent, DataTableShell, Alert, EmptyState, FormActions } from "../components/ui";
import { showUserError } from "../lib/notice";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { listProducts } from "../db/products";
import { listCategories } from "../db/categories";
import { listBrands } from "../db/brands";
import { listSuppliers } from "../db/suppliers";
import { adjustStock, listStockMovements, type StockMovementRow } from "../db/stock";
import ProductFilters, {
  toProductFilter,
  type CatalogFilterValues,
} from "../components/ProductFilters";
import type { Brand, Category, Product, Supplier } from "../types";
import { formatMoney, formatQty } from "../lib/format";
import { isLowStock } from "../lib/stock";
import PurchaseEntryModal from "../components/PurchaseEntryModal";
import { FACTURA_IA_URL } from "../config/support";
import { openExternalUrl } from "../lib/openExternal";

export default function Stock() {
  const { currency } = useAppConfig();
  const { user } = useAuth();
  const [onlyLow, setOnlyLow] = useState(false);
  const [search, setSearch] = useState("");
  const [catalogFilters, setCatalogFilters] = useState<CatalogFilterValues>({
    categoryId: "",
    brandId: "",
    supplierId: "",
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [tab, setTab] = useState<"inventory" | "movements">("inventory");
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [delta, setDelta] = useState("");
  const [expiring, setExpiring] = useState<ExpiringProduct[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<ExpiringBatch[]>([]);
  const [purchaseEntryOpen, setPurchaseEntryOpen] = useState(false);

  const reload = useCallback(async () => {
    const filter = { ...toProductFilter(search, catalogFilters), onlyLowStock: onlyLow };
    const [p, m, c, b, s, exp, expB] = await Promise.all([
      listProducts(filter),
      listStockMovements(60),
      listCategories(),
      listBrands(),
      listSuppliers(),
      listExpiringProducts(14),
      listExpiringBatches(14),
    ]);
    setProducts(p);
    setMovements(m);
    setCategories(c);
    setBrands(b);
    setSuppliers(s);
    setExpiring(exp);
    setExpiringBatches(expB);
  }, [search, onlyLow, catalogFilters]);

  useEffect(() => {
    const t = setTimeout(reload, 200);
    return () => clearTimeout(t);
  }, [reload]);

  async function submitAdjust() {
    if (!adjustTarget) return;
    const d = Number(delta);
    if (Number.isNaN(d) || d === 0) {
      showUserError("Ingresá un número distinto de cero.", "Cantidad inválida");
      return;
    }
    await adjustStock(adjustTarget.id, d, user?.id ?? null);
    setAdjustTarget(null);
    setDelta("");
    reload();
  }

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="Inventario, alertas y movimientos"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPurchaseEntryOpen(true)}>
              <PackagePlus size={16} /> Ingreso compra
            </Button>
            <Button variant="secondary" onClick={() => void openExternalUrl(FACTURA_IA_URL)}>
              <Camera size={16} /> Factura con IA
            </Button>
            <Button
              variant={tab === "inventory" ? "primary" : "secondary"}
              onClick={() => setTab("inventory")}
            >
              <Package size={16} /> Inventario
            </Button>
            <Button
              variant={tab === "movements" ? "primary" : "secondary"}
              onClick={() => setTab("movements")}
            >
              <ArrowDownUp size={16} /> Movimientos
            </Button>
          </div>
        }
      />

      <PageContent>
        {tab === "inventory" && (expiring.length > 0 || expiringBatches.length > 0) && (
          <Alert variant="warning" className="mb-6">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
              <CalendarClock size={18} /> Vencimientos próximos (14 días)
            </h2>
            <ul className="space-y-2 text-sm">
              {expiring.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink">{e.name}</span>
                  <span className="text-ink-muted">
                    {formatDateShort(e.expires_at)}
                    {e.expired ? (
                      <span className="ml-2 font-semibold text-red-600">Vencido</span>
                    ) : (
                      <span className="ml-2">
                        {e.days_left === 0 ? "Hoy" : `en ${e.days_left} días`}
                      </span>
                    )}
                    · <StockBadge qty={e.stock} unit="unidad" low={e.stock <= 0} />
                  </span>
                </li>
              ))}
              {expiringBatches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-ink">
                    {b.product_name} <span className="text-ink-muted">(lote)</span>
                  </span>
                  <span className="text-ink-muted">
                    {formatDateShort(b.expires_at)} · {formatQty(b.qty)} u.
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs opacity-80">
              Configurá la fecha en Productos → editar artículo → Vencimiento.
            </p>
          </Alert>
        )}

        {tab === "inventory" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Input
                className="max-w-md"
                placeholder="Buscar producto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={onlyLow}
                  onChange={(e) => setOnlyLow(e.target.checked)}
                  className="rounded border-brand-300"
                />
                Solo stock bajo
              </label>
            </div>

            <ProductFilters
              className="mb-4"
              categories={categories}
              brands={brands}
              suppliers={suppliers}
              value={catalogFilters}
              onChange={setCatalogFilters}
            />

            <DataTableShell>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Código</th>
                    <th>Categoría</th>
                    <th className="text-right">Stock</th>
                    <th className="text-right">Mín.</th>
                    <th className="text-right">Valor costo</th>
                    <th className="col-actions" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const low = isLowStock(p.stock, p.min_stock);
                    return (
                      <tr key={p.id}>
                        <td className="font-medium text-ink">
                          {low && (
                            <AlertTriangle
                              size={14}
                              className="mr-1 inline text-amber-600 dark:text-amber-400"
                            />
                          )}
                          {p.name}
                        </td>
                        <td className="cell-muted">{p.barcode || p.sku || "—"}</td>
                        <td className="cell-muted">{p.category_name ?? "—"}</td>
                        <td className="text-right tabular-nums">{formatQty(p.stock)}</td>
                        <td className="text-right tabular-nums cell-muted">
                          {formatQty(p.min_stock)}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatMoney(p.cost * p.stock, currency)}
                        </td>
                        <td>
                          <div className="flex justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setAdjustTarget(p)}>
                              Ajustar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {products.length === 0 && (
                <EmptyState title="No hay productos para mostrar." />
              )}
            </DataTableShell>
          </>
        ) : (
          <DataTableShell>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th className="text-right">Cant.</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="cell-muted">{m.created_at}</td>
                    <td>{m.product_name}</td>
                    <td>
                      {m.movement_type === "purchase"
                        ? "Compra"
                        : m.movement_type === "adjustment"
                          ? "Ajuste"
                          : m.movement_type}
                    </td>
                    <td className="text-right tabular-nums">{formatQty(m.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {movements.length === 0 && (
              <EmptyState title="Aún no hay movimientos registrados." />
            )}
          </DataTableShell>
        )}
      </PageContent>

      <Modal
        open={adjustTarget !== null}
        title={adjustTarget ? `Ajustar: ${adjustTarget.name}` : ""}
        onClose={() => setAdjustTarget(null)}
      >
        <p className="mb-3 text-sm text-ink-muted">
          Stock actual: <strong>{formatQty(adjustTarget?.stock ?? 0)}</strong>. Usá número positivo
          para sumar o negativo para restar.
        </p>
        <Input
          label="Cantidad (+/-)"
          type="number"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
        />
        <FormActions>
          <Button variant="secondary" onClick={() => setAdjustTarget(null)}>
            Cancelar
          </Button>
          <Button onClick={submitAdjust}>Guardar</Button>
        </FormActions>
      </Modal>

      <PurchaseEntryModal
        open={purchaseEntryOpen}
        onClose={() => setPurchaseEntryOpen(false)}
        onDone={reload}
        userId={user?.id ?? null}
        currency={currency}
      />
    </div>
  );
}
