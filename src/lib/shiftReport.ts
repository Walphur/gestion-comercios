import { getDb } from "../db/index";
import { listCashMovements, type CashMovement } from "../db/cashMovements";
import { buildMoneyInflow, type MoneyInflow } from "../db/moneyInflow";
import type { SalesByPaymentRow } from "../db/reports";
import { roundMoney } from "../db/supplierAccounts";
import { getMethodMap, listTreasuryAccounts } from "../db/treasury";
import { formatMoney } from "./format";
import type { PrintableReport } from "./prints/reportDocument";
import { inflowPrintTable } from "./dailySummary";

const OPENING_CONCEPT = "Efectivo de apertura";

export interface ShiftSession {
  id: number;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  user_name: string | null;
  expected_cash: number | null;
  declared_cash: number | null;
  cash_difference: number | null;
}

export interface ShiftItem {
  name: string;
  qty: number;
  total: number;
}

export interface ShiftReport {
  session: ShiftSession;
  count: number;
  total: number;
  avgTicket: number;
  voidedCount: number;
  voidedTotal: number;
  inflow: MoneyInflow;
  cash: {
    opening: number;
    cashSales: number;
    otherIncome: number;
    expense: number;
    /** Igual que el cierre: ventas en efectivo + ingresos − egresos. */
    expected: number;
  };
  /** Cobros de fiado en efectivo dentro del horario del turno (no entran en el esperado). */
  debtCash: number;
  debtCashCount: number;
  movements: CashMovement[];
  items: ShiftItem[];
}

export interface ShiftListRow {
  id: number;
  opened_at: string;
  closed_at: string | null;
  user_name: string | null;
  cash_difference: number | null;
  count: number;
  total: number;
}

export async function loadShiftReport(sessionId: number): Promise<ShiftReport> {
  const db = await getDb();
  const sessions = await db.select<ShiftSession[]>(
    `SELECT cs.id, cs.status, cs.opened_at, cs.closed_at, u.display_name AS user_name,
            cs.expected_cash, cs.declared_cash, cs.cash_difference
     FROM cash_sessions cs
     LEFT JOIN users u ON u.id = cs.user_id
     WHERE cs.id = $1`,
    [sessionId],
  );
  const session = sessions[0];
  if (!session) throw new Error("No se encontró el turno.");

  const [byPayment, voided, items, movements, debt, accounts, map] = await Promise.all([
    db.select<SalesByPaymentRow[]>(
      `SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
       FROM sales WHERE cash_session_id = $1 AND voided = 0
       GROUP BY payment_method ORDER BY total DESC`,
      [sessionId],
    ),
    db.select<{ count: number; total: number }[]>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
       FROM sales WHERE cash_session_id = $1 AND voided = 1`,
      [sessionId],
    ),
    db.select<ShiftItem[]>(
      `SELECT si.name AS name, SUM(si.qty) AS qty, COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.cash_session_id = $1 AND s.voided = 0
       GROUP BY si.name ORDER BY total DESC`,
      [sessionId],
    ),
    listCashMovements(sessionId),
    db.select<{ count: number; total: number }[]>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
       FROM customer_payments
       WHERE payment_method = 'efectivo'
         AND created_at >= $1
         AND created_at <= COALESCE($2, datetime('now', 'localtime'))`,
      [session.opened_at, session.closed_at],
    ),
    listTreasuryAccounts(),
    getMethodMap(),
  ]);

  const count = byPayment.reduce((a, r) => a + r.count, 0);
  const total = roundMoney(byPayment.reduce((a, r) => a + r.total, 0));
  const cashSales = roundMoney(
    byPayment.filter((r) => r.payment_method === "efectivo").reduce((a, r) => a + r.total, 0),
  );
  let opening = 0;
  let income = 0;
  let expense = 0;
  for (const m of movements) {
    if (m.type === "income") {
      income += m.amount;
      if (m.concept === OPENING_CONCEPT) opening += m.amount;
    } else {
      expense += m.amount;
    }
  }
  const liveExpected = roundMoney(cashSales + income - expense);

  return {
    session,
    count,
    total,
    avgTicket: count > 0 ? roundMoney(total / count) : 0,
    voidedCount: voided[0]?.count ?? 0,
    voidedTotal: roundMoney(voided[0]?.total ?? 0),
    inflow: buildMoneyInflow(byPayment, [], map, accounts),
    cash: {
      opening: roundMoney(opening),
      cashSales,
      otherIncome: roundMoney(income - opening),
      expense: roundMoney(expense),
      expected: session.status === "closed" && session.expected_cash != null ? session.expected_cash : liveExpected,
    },
    debtCash: roundMoney(debt[0]?.total ?? 0),
    debtCashCount: debt[0]?.count ?? 0,
    movements: [...movements].reverse(),
    items,
  };
}

