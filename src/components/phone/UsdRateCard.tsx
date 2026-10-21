import { useEffect, useState } from "react";
import { DollarSign, RefreshCw } from "lucide-react";
import { Button, Input, Select } from "../ui";
import {
  USD_CASA_LABELS,
  USD_RATE_EVENT,
  fetchUsdRate,
  getUsdRate,
  saveUsdRate,
  setUsdRateCasa,
  type UsdRate,
  type UsdRateCasa,
} from "../../lib/usdRate";
import { formatMoney } from "../../lib/format";
import { showUserError, showUserSuccess } from "../../lib/notice";

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
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await getUsdRate();
    setData(r);
    setDraft(r.rate > 0 ? String(r.rate) : "");
  }

  useEffect(() => {
    void load().catch(console.error);
    const onRate = () => void load().catch(console.error);
    window.addEventListener(USD_RATE_EVENT, onRate);
    return () => window.removeEventListener(USD_RATE_EVENT, onRate);
  }, []);

  async function save(rate: number, source: UsdRate["source"]) {
    setBusy(true);
    try {
      const n = await saveUsdRate(rate, source);
      await load();
      onChanged?.(rate);
      showUserSuccess(
        n > 0 ? `Dólar guardado. Se actualizó el precio en pesos de ${n} producto${n === 1 ? "" : "s"}.` : "Dólar guardado.",
      );
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  async function fetchNow() {
    if (!data) return;
    setBusy(true);
    try {
      const venta = await fetchUsdRate(data.casa);
      setBusy(false);
      await save(venta, data.casa);
    } catch (e) {
      setBusy(false);
      showUserError(e, "Sin cotización nueva");
    }
  }

  return (
    <div className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <DollarSign size={16} className="text-brand-600 dark:text-brand-300" />
            Dólar
          </p>
          <p className="mt-1 truncate text-2xl font-bold tabular-nums text-ink">
            {data && data.rate > 0 ? formatMoney(data.rate, currency) : "Sin cargar"}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-muted">
            {data?.updatedAt
              ? `Actualizado ${data.updatedAt.slice(8, 10)}/${data.updatedAt.slice(5, 7)} ${data.updatedAt.slice(11, 16)} · ${
                  data.source && data.source !== "manual" ? `dolarapi (${USD_CASA_LABELS[data.source]})` : "a mano"
                }`
              : "Los precios en US$ se pasan a pesos con este valor."}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-muted">
            Se trae solo de internet cada 30 minutos (dólar {USD_CASA_LABELS[data?.casa ?? "blue"].toLowerCase()}).
          </p>
        </div>
      </div>
      {canEdit ? (
        <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <Input
            label="Cotización ($ por US$)"
            type="number"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save(Number(draft.replace(",", ".")), "manual");
            }}
          />
          <Button onClick={() => void save(Number(draft.replace(",", ".")), "manual")} loading={busy} className="h-[46px]">
            Guardar
          </Button>
          <Select
            label="Traer de internet"
            value={data?.casa ?? "blue"}
            onChange={(e) => {
              const casa = e.target.value as UsdRateCasa;
              void setUsdRateCasa(casa).then(load);
            }}
          >
            {(Object.keys(USD_CASA_LABELS) as UsdRateCasa[]).map((c) => (
              <option key={c} value={c}>
                Dólar {USD_CASA_LABELS[c]}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => void fetchNow()} disabled={busy} className="h-[46px]">
            <RefreshCw size={15} /> Traer
          </Button>
        </div>
      ) : null}
    </div>
  );
}
