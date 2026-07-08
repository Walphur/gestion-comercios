import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Plus, Minus, Trash2, Barcode, CheckCircle2, Wallet, Lock, ShoppingCart, Search, ReceiptText } from "lucide-react";
import MercadoPagoQrModal from "../components/MercadoPagoQrModal";
import BulkWeightSaleModal from "../components/BulkWeightSaleModal";
import PosQuickPickGrid from "../components/PosQuickPickGrid";
import { Button, Modal, EmptyState } from "../components/ui";
import { rubroSupportsBulkWeight } from "../config/rubros";
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
import { getPosQuickPickProducts } from "../db/posQuickPick";
import { getMpConfigStatus, printSaleReceipt } from "../lib/posIntegrations";
import { logAuditAction, queueFiscalInvoice } from "../lib/tauri";
import type { Customer, Product, ProductVariant } from "../types";
import { formatMoney, formatQty, formatUnitShort, MP_QR_MIN_AMOUNT } from "../lib/format";
import { confirmAction } from "../lib/confirm";
import { showUserError } from "../lib/notice";
import { productSoldByWeight } from "../lib/weightSale";
import {
  clampAdjustPct,
  discountedLineTotal,
  exactDiscountPctFromFinalPrice,
  lineSubtotal,
  roundMoney,
} from "../lib/discount";
import EditableAmountInput from "../components/EditableAmountInput";
import AdjustPctInput from "../components/AdjustPctInput";

interface CartItem {
  key: string;
  product: Product;
  variant: ProductVariant | null;
  label: string;
  unitPrice: number;
  qty: number;
  stockFactor: number;
  discountPct: number;
  /** Monto exacto a cobrar por línea (si el cajero lo escribió a mano). */
  lineTargetTotal: number | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  débito: "Débito",
  crédito: "Crédito",
  transferencia: "Transferencia",
  qr: "QR (manual)",
  mercadopago: "Mercado Pago QR",
  fiado: "Fiado / cuenta corriente",
};

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
      <span className="text-sm text-ink-muted">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

function cartLineFinal(i: CartItem): number {
  if (i.lineTargetTotal != null) return i.lineTargetTotal;
  return discountedLineTotal(i.unitPrice, i.qty, i.discountPct);
}

