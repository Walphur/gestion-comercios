import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Plus, Minus, Trash2, Barcode, Search, CheckCircle2, Wallet, Lock } from "lucide-react";
import { Button, Modal } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { getSetting } from "../db/settings";
import { findByBarcode, getBarcodeQuantityFactor, listProducts } from "../db/products";
import { listCategories } from "../db/categories";
import { listBrands } from "../db/brands";
import { listSuppliers } from "../db/suppliers";
import ProductFilters, {
  toProductFilter,
  type CatalogFilterValues,
} from "../components/ProductFilters";
import type { Brand, Category, Supplier } from "../types";
import { listVariants } from "../db/variants";
import { listCustomers } from "../db/customers";
import { syncCashSessionStorage } from "../db/cash";
import { recordSale } from "../db/sales";
import { logAuditAction, queueFiscalInvoice } from "../lib/tauri";
import type { Customer, Product, ProductVariant } from "../types";
import { formatMoney } from "../lib/format";

interface CartItem {
  key: string;
  product: Product;
  variant: ProductVariant | null;
  label: string;
  unitPrice: number;
  qty: number;
  stockFactor: number;
  discountPct: number;
}

const BASE_PAYMENTS = ["efectivo", "débito", "crédito", "transferencia", "qr"];

const checkoutControlClass =
  "h-10 w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 text-sm tabular-nums text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900";

