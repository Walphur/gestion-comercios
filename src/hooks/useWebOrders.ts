import { useEffect, useState } from "react";
import {
  getWebMpStatus,
  getWebOrders,
  getWebOrdersError,
  subscribeWebOrders,
  type WebMpStatus,
  type WebOrder,
} from "../lib/webOrders";

function snapshot() {
  return { orders: getWebOrders(), error: getWebOrdersError(), mpStatus: getWebMpStatus() };
}

/** Pedidos web pendientes (los baja `startWebOrdersLoop`). */
export function useWebOrders(): { orders: WebOrder[]; error: string | null; mpStatus: WebMpStatus | null } {
  const [state, setState] = useState(snapshot);
  useEffect(() => subscribeWebOrders(() => setState(snapshot())), []);
  return state;
}
