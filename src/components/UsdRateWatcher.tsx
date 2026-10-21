import { useEffect } from "react";
import { useAppConfig } from "../context/AppConfig";
import { fetchUsdRate, getUsdRate, saveUsdRate, USD_RATE_EVENT } from "../lib/usdRate";
import { formatMoney } from "../lib/format";
import { showFlash } from "../lib/notice";

const EVERY_MS = 30 * 60 * 1000;

/** En modo automático trae el dólar al abrir y cada 30 minutos; si cambió, ajusta los precios en pesos. */
export default function UsdRateWatcher() {
  const { phoneStore, currency } = useAppConfig();

  useEffect(() => {
    if (!phoneStore) return;
    let running = false;
    async function tick() {
      if (running) return;
      running = true;
      try {
        const current = await getUsdRate();
        if (current.mode === "fijo") return;
        const venta = await fetchUsdRate(current.casa);
        if (Math.abs(venta - current.rate) < 0.5) return;
        const n = await saveUsdRate(venta, current.casa);
        window.dispatchEvent(new Event(USD_RATE_EVENT));
        const shown = formatMoney(venta + current.margin, currency);
        showFlash({
          message:
            n > 0
              ? `Dólar actualizado a ${shown}. Se ajustaron ${n} precio${n === 1 ? "" : "s"}.`
              : `Dólar actualizado a ${shown}.`,
          variant: "success",
          durationMs: 6000,
        });
      } catch {
        /* sin internet: sigue la última cotización guardada */
      } finally {
        running = false;
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), EVERY_MS);
    return () => window.clearInterval(id);
  }, [phoneStore, currency]);

  return null;
}