export default function POS() {
  const { currency, features, rubroDef } = useAppConfig();
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
  const [globalTargetTotal, setGlobalTargetTotal] = useState<number | null>(null);
  const [payment, setPayment] = useState("efectivo");
  const [paid, setPaid] = useState<number | "">("");
  const [done, setDone] = useState(false);
  const [cashSessionId, setCashSessionId] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ product: Product; variants: ProductVariant[] } | null>(null);
  const [bulkProduct, setBulkProduct] = useState<Product | null>(null);
  const [quickPick, setQuickPick] = useState<{ favorites: Product[]; topSellers: Product[] }>({
    favorites: [],
    topSellers: [],
  });
  const [mpConfig, setMpConfig] = useState({
    enabled: false,
    configured: false,
    simulation: false,
  });
  const [mpCheckoutOpen, setMpCheckoutOpen] = useState(false);
  const [fiscalEnabled, setFiscalEnabled] = useState(false);
  const [invoiceThisSale, setInvoiceThisSale] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const paymentRef = useRef<HTMLSelectElement>(null);
  const paidRef = useRef<HTMLInputElement>(null);

  const bulkWeightEnabled = rubroSupportsBulkWeight(rubroDef);

  const cajaAbierta = cashSessionId != null;

  const paymentMethods = [
    "efectivo",
    "débito",
    "crédito",
    "transferencia",
    ...(mpConfig.enabled && mpConfig.configured ? ["mercadopago"] : ["qr"]),
    ...(features.customers && can("void_sale") ? ["fiado"] : []),
  ];
  const isFiado = payment === "fiado";

  const reloadQuickPick = useCallback(() => {
    getPosQuickPickProducts()
      .then(setQuickPick)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (cajaAbierta) reloadQuickPick();
    getMpConfigStatus()
      .then(setMpConfig)
      .catch(() => setMpConfig({ enabled: false, configured: false, simulation: false }));
    getSetting("fiscal_enabled")
      .then((v) => setFiscalEnabled(v === "1"))
      .catch(() => setFiscalEnabled(false));
  }, [cajaAbierta, reloadQuickPick]);

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

  const showQuickPick = !scan.trim() && !hasCatalogFilter && results.length === 0;

  useEffect(() => {
    if (!scan.trim() && !hasCatalogFilter) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setResults(await listProducts(toProductFilter(scan, catalogFilters)));
    }, 280);
    return () => clearTimeout(t);
  }, [scan, catalogFilters, hasCatalogFilter]);

  function addItem(
    product: Product,
    variant: ProductVariant | null,
    stockFactor = 1,
    initialQty = 1,
  ) {
    const key = `${product.id}:${variant?.id ?? 0}:${stockFactor}`;
    const label = variant
      ? `${product.name} (${Object.values(variant.attributes).filter(Boolean).join(", ")})`
      : product.name;
    const unitPrice = variant?.price ?? product.price;
    const byWeight =
      !variant && bulkWeightEnabled && productSoldByWeight(product.unit);
    setCart((c) => {
      const found = c.find((i) => i.key === key);
      if (found) {
        const add = byWeight ? initialQty : 1;
        return c.map((i) => (i.key === key ? { ...i, qty: i.qty + add } : i));
      }
      return [
        ...c,
        {
          key,
          product,
          variant,
          label,
          unitPrice,
          qty: initialQty,
          stockFactor,
          discountPct: 0,
          lineTargetTotal: null,
        },
      ];
    });
    setScan("");
    setResults([]);
    scanRef.current?.focus();
  }

  function needsBulkModal(p: Product): boolean {
    return bulkWeightEnabled && productSoldByWeight(p.unit) && !p.has_variants;
  }

  async function addProduct(p: Product) {
    if (p.has_variants) {
      const variants = await listVariants(p.id);
      if (variants.length > 0) {
        setPicker({ product: p, variants });
        return;
      }
    }
    if (needsBulkModal(p)) {
      setBulkProduct(p);
      return;
    }
    addItem(p, null);
  }

  function setItemQty(key: string, qty: number) {
    setCart((c) =>
      c
        .map((i) =>
          i.key === key ? { ...i, qty: Math.max(0, qty), lineTargetTotal: null } : i,
        )
        .filter((i) => i.qty > 0),
    );
  }

  async function handleScanEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !scan.trim()) return;
    const factor = await getBarcodeQuantityFactor(scan);
    const exact = await findByBarcode(scan);
    if (exact) {
      if (exact.has_variants) void addProduct(exact);
      else if (needsBulkModal(exact)) setBulkProduct(exact);
      else addItem(exact, null, factor);
    } else if (results.length === 1) addProduct(results[0]);
  }

  function changeQty(key: string, delta: number) {
    setCart((c) =>
      c
        .map((i) =>
          i.key === key
            ? { ...i, qty: Math.max(0, i.qty + delta), lineTargetTotal: null }
            : i,
        )
        .filter((i) => i.qty > 0),
    );
  }
  function setItemDiscount(key: string, pct: number) {
    const clamped = clampAdjustPct(pct);
    setCart((c) =>
      c.map((i) =>
        i.key === key ? { ...i, discountPct: clamped, lineTargetTotal: null } : i,
      ),
    );
  }
  function setItemFinalPrice(key: string, finalPrice: number) {
    setCart((c) =>
      c.map((i) => {
        if (i.key !== key) return i;
        const sub = lineSubtotal(i.unitPrice, i.qty);
        const target = roundMoney(Math.max(0, finalPrice));
        return {
          ...i,
          lineTargetTotal: target,
          discountPct: exactDiscountPctFromFinalPrice(sub, target),
        };
      }),
    );
  }
  function setGlobalDiscountPct(pct: number) {
    setGlobalTargetTotal(null);
    setGlobalDiscount(clampAdjustPct(pct));
  }
  function setGlobalDiscountFromTotal(desiredTotal: number) {
    const target = roundMoney(Math.max(0, desiredTotal));
    setGlobalTargetTotal(target);
    setGlobalDiscount(exactDiscountPctFromFinalPrice(subtotal, target));
  }
  async function removeItem(key: string) {
    const item = cart.find((i) => i.key === key);
    if (!item) return;
    const ok = await confirmAction({
      title: "Quitar del carrito",
      message: `¿Quitar «${item.label}» del carrito?`,
      variant: "danger",
      confirmLabel: "Sí, quitar",
    });
    if (!ok) return;
    setCart((c) => c.filter((i) => i.key !== key));
  }

  const subtotal = roundMoney(cart.reduce((acc, i) => acc + cartLineFinal(i), 0));
  const total =
    globalTargetTotal != null
      ? roundMoney(globalTargetTotal)
      : roundMoney(subtotal * (1 - globalDiscount / 100));
  const saleGlobalDiscount =
    globalTargetTotal != null
      ? exactDiscountPctFromFinalPrice(subtotal, globalTargetTotal)
      : globalDiscount;
  const change = typeof paid === "number" ? paid - total : 0;

  useEffect(() => {
    if (payment !== "efectivo" && payment !== "fiado") {
      setPaid(total);
    }
  }, [payment, total]);

  const resolvePaidAmount = useCallback((): number | null => {
    if (isFiado) return null;
    if (payment !== "efectivo") return total;
    if (typeof paid === "number" && paid >= total) return paid;
    return total;
  }, [isFiado, payment, paid, total]);

  const adjustLastCartItem = useCallback((delta: number) => {
    setCart((c) => {
      if (c.length === 0) return c;
      const last = c[c.length - 1];
      return c
        .map((i) =>
          i.key === last.key ? { ...i, qty: Math.max(0, i.qty + delta) } : i,
        )
        .filter((i) => i.qty > 0);
    });
  }, []);

  const completeSale = useCallback(async (mpRefs?: { orderId: string; paymentId?: string | null }) => {
    if (cart.length === 0) return;
    if (!cashSessionId) {
      showUserError("Abrí el turno de caja antes de vender.", "Caja cerrada");
      return;
    }
    const cid = customerId === "" ? null : customerId;
    const paidAmount = resolvePaidAmount();
    const changeDue =
      paidAmount != null && paidAmount >= total ? paidAmount - total : null;

    const saleId = await recordSale({
      subtotal,
      discount_pct: saleGlobalDiscount,
      total,
      payment_method: payment,
      paid: paidAmount,
      change_due: changeDue,
      user_id: user?.id ?? null,
      cash_session_id: cashSessionId,
      customer_id: cid,
      mp_order_id: mpRefs?.orderId ?? null,
      mp_payment_id: mpRefs?.paymentId ?? null,
      items: cart.map((i) => {
        const lineFinal = cartLineFinal(i);
        return {
          product_id: i.product.id,
          variant_id: i.variant?.id ?? null,
          name: i.label,
          qty: i.qty,
          stock_qty: i.qty * i.stockFactor,
          unit_price: i.unitPrice,
          discount_pct: i.discountPct,
          line_total: lineFinal,
        };
      }),
    });

    if (fiscalEnabled && invoiceThisSale) {
      void queueFiscalInvoice(saleId);
    }

    if (user) {
      void logAuditAction(user.id, "sale_completed", "sale", saleId, `total=${total}`);
      if (
        saleGlobalDiscount !== 0 ||
        cart.some((i) => i.discountPct !== 0 || i.lineTargetTotal != null)
      ) {
        void logAuditAction(user.id, "manual_discount", "sale", saleId);
      }
    }

    try {
      await printSaleReceipt(saleId, payment === "efectivo");
    } catch {
      /* impresión opcional */
    }

    setDone(true);
    setTimeout(() => {
      setCart([]);
      setGlobalDiscount(0);
      setGlobalTargetTotal(null);
      setPaid("");
      setPayment("efectivo");
      setCustomerId("");
      setInvoiceThisSale(false);
      setDone(false);
      reloadQuickPick();
      scanRef.current?.focus();
    }, 1400);
  }, [
    cart,
    cashSessionId,
    customerId,
    globalDiscount,
    payment,
    subtotal,
    total,
    user,
    fiscalEnabled,
    invoiceThisSale,
    resolvePaidAmount,
    reloadQuickPick,
  ]);

  const finalize = useCallback(async () => {
    if (cart.length === 0 || done) return;
    if (payment === "mercadopago") {
      if (total < MP_QR_MIN_AMOUNT) {
        showUserError(
          `El monto es muy pequeño para Mercado Pago QR. Mínimo: ${formatMoney(MP_QR_MIN_AMOUNT, currency)}.`,
          "Monto insuficiente",
        );
        return;
      }
      setMpCheckoutOpen(true);
      return;
    }
    try {
      await completeSale();
    } catch (e) {
      showUserError(e);
    }
  }, [cart.length, currency, done, payment, total, completeSale]);

  useEffect(() => {
    if (!cajaAbierta || picker) return;

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const inField =
        el?.tagName === "INPUT" ||
        el?.tagName === "SELECT" ||
        el?.tagName === "TEXTAREA";

      if (e.key === "F1") {
        e.preventDefault();
        scanRef.current?.focus();
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        if (cart.length > 0 && !done) void finalize();
        return;
      }
      if (e.key === "F3" && paymentMethods[0]) {
        e.preventDefault();
        setPayment(paymentMethods[0]);
        return;
      }
      if (e.key === "F4" && paymentMethods[1]) {
        e.preventDefault();
        setPayment(paymentMethods[1]);
        return;
      }
      if (e.key === "F5" && paymentMethods[2]) {
        e.preventDefault();
        setPayment(paymentMethods[2]);
        return;
      }
      if (e.key === "F6" && paymentMethods[3]) {
        e.preventDefault();
        setPayment(paymentMethods[3]);
        return;
      }
      if (e.key === "F7" && paymentMethods[4]) {
        e.preventDefault();
        setPayment(paymentMethods[4]);
        return;
      }
      if (e.key === "F8" && payment === "efectivo" && !isFiado) {
        e.preventDefault();
        paidRef.current?.focus();
        paidRef.current?.select();
        return;
      }
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        if (cart.length > 0 && !done) void finalize();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (cart.length > 0) {
          void confirmAction({
            title: "Vaciar carrito",
            message: "¿Vaciar el carrito?",
            detail: "Se quitarán todos los ítems de la venta actual.",
            variant: "danger",
            confirmLabel: "Sí, vaciar",
          }).then((ok) => {
            if (ok) {
              setCart([]);
              setGlobalDiscount(0);
              setPaid("");
            }
            scanRef.current?.focus();
          });
        } else {
          setScan("");
          setResults([]);
          scanRef.current?.focus();
        }
        return;
      }
      if (inField && el !== scanRef.current) return;

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        adjustLastCartItem(1);
      } else if (e.key === "-") {
        e.preventDefault();
        adjustLastCartItem(-1);
      } else if (e.key === "Delete" && cart.length > 0) {
        e.preventDefault();
        const last = cart[cart.length - 1];
        void removeItem(last.key);
      }
    };

    window.addEventListener("keydown", onKey as unknown as EventListener);
    return () => window.removeEventListener("keydown", onKey as unknown as EventListener);
  }, [
    cajaAbierta,
    picker,
    cart,
    done,
    finalize,
    adjustLastCartItem,
    paymentMethods,
    payment,
    isFiado,
  ]);

  if (!cajaAbierta) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-surface p-8">
        <div className="w-full max-w-md rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-8 shadow-xl">
          <EmptyState
            icon={Lock}
            title="Caja cerrada"
            description="Abrí un turno de caja para usar el punto de venta. Mientras la caja esté cerrada no se pueden registrar ventas."
            action={
              <Link to="/caja">
                <Button className="gap-2">
                  <Wallet size={18} /> Ir a abrir caja
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 flex-1 flex-col border-r border-brand-100 bg-[var(--color-panel)] dark:border-brand-800/60">
        <div className="space-y-3 border-b border-[var(--color-panel-border)] p-5">
          <div className="relative">
            <Barcode size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-500" />
            <input
              ref={scanRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={handleScanEnter}
              placeholder="Escaneá o buscá (mín. 2 letras). Enter agrega · F2 cobrar · F1 foco"
              className="w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-3 pl-10 pr-3 text-base text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900"
            />
          </div>
          <p className="text-[11px] text-ink-muted">
            F1 buscar · F2 cobrar · F3–F7 medio de pago · F8 monto efectivo · Ctrl+Enter cobrar ·
            Esc vaciar · +/- último · Supr quitar último
          </p>
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
            <EmptyState
              compact
              icon={Search}
              title="Sin resultados"
              description="Probá con otro nombre, código o filtro de catálogo."
            />
          )}
          {results.length === 0 && !scan.trim() && !hasCatalogFilter && showQuickPick && (
            <PosQuickPickGrid
              favorites={quickPick.favorites}
              topSellers={quickPick.topSellers}
              currency={currency}
              onPick={(p) => void addProduct(p)}
            />
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="pos-product-card"
              >
                <p className="line-clamp-2 text-sm font-medium text-ink">{p.name}</p>
                {(p.category_name || p.brand_name) && (
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {[p.category_name, p.brand_name].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="mt-1 text-base font-semibold text-brand-600 dark:text-brand-300">
                  {formatMoney(p.price, currency)}
                  {productSoldByWeight(p.unit) && (
                    <span className="text-xs font-normal text-ink-muted">
                      {" "}
                      / {formatUnitShort(p.unit)}
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-muted">
                  {p.has_variants ? "Con variantes" : `Stock: ${p.stock}`}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pos-checkout-panel flex h-full min-h-0 w-[420px] shrink-0 flex-col border-l border-brand-100 bg-[var(--color-panel)] dark:border-brand-800/60">
        <div className="shrink-0 border-b border-brand-100 px-5 py-4">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">Venta actual</h2>
          {cart.length > 0 && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {cart.length} ítem{cart.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-surface/80 p-4">
          {cart.length === 0 ? (
            <EmptyState
              compact
              icon={ShoppingCart}
              title="Carrito vacío"
              description="Escaneá un código o elegí un producto del catálogo."
            />
          ) : (
            <div className="space-y-2">
              {cart.map((i) => {
                const byWeight =
                  !i.variant &&
                  bulkWeightEnabled &&
                  productSoldByWeight(i.product.unit);
                const listPrice = lineSubtotal(i.unitPrice, i.qty);
                const lineFinal = cartLineFinal(i);
                return (
                <div
                  key={i.key}
                  className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{i.label}</p>
                    <button
                      type="button"
                      onClick={() => void removeItem(i.key)}
                      className="text-ink-muted hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {byWeight ? (
                      <label className="flex min-w-0 flex-1 items-center gap-1 text-xs text-ink-muted">
                        <span>Cant.</span>
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={i.qty}
                          onChange={(e) =>
                            setItemQty(i.key, Number(e.target.value))
                          }
                          className="w-full max-w-[5.5rem] rounded border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1 text-sm tabular-nums text-ink"
                        />
                        <span>{formatUnitShort(i.product.unit)}</span>
                      </label>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => changeQty(i.key, -1)}
                          className="rounded-md border border-[var(--color-panel-border)] p-1 text-ink hover:bg-brand-50 dark:hover:bg-brand-900/40"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-sm font-medium text-ink">
                          {formatQty(i.qty)}
                        </span>
                        <button
                          onClick={() => changeQty(i.key, 1)}
                          className="rounded-md border border-[var(--color-panel-border)] p-1 text-ink hover:bg-brand-50 dark:hover:bg-brand-900/40"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    )}
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(lineFinal, currency)}
                    </span>
                  </div>
                  {byWeight && (
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {formatMoney(i.unitPrice, currency)} / {formatUnitShort(i.product.unit)}
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-1 text-xs">
                    <span className="text-ink-muted">Lista</span>
                    <span className="col-span-2 tabular-nums text-ink-muted">
                      {formatMoney(listPrice, currency)}
                    </span>
                    <span className="text-ink-muted">Ajuste %</span>
                    <AdjustPctInput
                      internalValue={i.discountPct}
                      onChangeInternal={(pct) => setItemDiscount(i.key, pct)}
                      className="w-full rounded border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1 text-xs tabular-nums text-ink outline-none focus:border-brand-500"
                    />
                    <label className="flex min-w-0 items-center gap-1">
                      <span className="shrink-0 text-ink-muted">A cobrar</span>
                      <EditableAmountInput
                        value={lineFinal}
                        onCommit={(amount) => setItemFinalPrice(i.key, amount)}
                        className="min-w-0 flex-1 rounded border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1 text-xs tabular-nums text-ink outline-none focus:border-brand-500"
                      />
                    </label>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>

        <div className="mt-auto shrink-0 border-t border-brand-100 px-5 py-4 shadow-[0_-4px_20px_rgba(19,78,74,0.06)]">
          {features.customers && (
            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-medium text-ink-muted">Cliente (opcional)</span>
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
              <span className="text-sm font-medium tabular-nums text-ink">
                {formatMoney(subtotal, currency)}
              </span>
            </CheckoutRow>
            <CheckoutRow label="Ajuste %">
              <AdjustPctInput
                internalValue={saleGlobalDiscount}
                onChangeInternal={setGlobalDiscountPct}
                className={`${checkoutControlClass} text-right`}
              />
            </CheckoutRow>
            <CheckoutRow label="Total a cobrar" className="pt-1">
              <EditableAmountInput
                value={total}
                onCommit={setGlobalDiscountFromTotal}
                className={`${checkoutControlClass} pos-checkout-total text-right`}
              />
            </CheckoutRow>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className="mb-1 block text-sm font-medium text-ink-muted">Medio de pago</span>
              <select
                ref={paymentRef}
                value={payment}
                onChange={(e) => {
                  setPayment(e.target.value);
                  if (e.target.value === "fiado") setPaid("");
                }}
                className={checkoutControlClass}
              >
                {paymentMethods.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_LABELS[m] ?? m}
                  </option>
                ))}
              </select>
            </label>
            {!isFiado ? (
              <label className="block min-w-0">
                <span className="mb-1 block text-sm font-medium text-ink-muted">Paga con</span>
                <input
                  ref={paidRef}
                  type="number"
                  step={1}
                  value={paid}
                  onChange={(e) => setPaid(e.target.value === "" ? "" : Number(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (cart.length > 0 && !done) void finalize();
                    }
                  }}
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

          {fiscalEnabled && (
            <button
              type="button"
              onClick={() => setInvoiceThisSale((v) => !v)}
              aria-pressed={invoiceThisSale}
              className={`mt-4 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                invoiceThisSale
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
                  : "border-[var(--color-panel-border)] bg-[var(--color-input-bg)] text-ink-muted hover:border-brand-400"
              }`}
            >
              <span className="flex items-center gap-2">
                <ReceiptText size={16} />
                <span className="font-medium">
                  {invoiceThisSale ? "Esta venta se facturará en ARCA" : "Facturar esta venta (ARCA)"}
                </span>
              </span>
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
                  invoiceThisSale ? "bg-brand-500" : "bg-[var(--color-panel-border)]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                    invoiceThisSale ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
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

      <MercadoPagoQrModal
        open={mpCheckoutOpen}
        amount={total}
        currency={currency}
        description={`Venta mostrador — ${cart.length} ítem(s)`}
        onClose={() => setMpCheckoutOpen(false)}
        onApproved={(info) => {
          setMpCheckoutOpen(false);
          void completeSale(info).catch((e) =>
            showUserError(e),
          );
        }}
      />

      <BulkWeightSaleModal
        open={bulkProduct !== null}
        product={bulkProduct}
        currency={currency}
        onClose={() => setBulkProduct(null)}
        onConfirm={(qty) => {
          if (bulkProduct) addItem(bulkProduct, null, 1, qty);
          setBulkProduct(null);
        }}
      />

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
              className="pos-product-card disabled:opacity-40"
            >
              <p className="text-sm font-medium text-ink">
                {Object.values(v.attributes).filter(Boolean).join(", ") || "Variante"}
              </p>
              <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">
                {formatMoney(v.price ?? picker.product.price, currency)}
              </p>
              <p className="text-xs text-ink-muted">Stock: {v.stock}</p>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