export async function listClosedShifts(limit = 30): Promise<ShiftListRow[]> {
  const db = await getDb();
  const sessions = await db.select<Omit<ShiftListRow, "count" | "total">[]>(
    `SELECT cs.id, cs.opened_at, cs.closed_at, u.display_name AS user_name, cs.cash_difference
     FROM cash_sessions cs
     LEFT JOIN users u ON u.id = cs.user_id
     WHERE cs.status = 'closed'
     ORDER BY cs.id DESC
     LIMIT $1`,
    [limit],
  );
  if (sessions.length === 0) return [];
  const ids = sessions.map((s) => s.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const totals = await db.select<{ cash_session_id: number; count: number; total: number }[]>(
    `SELECT cash_session_id, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
     FROM sales WHERE voided = 0 AND cash_session_id IN (${placeholders})
     GROUP BY cash_session_id`,
    ids,
  );
  const byId = new Map(totals.map((t) => [t.cash_session_id, t]));
  return sessions.map((s) => ({
    ...s,
    count: byId.get(s.id)?.count ?? 0,
    total: roundMoney(byId.get(s.id)?.total ?? 0),
  }));
}

export function shiftTimeLabel(s: ShiftSession | ShiftListRow): string {
  const fmt = (raw: string) => {
    const d = new Date(raw.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };
  const hour = (raw: string) => {
    const d = new Date(raw.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  };
  if (!s.closed_at) return `Desde ${fmt(s.opened_at)}`;
  const sameDay = s.opened_at.slice(0, 10) === s.closed_at.slice(0, 10);
  return `${fmt(s.opened_at)} a ${sameDay ? hour(s.closed_at) : fmt(s.closed_at)}`;
}

export function differenceLabel(diff: number, currency: string): string {
  if (Math.abs(diff) < 0.01) return "Justo, no sobra ni falta";
  return diff > 0 ? `Sobran ${formatMoney(diff, currency)}` : `Faltan ${formatMoney(-diff, currency)}`;
}

function arqueo(r: ShiftReport): { declared: number; diff: number } | null {
  if (r.session.declared_cash == null) return null;
  const diff = r.session.cash_difference ?? r.session.declared_cash - r.cash.expected;
  return { declared: r.session.declared_cash, diff };
}

export function buildShiftMessage(
  businessName: string,
  currency: string,
  r: ShiftReport,
  showArqueo: boolean,
): string {
  const money = (n: number) => formatMoney(n, currency);
  const lines = [
    `Cierre de caja - ${businessName}`,
    `Turno #${r.session.id} · ${shiftTimeLabel(r.session)}`,
  ];
  if (r.session.user_name) lines.push(`Abrió: ${r.session.user_name}`);
  lines.push("", `Ventas: ${r.count}`, `Total vendido: ${money(r.total)}`);
  if (r.voidedCount > 0) lines.push(`Anuladas: ${r.voidedCount} (${money(r.voidedTotal)})`);

  if (r.inflow.places.length > 0) {
    lines.push("", "Donde entro la plata:");
    for (const p of r.inflow.places) {
      const detail = p.lines.map((l) => `${l.label} ${money(l.total)}`).join(", ");
      const single = p.lines.length === 1 && p.lines[0].label === p.label;
      lines.push(`- ${p.label}: ${money(p.total)}${single ? "" : ` (${detail})`}`);
    }
  }
  if (r.inflow.onAccount > 0) lines.push(`Quedo a cuenta (fiado): ${money(r.inflow.onAccount)}`);

  lines.push("", "Efectivo del cajon:");
  if (r.cash.opening > 0) lines.push(`- Apertura: ${money(r.cash.opening)}`);
  lines.push(`- Ventas en efectivo: ${money(r.cash.cashSales)}`);
  if (r.cash.otherIncome > 0) lines.push(`- Ingresos: ${money(r.cash.otherIncome)}`);
  if (r.cash.expense > 0) lines.push(`- Egresos: ${money(r.cash.expense)}`);
  const a = arqueo(r);
  if (showArqueo) {
    lines.push(`- Deberia haber: ${money(r.cash.expected)}`);
    if (a) lines.push(`- Contado: ${money(a.declared)}`, `- ${differenceLabel(a.diff, currency)}`);
  } else if (a) {
    lines.push(`- Contado: ${money(a.declared)}`);
  }
  if (r.debtCash > 0) {
    lines.push(`Cobros de fiado en efectivo en el horario: ${money(r.debtCash)}`);
  }

  lines.push("", "Walqo - Waltech");
  return lines.join("\n");
}

export function shiftPrintReport(currency: string, r: ShiftReport, showArqueo: boolean): PrintableReport {
  const money = (n: number) => formatMoney(n, currency);
  const a = arqueo(r);
  const cashRows: string[][] = [];
  if (r.cash.opening > 0) cashRows.push(["Apertura", money(r.cash.opening)]);
  cashRows.push(["Ventas en efectivo", money(r.cash.cashSales)]);
  if (r.cash.otherIncome > 0) cashRows.push(["Ingresos", money(r.cash.otherIncome)]);
  if (r.cash.expense > 0) cashRows.push(["Egresos", `− ${money(r.cash.expense)}`]);
  if (showArqueo) cashRows.push(["Debería haber", money(r.cash.expected)]);
  if (a) cashRows.push(["Contado", money(a.declared)]);
  if (showArqueo && a) cashRows.push(["Diferencia", differenceLabel(a.diff, currency)]);

  const notes: string[] = [];
  if (r.debtCash > 0) {
    notes.push(
      `En el horario del turno se cobraron ${money(r.debtCash)} de fiado en efectivo. No están en «Debería haber»: si están en el cajón, explican la diferencia.`,
    );
  }

  return {
    title: `Cierre de caja · Turno #${r.session.id}`,
    subtitle: `${shiftTimeLabel(r.session)}${r.session.user_name ? ` · Abrió ${r.session.user_name}` : ""}`,
    summary: [
      { label: "Ventas", value: String(r.count) },
      { label: "Ticket promedio", value: money(r.avgTicket) },
      ...(r.voidedCount > 0
        ? [{ label: "Anuladas", value: `${r.voidedCount} (${money(r.voidedTotal)})` }]
        : []),
      ...(r.inflow.onAccount > 0 ? [{ label: "Quedó a cuenta (fiado)", value: money(r.inflow.onAccount) }] : []),
      { label: "Total vendido", value: money(r.total), grand: true },
    ],
    tables: [
      inflowPrintTable(r.inflow, currency),
      { heading: "Efectivo del cajón", columns: [{ label: "Concepto" }, { label: "Monto", num: true }], rows: cashRows },
      ...(r.movements.length > 0
        ? [
            {
              heading: "Ingresos y egresos del turno",
              columns: [{ label: "Hora" }, { label: "Concepto" }, { label: "Monto", num: true }],
              rows: r.movements.map((m) => [
                m.created_at.slice(11, 16),
                m.concept,
                `${m.type === "income" ? "+" : "−"} ${money(m.amount)}`,
              ]),
            },
          ]
        : []),
      {
        heading: "Lo que se vendió",
        columns: [{ label: "Producto" }, { label: "Cant.", num: true }, { label: "Total", num: true }],
        rows: r.items.map((i) => [i.name, String(Math.round(i.qty * 1000) / 1000), money(i.total)]),
      },
    ],
    notes,
  };
}
