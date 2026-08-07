import { useCallback, useEffect, useState } from "react";
import { Package, ShoppingCart } from "lucide-react";
import { useLicense } from "../context/LicenseContext";
import {
  FREE_MAX_PRODUCTS,
  FREE_MAX_SALES_PER_MONTH,
  PRICE_BASIC_MONTHLY_ARS,
  PRICE_PRO_MONTHLY_ARS,
  formatPriceArs,
  isFreePlan,
} from "../config/pricing";
import { countActiveProducts, countSalesThisMonth } from "../lib/planLimits";
import { openSalesWhatsApp } from "../lib/supportContact";
import { Button, Input } from "./ui";

/** Barra de uso del plan gratis + upgrade / activar clave. */
export default function FreePlanBanner() {
  const { status, activate } = useLicense();
  const [products, setProducts] = useState(0);
  const [sales, setSales] = useState(0);
  const [showKey, setShowKey] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!isFreePlan(status?.plan)) return;
    try {
      const [p, s] = await Promise.all([countActiveProducts(), countSalesThisMonth()]);
      setProducts(p);
      setSales(s);
    } catch {
      /* ignore */
    }
  }, [status?.plan]);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 30_000);
    return () => window.clearInterval(id);
  }, [reload]);

  if (!isFreePlan(status?.plan)) return null;

  async function onActivate() {
    setError("");
    setBusy(true);
    try {
      const next = await activate(key.trim());
      if (!next.active || isFreePlan(next.plan)) {
        setError(next.message ?? "No se pudo activar");
      } else {
        setShowKey(false);
        setKey("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm text-ink">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-sky-900 dark:text-sky-100">Plan gratis</span>
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <Package size={14} /> {products}/{FREE_MAX_PRODUCTS} productos
          </span>
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <ShoppingCart size={14} /> {sales}/{FREE_MAX_SALES_PER_MONTH} ventas este mes
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-3 py-1 text-xs font-semibold hover:border-brand-400"
          >
            Ya tengo clave
          </button>
          <button
            type="button"
            onClick={() =>
              void openSalesWhatsApp(
                `Hola! Quiero pasar del plan gratis a Estándar (${formatPriceArs(PRICE_BASIC_MONTHLY_ARS)}) o Pro+ (${formatPriceArs(PRICE_PRO_MONTHLY_ARS)}).`,
              )
            }
            className="rounded-lg bg-[#25D366] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1ebe57]"
          >
            Mejorar plan
          </button>
        </div>
      </div>
      {showKey && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <Input
              label="Clave GC"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="GC-XXXX-XXXX-XXXX"
            />
          </div>
          <Button size="sm" loading={busy} disabled={busy || key.trim().length < 8} onClick={() => void onActivate()}>
            Activar
          </Button>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
