import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Plus, Minus, Trash2, Barcode, Search, CheckCircle2 } from "lucide-react";
import { Button, Input } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { findByBarcode, listProducts, decrementStock } from "../db/products";
import type { Product } from "../types";
import { formatMoney } from "../lib/format";

interface CartItem {
  product: Product;
  qty: number;
  discountPct: number;
}

export default function POS() {
  const { currency } = useAppConfig();
  const [scan, setScan] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [paid, setPaid] = useState<number | "">("");
  const [done, setDone] = useState(false);
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

  function addProduct(p: Product) {
    setCart((c) => {
      const found = c.find((i) => i.product.id === p.id);
      if (found) return c.map((i) => (i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...c, { product: p, qty: 1, discountPct: 0 }];
    });
    setScan("");
    setResults([]);
    scanRef.current?.focus();
  }

  async function handleScanEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !scan.trim()) return;
    const exact = await findByBarcode(scan);
    if (exact) addProduct(exact);
    else if (results.length === 1) addProduct(results[0]);
  }

  function changeQty(id: number, delta: number) {
    setCart((c) =>
      c
        .map((i) => (i.product.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i))
        .filter((i) => i.qty > 0),
    );
  }

  function setItemDiscount(id: number, pct: number) {
    setCart((c) => c.map((i) => (i.product.id === id ? { ...i, discountPct: pct } : i)));
  }

  function removeItem(id: number) {
    setCart((c) => c.filter((i) => i.product.id !== id));
  }

  const subtotal = cart.reduce(
    (acc, i) => acc + i.product.price * i.qty * (1 - i.discountPct / 100),
    0,
  );
  const total = subtotal * (1 - globalDiscount / 100);
  const change = typeof paid === "number" ? paid - total : 0;

  async function finalize() {
    if (cart.length === 0) return;
    await decrementStock(cart.map((i) => ({ id: i.product.id, qty: i.qty })));
    setDone(true);
    setTimeout(() => {
      setCart([]);
      setGlobalDiscount(0);
      setPaid("");
      setDone(false);
      scanRef.current?.focus();
    }, 1400);
  }

  return (
    <div className="flex h-full">
      {/* Columna de búsqueda / productos */}
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
                <p className="text-xs text-slate-400">Stock: {p.stock}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Columna del carrito */}
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
                <div key={i.product.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">{i.product.name}</p>
                    <button
                      onClick={() => removeItem(i.product.id)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => changeQty(i.product.id, -1)}
                        className="rounded-md border border-slate-300 p-1 hover:bg-slate-100"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{i.qty}</span>
                      <button
                        onClick={() => changeQty(i.product.id, 1)}
                        className="rounded-md border border-slate-300 p-1 hover:bg-slate-100"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="text-sm font-semibold">
                      {formatMoney(i.product.price * i.qty * (1 - i.discountPct / 100), currency)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-slate-400">Desc. %</span>
                    <input
                      type="number"
                      value={i.discountPct}
                      min={0}
                      max={100}
                      onChange={(e) => setItemDiscount(i.product.id, Number(e.target.value))}
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

          <div className="mb-3">
            <Input
              label="Paga con"
              type="number"
              value={paid}
              onChange={(e) => setPaid(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="0.00"
            />
            {typeof paid === "number" && paid >= total && (
              <p className="mt-1 text-sm text-emerald-600">
                Vuelto: <strong>{formatMoney(change, currency)}</strong>
              </p>
            )}
          </div>

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
    </div>
  );
}
