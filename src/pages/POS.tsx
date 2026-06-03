import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Plus, Minus, Trash2, Barcode, Search, CheckCircle2 } from "lucide-react";
import { Button, Input, Modal } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { getSetting } from "../db/settings";
import { findByBarcode, getBarcodeQuantityFactor, listProducts } from "../db/products";
import { listVariants } from "../db/variants";
import { recordSale } from "../db/sales";
import { logAuditAction, queueFiscalInvoice } from "../lib/tauri";
import type { Product, ProductVariant } from "../types";
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

const PAYMENT_METHODS = ["efectivo", "débito", "crédito", "transferencia", "qr"];

export default function POS() {
  const { currency } = useAppConfig();
  const { user } = useAuth();
  const [scan, setScan] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [payment, setPayment] = useState("efectivo");
  const [paid, setPaid] = useState<number | "">("");
  const [done, setDone] = useState(false);
  const [picker, setPicker] = useState<{ product: Product; variants: ProductVariant[] } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!scan.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setResults(await listProducts({ search: scan }));
    }, 180);
    return () => clearTimeout(t);
  }, [scan]);

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
    const sessionRaw = localStorage.getItem("cash_session_id");
    const cashSessionId = sessionRaw ? Number(sessionRaw) : null;

    const saleId = await recordSale({
      subtotal,
      discount_pct: globalDiscount,
      total,
      payment_method: payment,
      paid: typeof paid === "number" ? paid : null,
      change_due: typeof paid === "number" ? change : null,
      user_id: user?.id ?? null,
      cash_session_id: cashSessionId,
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
      setDone(false);
      scanRef.current?.focus();
    }, 1400);
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5">
          <div className="relative">
            <Barcode size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500" />
            <input
              ref={scanRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={handleScanEnter}
              placeholder="Escaneá un código de barras o buscá por nombre y presioná Enter..."
              className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {results.length === 0 && scan.trim() && (
            <p className="text-center text-sm text-slate-400">Sin resultados para "{scan}".</p>
          )}
          {results.length === 0 && !scan.trim() && (
            <div className="flex h-full items-center justify-center text-center text-slate-400">
              <div>
                <Search size={40} className="mx-auto mb-3 opacity-40" />
                <p>Escaneá o buscá un producto para agregarlo a la venta.</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50/50"
              >
                <p className="line-clamp-2 text-sm font-medium text-slate-800">{p.name}</p>
                <p className="mt-1 text-base font-semibold text-indigo-600">
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

      <div className="flex w-[420px] flex-col bg-slate-50">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Venta actual</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <p className="mt-10 text-center text-sm text-slate-400">El carrito está vacío.</p>
          ) : (
            <div className="space-y-2">
              {cart.map((i) => (
                <div key={i.key} className="rounded-xl border border-slate-200 bg-white p-3">
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
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between text-sm text-slate-600">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal, currency)}</span>
          </div>
          <div className="mb-3 flex items-center justify-between text-sm text-slate-600">
            <span>Descuento global %</span>
            <input
              type="number"
              value={globalDiscount}
              min={0}
              max={100}
              onChange={(e) => setGlobalDiscount(Number(e.target.value))}
              className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <div className="mb-4 flex items-center justify-between text-xl font-bold text-slate-900">
            <span>Total</span>
            <span>{formatMoney(total, currency)}</span>
          </div>

          <div className="mb-3 flex gap-2">
            <div className="flex-1">
              <span className="mb-1 block text-sm font-medium text-slate-600">Medio de pago</span>
              <select
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm capitalize outline-none focus:border-indigo-500"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <Input
                label="Paga con"
                type="number"
                value={paid}
                onChange={(e) => setPaid(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="0.00"
              />
            </div>
          </div>
          {typeof paid === "number" && paid >= total && (
            <p className="mb-3 text-sm text-emerald-600">
              Vuelto: <strong>{formatMoney(change, currency)}</strong>
            </p>
          )}

          <Button onClick={finalize} disabled={cart.length === 0} className="w-full py-3 text-base">
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
              className="rounded-xl border border-slate-200 p-3 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50/50 disabled:opacity-40"
            >
              <p className="text-sm font-medium text-slate-800">
                {Object.values(v.attributes).filter(Boolean).join(", ") || "Variante"}
              </p>
              <p className="text-sm font-semibold text-indigo-600">
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
