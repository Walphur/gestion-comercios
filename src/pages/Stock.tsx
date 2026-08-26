import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  Package,
  CalendarClock,
  PackagePlus,
  Camera,
  Boxes,
  History,
  ChevronDown,
  ChevronUp,
  Printer,
  RefreshCw,
} from "lucide-react";
import { listExpiringProducts, listExpiringBatches, type ExpiringProduct, type ExpiringBatch } from "../db/expiry";
import { formatDateShort } from "../lib/format";
import StockBadge from "../components/StockBadge";
import { PageHeader, Button, Input, Modal, PageContent, DataTableShell, Alert, EmptyState, FormActions, IconButton } from "../components/ui";
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
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";
import { entitlementBlockedMessage } from "../config/planEntitlements";
import { printInventoryList } from "../lib/prints/inventoryList";

type StockSortKey = "name" | "code" | "category" | "stock" | "min" | "cost";
type SortDir = "asc" | "desc";

function StockSortButton({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className = "",
}: {
  label: string;
  column: StockSortKey;
  sortKey: StockSortKey;
  sortDir: SortDir;
  onSort: (key: StockSortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <button
      type="button"
      className={`products-list__sort ${className}`.trim()}
      title={`Ordenar por ${label}`}
      onClick={() => onSort(column)}
    >
      <span className="products-list__sort-label">{label}</span>
      <span className={`products-list__sort-ico${active ? " is-active" : ""}`} aria-hidden>
        {active && sortDir === "desc" ? (
          <ChevronDown size={11} strokeWidth={2.5} />
        ) : (
          <ChevronUp size={11} strokeWidth={2.5} />
        )}
      </span>
    </button>
  );
}

export default function Stock() {
  const { businessName, currency } = useAppConfig();
  const { user } = useAuth();
  const { facturaIa } = usePlanEntitlements();
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
  const [purchaseEntryAutoIa, setPurchaseEntryAutoIa] = useState(false);
  const [sortKey, setSortKey] = useState<StockSortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [refreshing, setRefreshing] = useState(false);

  const toggleSort = useCallback(
    (key: StockSortKey) => {
      if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  const sortedProducts = useMemo(() => {
    const list = [...products];
    const dir = sortDir === "asc" ? 1 : -1;
    const cmpText = (a: string, b: string) =>
      a.localeCompare(b, "es", { sensitivity: "base", numeric: true }) * dir;
    const cmpNum = (a: number, b: number) => (a - b) * dir;
    list.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return cmpText(a.name || "", b.name || "");
        case "code":
          return cmpText(a.barcode || a.sku || "", b.barcode || b.sku || "");
        case "category":
          return cmpText(a.category_name || "", b.category_name || "");
        case "stock":
          return cmpNum(a.stock ?? 0, b.stock ?? 0);
        case "min":
          return cmpNum(a.min_stock ?? 0, b.min_stock ?? 0);
        case "cost":
          return cmpNum((a.cost ?? 0) * (a.stock ?? 0), (b.cost ?? 0) * (b.stock ?? 0));
        default:
          return 0;
      }
    });
    return list;
  }, [products, sortKey, sortDir]);

  const reload = useCallback(async (onlyLowStock = onlyLow) => {
    const filter = { ...toProductFilter(search, catalogFilters), onlyLowStock };
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
    const t = setTimeout(() => void reload(), 200);
    return () => clearTimeout(t);
  }, [reload]);

  async function handleRefreshList() {
    setRefreshing(true);
    try {
      await reload(onlyLow);
    } catch (e) {
      showUserError(e);
    } finally {
      setRefreshing(false);
    }
  }

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

  function openInventory() {
    setTab("inventory");
    void reload(onlyLow);
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
            {facturaIa ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setPurchaseEntryAutoIa(true);
                  setPurchaseEntryOpen(true);
                }}
              >
                <Camera size={16} /> Factura con IA
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() =>
                  showUserError(entitlementBlockedMessage("facturaIa"), "Plan mensual")
                }
              >
                <Camera size={16} /> Factura con IA
              </Button>
            )}
            <Button
              variant={tab === "inventory" ? "primary" : "secondary"}
              onClick={openInventory}
            >
              <Package size={16} /> Inventario
            </Button>
            {tab === "inventory" && (
              <Button
                variant="secondary"
                onClick={() => printInventoryList(businessName, currency, sortedProducts)}
              >
                <Printer size={16} /> Imprimir listado
              </Button>
            )}
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
            <div className="mb-4 flex min-w-0 flex-wrap items-center gap-3">
              <div className="flex min-w-0 max-w-md flex-1 items-center gap-2">
                <Input
                  className="min-w-0 flex-1"
                  placeholder="Buscar producto…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <IconButton
                  label="Actualizar listado"
                  onClick={() => void handleRefreshList()}
                  disabled={refreshing}
                  className="shrink-0"
                >
                  <RefreshCw size={16} className={refreshing ? "animate-spin" : undefined} />
                </IconButton>
              </div>
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
              <table className="data-table data-table--compact">
                <thead>
                  <tr>
                    <th>
                      <StockSortButton label="Producto" column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    </th>
                    <th>
                      <StockSortButton label="Código" column="code" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    </th>
                    <th>
                      <StockSortButton label="Categoría" column="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    </th>
                    <th className="text-right">
                      <StockSortButton label="Stock" column="stock" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="products-list__sort--end" />
                    </th>
                    <th className="text-right">
                      <StockSortButton label="Mín." column="min" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="products-list__sort--end" />
                    </th>
                    <th className="text-right">
                      <StockSortButton label="Valor costo" column="cost" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="products-list__sort--end" />
                    </th>
                    <th className="col-actions" />
                  </tr>
                </thead>
                <tbody>
                  {sortedProducts.map((p) => {
                    const low = isLowStock(p.stock, p.min_stock);
                    return (
                      <tr key={p.id}>
                        <td className="min-w-0 font-medium text-ink">
                          <span className="line-clamp-1">
                            {low && (
                              <AlertTriangle
                                size={14}
                                className="mr-1 inline text-amber-600 dark:text-amber-400"
                              />
                            )}
                            {p.name}
                          </span>
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
                <EmptyState
                  icon={Boxes}
                  title={onlyLow ? "Ningún producto con stock bajo" : "Sin productos en stock"}
                  description={
                    onlyLow
                      ? "No hay productos por debajo del mínimo con los filtros actuales."
                      : "Cuando cargues productos con control de inventario, los verás acá."
                  }
                />
              )}
            </DataTableShell>
          </>
        ) : (
          <DataTableShell>
            <table className="data-table data-table--compact">
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
              <EmptyState
                icon={History}
                title="Sin movimientos"
                description="Los ingresos, ajustes y salidas de stock aparecerán en este historial."
              />
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
        onClose={() => {
          setPurchaseEntryOpen(false);
          setPurchaseEntryAutoIa(false);
        }}
        onDone={reload}
        userId={user?.id ?? null}
        currency={currency}
        autoStartIa={purchaseEntryAutoIa}
      />
    </div>
  );
}