function CheckoutRow({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_7.25rem] items-center gap-3 ${className}`}
    >
      <span className="text-sm text-slate-600">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

export default function POS() {
  const { currency, features } = useAppConfig();
  const { user, can } = useAuth();
  const [scan, setScan] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [catalogFilters, setCatalogFilters] = useState<CatalogFilterValues>({
    categoryId: "",
    brandId: "",
    supplierId: "",
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [payment, setPayment] = useState("efectivo");
  const [paid, setPaid] = useState<number | "">("");
  const [done, setDone] = useState(false);
  const [cashSessionId, setCashSessionId] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ product: Product; variants: ProductVariant[] } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const cajaAbierta = cashSessionId != null;

  const paymentMethods = [
    ...BASE_PAYMENTS,
    ...(features.customers && can("void_sale") ? ["fiado"] : []),
  ];
  const isFiado = payment === "fiado";

  useEffect(() => {
    syncCashSessionStorage().then(setCashSessionId);
    const id = setInterval(() => {
      void syncCashSessionStorage().then(setCashSessionId);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (cajaAbierta) scanRef.current?.focus();
  }, [cajaAbierta]);

  useEffect(() => {
    if (features.customers) listCustomers().then(setCustomers).catch(console.error);
    Promise.all([listCategories(), listBrands(), listSuppliers()]).then(([c, b, s]) => {
      setCategories(c);
      setBrands(b);
      setSuppliers(s);
    });
  }, [features.customers]);

  const hasCatalogFilter =
    catalogFilters.categoryId !== "" ||
    catalogFilters.brandId !== "" ||
    catalogFilters.supplierId !== "";

  useEffect(() => {
    if (!scan.trim() && !hasCatalogFilter) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setResults(await listProducts(toProductFilter(scan, catalogFilters)));
    }, 180);
    return () => clearTimeout(t);
  }, [scan, catalogFilters, hasCatalogFilter]);

  function addItem(
    product: Product,
    variant: ProductVariant | null,
    stockFactor = 1,
  ) {
    const key = `${product.id}:${variant?.id ?? 0}:${stockFactor}`;
    const label = variant
      ? `${product.name} (${Object.values(variant.attributes).filter(Boolean).join(", ")})`
      : product.name;
    const unitPrice = variant?.price ?? product.price;
    setCart((c) => {
      const found = c.find((i) => i.key === key);
      if (found) return c.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i));
      return [
        ...c,
        { key, product, variant, label, unitPrice, qty: 1, stockFactor, discountPct: 0 },
      ];
    });
    setScan("");
    setResults([]);
    scanRef.current?.focus();
  }

  async function addProduct(p: Product) {
    if (p.has_variants) {
      const variants = await listVariants(p.id);
      if (variants.length > 0) {
        setPicker({ product: p, variants });
        return;
      }
    }
    addItem(p, null);
  }

  async function handleScanEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !scan.trim()) return;
    const factor = await getBarcodeQuantityFactor(scan);
    const exact = await findByBarcode(scan);
    if (exact) {
      if (exact.has_variants) addProduct(exact);
      else addItem(exact, null, factor);
    } else if (results.length === 1) addProduct(results[0]);
  }

  function changeQty(key: string, delta: number) {
    setCart((c) =>
      c
        .map((i) => (i.key === key ? { ...i, qty: Math.max(0, i.qty + delta) } : i))
        .filter((i) => i.qty > 0),
    );
  }
  function setItemDiscount(key: string, pct: number) {
    setCart((c) => c.map((i) => (i.key === key ? { ...i, discountPct: pct } : i)));
  }
  function removeItem(key: string) {
    setCart((c) => c.filter((i) => i.key !== key));
  }

  const subtotal = cart.reduce(
    (acc, i) => acc + i.unitPrice * i.qty * (1 - i.discountPct / 100),
    0,
  );
  const total = subtotal * (1 - globalDiscount / 100);
  const change = typeof paid === "number" ? paid - total : 0;

  async function finalize() {
    if (cart.length === 0) return;
    if (!cashSessionId) {
      alert("Abrí el turno de caja antes de vender.");
      return;
    }
    const cid = customerId === "" ? null : customerId;

    try {
    const saleId = await recordSale({
      subtotal,
      discount_pct: globalDiscount,
      total,
      payment_method: payment,
      paid: isFiado ? null : typeof paid === "number" ? paid : null,
      change_due: isFiado ? null : typeof paid === "number" ? change : null,
      user_id: user?.id ?? null,
      cash_session_id: cashSessionId,
      customer_id: cid,
      items: cart.map((i) => ({
        product_id: i.product.id,
        variant_id: i.variant?.id ?? null,
        name: i.label,
        qty: i.qty,
        stock_qty: i.qty * i.stockFactor,
        unit_price: i.unitPrice,
        discount_pct: i.discountPct,
        line_total: i.unitPrice * i.qty * (1 - i.discountPct / 100),
      })),
    });

    const fiscalOn = (await getSetting("fiscal_enabled")) === "1";
    if (fiscalOn) {
      void queueFiscalInvoice(saleId);
    }

    if (user) {
      void logAuditAction(user.id, "sale_completed", "sale", saleId, `total=${total}`);
      if (globalDiscount > 0 || cart.some((i) => i.discountPct > 0)) {
        void logAuditAction(user.id, "manual_discount", "sale", saleId);
      }
    }

    setDone(true);
    setTimeout(() => {
      setCart([]);
      setGlobalDiscount(0);
      setPaid("");
      setPayment("efectivo");
      setCustomerId("");
      setDone(false);
      scanRef.current?.focus();
    }, 1400);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  if (!cajaAbierta) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-surface p-8">
        <div className="max-w-md rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-8 text-center shadow-lg">
          <Lock className="mx-auto mb-4 h-12 w-12 text-brand-500" />
          <h2 className="font-display text-xl font-semibold text-ink">Caja cerrada</h2>
          <p className="mt-3 text-sm text-ink-muted">
            Abrí un turno de caja para usar el punto de venta. Mientras la caja esté cerrada no se
            pueden registrar ventas.
          </p>
          <Link
            to="/caja"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Wallet size={18} /> Ir a abrir caja
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 flex-1 flex-col border-r border-brand-100 bg-[var(--color-panel)] dark:border-brand-800/60">
        <div className="border-b border-slate-200 p-5 space-y-3">
          <div className="relative">
            <Barcode size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-500" />
            <input
              ref={scanRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={handleScanEnter}
              placeholder="Escaneá un código de barras o buscá por nombre y presioná Enter..."
              className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <ProductFilters
            categories={categories}
            brands={brands}
            suppliers={suppliers}
            value={catalogFilters}
            onChange={setCatalogFilters}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {results.length === 0 && (scan.trim() || hasCatalogFilter) && (
            <p className="text-center text-sm text-slate-400">Sin resultados con estos filtros.</p>
          )}
          {results.length === 0 && !scan.trim() && !hasCatalogFilter && (
            <div className="flex h-full items-center justify-center text-center text-slate-400">
              <div>
                <Search size={40} className="mx-auto mb-3 opacity-40" />
                <p>Escaneá, buscá o filtrá por categoría / marca / proveedor.</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/50"
              >
                <p className="line-clamp-2 text-sm font-medium text-slate-800">{p.name}</p>
                {(p.category_name || p.brand_name) && (
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {[p.category_name, p.brand_name].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="mt-1 text-base font-semibold text-brand-600">
                  {formatMoney(p.price, currency)}
                </p>
                <p className="text-xs text-slate-400">
                  {p.has_variants ? "Con variantes" : `Stock: ${p.stock}`}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex h-full min-h-0 w-[420px] shrink-0 flex-col border-l border-brand-100 bg-[var(--color-panel)] dark:border-brand-800/60">
        <div className="shrink-0 border-b border-brand-100 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">Venta actual</h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-surface/80 p-4">
          {cart.length === 0 ? (
            <p className="mt-10 text-center text-sm text-slate-400">El carrito está vacío.</p>
          ) : (
            <div className="space-y-2">
              {cart.map((i) => (
                <div
                  key={i.key}
                  className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">{i.label}</p>
                    <button onClick={() => removeItem(i.key)} className="text-slate-400 hover:text-red-600">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => changeQty(i.key, -1)}
                        className="rounded-md border border-slate-300 p-1 hover:bg-slate-100"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{i.qty}</span>
                      <button
                        onClick={() => changeQty(i.key, 1)}
                        className="rounded-md border border-slate-300 p-1 hover:bg-slate-100"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="text-sm font-semibold">
                      {formatMoney(i.unitPrice * i.qty * (1 - i.discountPct / 100), currency)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-slate-400">Desc. %</span>
                    <input
                      type="number"
                      value={i.discountPct}
                      min={0}
                      max={100}
                      onChange={(e) => setItemDiscount(i.key, Number(e.target.value))}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto shrink-0 border-t border-brand-100 px-5 py-4 shadow-[0_-4px_20px_rgba(19,78,74,0.06)]">
          {features.customers && (
            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-medium text-slate-600">Cliente (opcional)</span>
              <select
                value={customerId}
                onChange={(e) =>
                  setCustomerId(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={checkoutControlClass}
              >
                <option value="">— Consumidor final —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.balance > 0 ? ` (debe ${formatMoney(c.balance, currency)})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="space-y-2.5">
            <CheckoutRow label="Subtotal">
              <span className="text-sm font-medium tabular-nums text-slate-800">
                {formatMoney(subtotal, currency)}
              </span>
            </CheckoutRow>
            <CheckoutRow label="Descuento global %">
              <input
                type="number"
                value={globalDiscount}
                min={0}
                max={100}
                onChange={(e) => setGlobalDiscount(Number(e.target.value))}
                className={`${checkoutControlClass} text-right`}
              />
            </CheckoutRow>
            <CheckoutRow label="Total" className="pt-1">
              <span className="text-xl font-bold tabular-nums text-ink">
                {formatMoney(total, currency)}
              </span>
            </CheckoutRow>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className="mb-1 block text-sm font-medium text-slate-600">Medio de pago</span>
              <select
                value={payment}
                onChange={(e) => {
                  setPayment(e.target.value);
                  if (e.target.value === "fiado") setPaid("");
                }}
                className={checkoutControlClass}
              >
                {paymentMethods.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {m}
                  </option>
                ))}
              </select>
            </label>
            {!isFiado ? (
              <label className="block min-w-0">
                <span className="mb-1 block text-sm font-medium text-slate-600">Paga con</span>
                <input
                  type="number"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0.00"
                  className={checkoutControlClass}
                />
              </label>
            ) : (
              <div className="flex min-h-10 items-end pb-1 text-xs text-amber-700">
                Venta a cuenta corriente
              </div>
            )}
          </div>

          {!isFiado && typeof paid === "number" && paid >= total && (
            <p className="mt-3 text-right text-sm tabular-nums text-emerald-600">
              Vuelto: <strong>{formatMoney(change, currency)}</strong>
            </p>
          )}

          <Button
            onClick={finalize}
            disabled={cart.length === 0 || !cajaAbierta}
            className="mt-4 w-full py-3 text-base"
          >
            {done ? (
              <>
                <CheckCircle2 size={18} /> ¡Venta registrada!
              </>
            ) : (
              "Finalizar venta"
            )}
          </Button>
        </div>
      </div>

      <Modal
        open={picker !== null}
        title={picker ? `Elegí la variante de ${picker.product.name}` : ""}
        onClose={() => setPicker(null)}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {picker?.variants.map((v) => (
            <button
              key={v.id}
              disabled={v.stock <= 0}
              onClick={() => {
                addItem(picker.product, v);
                setPicker(null);
              }}
              className="rounded-xl border border-slate-200 p-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/50 disabled:opacity-40"
            >
              <p className="text-sm font-medium text-slate-800">
                {Object.values(v.attributes).filter(Boolean).join(", ") || "Variante"}
              </p>
              <p className="text-sm font-semibold text-brand-600">
                {formatMoney(v.price ?? picker.product.price, currency)}
              </p>
              <p className="text-xs text-slate-400">Stock: {v.stock}</p>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
