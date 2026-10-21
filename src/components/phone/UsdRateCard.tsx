import { useEffect, useState } from "react";
import { DollarSign } from "lucide-react";
import { Button, Input, Select } from "../ui";
import {
  USD_CASA_LABELS,
  USD_RATE_EVENT,
  fetchUsdRate,
  getUsdRate,
  saveUsdConfig,
  saveUsdRate,
  type UsdRate,
  type UsdRateCasa,
  type UsdRateMode,
} from "../../lib/usdRate";
import { formatMoney } from "../../lib/format";
import { showUserError, showUserSuccess } from "../../lib/notice";
import { scheduleMenuPortalPush } from "../../lib/menuPortalPush";

function parseAmount(raw: string): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function UsdRateCard({
  currency,
  canEdit,
  onChanged,
}: {
  currency: string;
  canEdit: boolean;
  onChanged?: (rate: number) => void;
}) {
  const [data, setData] = useState<UsdRate | null>(null);
  const [mode, setMode] = useState<UsdRateMode>("auto");
  const [casa, setCasa] = useState<UsdRateCasa>("blue");
  const [manual, setManual] = useState("");
  const [margin, setMargin] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await getUsdRate();
    setData(r);
    setMode(r.mode);
    setCasa(r.casa);
    setManual(r.rate > 0 ? String(r.rate) : "");
    setMargin(r.margin > 0 ? String(r.margin) : "");
  }

  useEffect(() => {
    void load().catch(console.error);
    const onRate = () => void load().catch(console.error);
    window.addEventListener(USD_RATE_EVENT, onRate);
    return () => window.removeEventListener(USD_RATE_EVENT, onRate);
  }, []);

  async function save() {
    const extra = Math.max(0, parseAmount(margin));
    const fixed = parseAmount(manual);
    if (mode === "fijo" && !(fixed > 0)) {
      showUserError("Cargá el dólar fijo, mayor a cero.");
      return;
    }
    setBusy(true);
    try {
      let n = await saveUsdConfig({ mode, casa, margin: extra });
      let fetchError: unknown = null;
      if (mode === "fijo") {
        n += await saveUsdRate(fixed, "manual");
      } else {
        try {
          n += await saveUsdRate(await fetchUsdRate(casa), casa);
        } catch (e) {
          fetchError = e;
        }
      }
      const r = await getUsdRate();
      await load();
      window.dispatchEvent(new Event(USD_RATE_EVENT));
      scheduleMenuPortalPush();
      onChanged?.(r.effective);
      if (fetchError) {
        showUserError(fetchError, "Sin cotización nueva");
      } else {
        showUserSuccess(
          n > 0
            ? `Dólar guardado. Se actualizó el precio en pesos de ${n} producto${n === 1 ? "" : "s"}.`
            : "Dólar guardado.",
        );
      }
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  const base =
    data && data.rate > 0
      ? data.mode === "fijo"
        ? `Fijo ${formatMoney(data.rate, currency)}`
        : `${USD_CASA_LABELS[data.casa]} ${formatMoney(data.rate, currency)}`
      : "";

  return (
    <div className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <DollarSign size={16} className="text-brand-600 dark:text-brand-300" />
          Dólar
        </p>
        <p className="mt-1 truncate text-2xl font-bold tabular-nums text-ink">
          {data && data.effective > 0 ? formatMoney(data.effective, currency) : "Sin cargar"}
        </p>
        {data && data.margin > 0 && base ? (
          <p className="mt-0.5 truncate text-xs text-ink-muted">
            {base} + {formatMoney(data.margin, currency)}
          </p>
        ) : null}
        <p className="mt-0.5 truncate text-xs text-ink-muted">
          {data?.updatedAt
            ? `Actualizado ${data.updatedAt.slice(8, 10)}/${data.updatedAt.slice(5, 7)} ${data.updatedAt.slice(11, 16)} · ${
                data.source && data.source !== "manual" ? `de internet (${USD_CASA_LABELS[data.source]})` : "a mano"
              }`
            : "Los precios en US$ se pasan a pesos con este valor."}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {data?.mode === "fijo"
            ? "Queda fijo hasta que lo cambies. La tienda web usa este mismo valor."
            : "Se trae solo de internet cada 30 minutos. La tienda web lo sigue aunque WalQo esté cerrado."}
        </p>
      </div>
      {canEdit ? (
        <div className="mt-3 grid min-w-0 gap-3">
          <div
            className="grid min-w-0 grid-cols-2 gap-1 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-1"
            role="radiogroup"
            aria-label="Cómo se calcula el dólar"
          >
            {(
              [
                ["auto", "Automático"],
                ["fijo", "Fijo"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={`min-w-0 truncate rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                  mode === value ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "auto" ? (
            <Select label="Dólar de internet" value={casa} onChange={(e) => setCasa(e.target.value as UsdRateCasa)}>
              {(Object.keys(USD_CASA_LABELS) as UsdRateCasa[]).map((c) => (
                <option key={c} value={c}>
                  Dólar {USD_CASA_LABELS[c]}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              label="Dólar fijo ($ por US$)"
              type="number"
              min={0}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
            />
          )}
          <Input
            label="Sumar al dólar ($)"
            type="number"
            min={0}
            value={margin}
            placeholder="0"
            onChange={(e) => setMargin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
            hint="Ej.: 20 para cobrar el dólar + $20. Vale en la caja y en la tienda web."
          />
          <Button onClick={() => void save()} loading={busy}>
            {mode === "auto" ? "Guardar y traer el dólar" : "Guardar"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
