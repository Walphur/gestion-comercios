import { getDb } from "./index";

export interface WorkshopDashboardStats {
  ordersInProgress: number;
  ordersWaitingParts: number;
  ordersReady: number;
  appointmentsToday: number;
  quotesPending: number;
}

export async function getWorkshopDashboardStats(): Promise<WorkshopDashboardStats> {
  const db = await getDb();
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const from = `${ymd} 00:00:00`;
  const to = `${ymd} 23:59:59`;

  const [inProgress, waiting, ready, appts, quotes] = await Promise.all([
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM service_orders WHERE status = 'in_progress'`,
    ),
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM service_orders WHERE status = 'waiting_parts'`,
    ),
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM service_orders WHERE status = 'ready'`,
    ),
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM appointments
       WHERE starts_at >= $1 AND starts_at <= $2
         AND status NOT IN ('cancelled', 'no_show')`,
      [from, to],
    ),
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM quotes WHERE status IN ('draft', 'sent')`,
    ),
  ]);

  return {
    ordersInProgress: inProgress[0]?.n ?? 0,
    ordersWaitingParts: waiting[0]?.n ?? 0,
    ordersReady: ready[0]?.n ?? 0,
    appointmentsToday: appts[0]?.n ?? 0,
    quotesPending: quotes[0]?.n ?? 0,
  };
}
