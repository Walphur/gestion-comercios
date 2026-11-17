import { useEffect, useState } from "react";
import { getTableAlerts, refreshTableAlerts, subscribeTableAlerts, type TableAlerts } from "../lib/tables";

/** Mesas que llaman al mozo, piden la cuenta, mandaron un pedido del QR o tienen comida lista. */
export function useTableAlerts(enabled: boolean): TableAlerts {
  const [state, setState] = useState(getTableAlerts);
  useEffect(() => {
    if (!enabled) return;
    void refreshTableAlerts();
    const unsub = subscribeTableAlerts(() => setState(getTableAlerts()));
    const onTouch = () => void refreshTableAlerts();
    window.addEventListener("walqo:tables-changed", onTouch);
    window.addEventListener("walqo-kitchen-changed", onTouch);
    const poll = window.setInterval(onTouch, 8_000);
    return () => {
      unsub();
      window.removeEventListener("walqo:tables-changed", onTouch);
      window.removeEventListener("walqo-kitchen-changed", onTouch);
      window.clearInterval(poll);
    };
  }, [enabled]);
  return enabled ? state : { calls: 0, pendingOrders: 0, readyFood: 0, readyFoodItems: [] };
}
