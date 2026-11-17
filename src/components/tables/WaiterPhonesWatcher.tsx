import { useEffect } from "react";
import { useAppConfig } from "../../context/AppConfig";
import { usePlanEntitlements } from "../../hooks/usePlanEntitlements";
import { configureWaiterSync, nudgeWaiterSync, stopWaiterSync } from "../../lib/waiterPhones";

/** Publica el salón para los celulares de los mozos y anota sus comandas (solo con celulares vinculados). */
export default function WaiterPhonesWatcher() {
  const { tablesEnabled, waiterPhonesEnabled, features, businessName, currency } = useAppConfig();
  const { waiterPhones, tables } = usePlanEntitlements();
  const enabled = tablesEnabled && waiterPhonesEnabled && features.pos;

  useEffect(() => {
    if (!enabled) {
      stopWaiterSync();
      return;
    }
    configureWaiterSync({
      enabled,
      unlimitedWaiters: waiterPhones,
      unlimitedTables: tables,
      businessName: businessName || "Mi local",
      currency: currency || "$",
    });
  }, [enabled, waiterPhones, tables, businessName, currency]);

  useEffect(() => {
    if (!enabled) return;
    const onTouch = () => nudgeWaiterSync();
    window.addEventListener("walqo:tables-touched", onTouch);
    window.addEventListener("walqo-kitchen-changed", onTouch);
    window.addEventListener("walqo:tables-changed", onTouch);
    return () => {
      window.removeEventListener("walqo:tables-touched", onTouch);
      window.removeEventListener("walqo-kitchen-changed", onTouch);
      window.removeEventListener("walqo:tables-changed", onTouch);
    };
  }, [enabled]);

  useEffect(() => () => stopWaiterSync(), []);

  return null;
}
