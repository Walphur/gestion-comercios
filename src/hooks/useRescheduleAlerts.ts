import { useCallback, useEffect, useRef, useState } from "react";
import {
  countUnreadRescheduleAlerts,
  listUnreadRescheduleAlerts,
  markRescheduleAlertSeen,
  type RescheduleAlert,
} from "../db/appointmentNotifications";
import { showNotice } from "../lib/notice";

const POLL_MS = 30_000;

export function useRescheduleAlerts(enabled: boolean, notifyOnNew = false) {
  const [alerts, setAlerts] = useState<RescheduleAlert[]>([]);
  const [count, setCount] = useState(0);
  const prevCount = useRef(0);
  const initialized = useRef(false);

  const reload = useCallback(async () => {
    if (!enabled) {
      setAlerts([]);
      setCount(0);
      return;
    }
    try {
      const [list, n] = await Promise.all([
        listUnreadRescheduleAlerts(),
        countUnreadRescheduleAlerts(),
      ]);
      if (notifyOnNew && initialized.current && n > prevCount.current) {
        const newest = list[0];
        showNotice({
          title: "Cliente quiere reprogramar",
          message: newest
            ? `${newest.customer_name ?? "Un cliente"} pidió cambiar el turno del ${newest.title}.`
            : "Un cliente pidió reprogramar un turno por WhatsApp.",
          variant: "info",
        });
      }
      prevCount.current = n;
      initialized.current = true;
      setAlerts(list);
      setCount(n);
    } catch {
      /* sync opcional */
    }
  }, [enabled, notifyOnNew]);

  useEffect(() => {
    void reload();
    if (!enabled) return;
    const id = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, reload]);

  const dismiss = useCallback(
    async (id: number) => {
      await markRescheduleAlertSeen(id);
      await reload();
    },
    [reload],
  );

  return { alerts, count, reload, dismiss };
}
