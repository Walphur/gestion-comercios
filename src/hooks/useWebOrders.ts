import { useEffect, useState } from "react";
import { getWebOrders, getWebOrdersError, subscribeWebOrders, type WebOrder } from "../lib/webOrders";

/** Pedidos web pendientes (los baja `startWebOrdersLoop`). */
export function useWebOrders(): { orders: WebOrder[]; error: string | null } {
  const [state, setState] = useState(() => ({ orders: getWebOrders(), error: getWebOrdersError() }));
  useEffect(
    () =>
      subscribeWebOrders(() => setState({ orders: getWebOrders(), error: getWebOrdersError() })),
    [],
  );
  return state;
}
