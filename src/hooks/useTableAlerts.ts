import { useEffect, useState } from "react";
import { getTableAlerts, refreshTableAlerts, subscribeTableAlerts, type TableAlerts } from "../lib/tables";

/** Mesas que llaman al mozo, piden la cuenta o mandaron un pedido del QR sin confirmar. */
export function useTableAlerts(enabled: boolean): TableAlerts {
  const [state, setState] = useState(getTableAlerts);
  useEffect(() => {
    if (!enabled) return;
    void refreshTableAlerts();
    return subscribeTableAlerts(() => setState(getTableAlerts()));
  }, [enabled]);
  return enabled ? state : { calls: 0, pendingOrders: 0 };
}
