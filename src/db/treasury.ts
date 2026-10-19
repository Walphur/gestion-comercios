import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";
import { getSetting, setSetting } from "./settings";
import { roundMoney } from "./supplierAccounts";
import { todayYmd } from "../lib/format";

type Db = Awaited<ReturnType<typeof getDb>>;

export type TreasuryAccountKind = "cajon" | "guardado" | "banco" | "mercadopago" | "otra";
export type TreasuryMovementType = "traslado" | "retiro" | "aporte" | "ajuste";

export interface TreasuryAccount {
  id: number;
  name: string;
  kind: TreasuryAccountKind;
  opening_balance: number;
  opening_date: string;
  active: number;
  sort: number;
  created_at: string;
}

export interface TreasuryMovement {
  id: number;
  type: TreasuryMovementType;
  from_account_id: number | null;
  to_account_id: number | null;
  from_name: string | null;
  to_name: string | null;
  amount: number;
  note: string;
  moved_at: string;
  cash_movement_id: number | null;
  user_name: string | null;
  voided: number;
}

/** De dónde sale el saldo del cajón. */
export type DrawerSource = "caja_abierta" | "caja_cerrada" | "inicial";

export interface AccountBalance {
  account: TreasuryAccount;
  balance: number;
  drawerSource?: DrawerSource;
}

/** Medios de pago que se pueden mandar a una cuenta (efectivo va siempre al cajón; fiado no entra). */
export const MAPPABLE_METHODS = [
  "transferencia",
  "debito",
  "credito",
  "payway",
  "qr",
  "mercadopago",
  "tarjeta",
  "otro",
] as const;

export type MappableMethod = (typeof MAPPABLE_METHODS)[number];
export type MethodMap = Record<MappableMethod, number | null>;

export const MAPPABLE_METHOD_LABELS: Record<MappableMethod, string> = {
  transferencia: "Transferencia",
  debito: "Débito",
  credito: "Crédito",
  payway: "Payway",
  qr: "QR",
  mercadopago: "Mercado Pago",
  tarjeta: "Tarjeta (gastos que pagás vos)",
  otro: "Otro medio",
};

export const ACCOUNT_KIND_LABELS: Record<TreasuryAccountKind, string> = {
  cajon: "Efectivo en el cajón",
  guardado: "Efectivo guardado",
  banco: "Banco",
  mercadopago: "Mercado Pago",
  otra: "Otra cuenta",
};

export const MOVEMENT_TYPE_LABELS: Record<TreasuryMovementType, string> = {
  traslado: "Traslado",
  retiro: "Retiro del dueño",
  aporte: "Aporte del dueño",
  ajuste: "Ajuste",
};

const METHOD_MAP_SETTING = "treasury_method_accounts";
export const TREASURY_STARTED_SETTING = "treasury_started";

const DEFAULT_ACCOUNTS: { name: string; kind: TreasuryAccountKind }[] = [
  { name: "Efectivo en el cajón", kind: "cajon" },
  { name: "Efectivo guardado", kind: "guardado" },
  { name: "Banco", kind: "banco" },
  { name: "Mercado Pago", kind: "mercadopago" },
];

const DEFAULT_METHOD_KIND: Record<MappableMethod, TreasuryAccountKind | null> = {
  transferencia: "banco",
  debito: "banco",
  credito: "banco",
  payway: "banco",
  qr: "mercadopago",
  mercadopago: "mercadopago",
  tarjeta: "banco",
  otro: null,
};

/** «débito» → «debito»; lo desconocido cae en «otro». Devuelve null para efectivo, efectivo_caja y fiado. */
export function normalizeMethod(raw: string | null | undefined): MappableMethod | null {
  const m = (raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (m === "efectivo" || m === "efectivo_caja" || m === "fiado" || m === "") return null;
  return (MAPPABLE_METHODS as readonly string[]).includes(m) ? (m as MappableMethod) : "otro";
}

export async function listTreasuryAccounts(includeInactive = false): Promise<TreasuryAccount[]> {
  const db = await getDb();
  return db.select<TreasuryAccount[]>(
    `SELECT * FROM treasury_accounts ${includeInactive ? "" : "WHERE active = 1"}
     ORDER BY CASE kind WHEN 'cajon' THEN 0 ELSE 1 END, sort, id`,
  );
}

/** La primera vez crea las cuatro cuentas y el reparto de medios de pago por defecto. */
export async function ensureDefaultTreasury(): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM treasury_accounts");
    if ((rows[0]?.n ?? 0) > 0) return;
    const idByKind: Partial<Record<TreasuryAccountKind, number>> = {};
    for (const [i, a] of DEFAULT_ACCOUNTS.entries()) {
      const res = await db.execute(
        "INSERT INTO treasury_accounts (name, kind, sort) VALUES ($1, $2, $3)",
        [a.name, a.kind, i],
      );
      idByKind[a.kind] = res.lastInsertId as number;
    }
    const map = {} as MethodMap;
    for (const m of MAPPABLE_METHODS) {
      const kind = DEFAULT_METHOD_KIND[m];
      map[m] = kind ? (idByKind[kind] ?? null) : null;
    }
    await db.execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [METHOD_MAP_SETTING, JSON.stringify(map)],
    );
  });
}

export async function getMethodMap(): Promise<MethodMap> {
  const raw = await getSetting(METHOD_MAP_SETTING);
  const map = {} as MethodMap;
  let parsed: Record<string, unknown> = {};
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }
  for (const m of MAPPABLE_METHODS) {
    const v = parsed[m];
    map[m] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return map;
}

export async function saveMethodMap(map: MethodMap): Promise<void> {
  await setSetting(METHOD_MAP_SETTING, JSON.stringify(map));
}

/** Fecha elegida → momento desde el que se cuenta: hoy = ahora; otro día = al empezar ese día. */
function openingDateSql(ymd: string): { sql: string; params: string[] } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Elegí la fecha de inicio.");
  if (ymd > todayYmd()) throw new Error("La fecha de inicio no puede ser futura.");
  if (ymd === todayYmd()) return { sql: "datetime('now','localtime')", params: [] };
  return { sql: "$X", params: [`${ymd} 00:00:00`] };
}

export async function saveTreasuryAccount(input: {
  id?: number | null;
  name: string;
  kind: TreasuryAccountKind;
  openingBalance: number;
  openingYmd: string;
}): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Poné un nombre para la cuenta.");
  if (!Number.isFinite(input.openingBalance)) throw new Error("Revisá el saldo.");
  const db = await getDb();
  const dup = await db.select<{ id: number }[]>(
    "SELECT id FROM treasury_accounts WHERE name = $1 COLLATE NOCASE AND id <> $2 AND active = 1",
    [name, input.id ?? 0],
  );
  if (dup[0]) throw new Error("Ya tenés una cuenta con ese nombre.");
  const od = openingDateSql(input.openingYmd);
  const balance = roundMoney(input.openingBalance);
  if (input.id) {
    const dateSql = od.sql.replace("$X", "$4");
    await db.execute(
      `UPDATE treasury_accounts SET name = $1, opening_balance = $2, opening_date = ${dateSql} WHERE id = $3`,
      [name, balance, input.id, ...od.params],
    );
  } else {
    if (input.kind === "cajon") throw new Error("El cajón ya existe: es uno solo.");
    const sortRows = await db.select<{ s: number }[]>("SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM treasury_accounts");
    const dateSql = od.sql.replace("$X", "$5");
    await db.execute(
      `INSERT INTO treasury_accounts (name, kind, opening_balance, sort, opening_date)
       VALUES ($1, $2, $3, $4, ${dateSql})`,
      [name, input.kind, balance, sortRows[0]?.s ?? 1, ...od.params],
    );
  }
}

/** Saldo inicial «desde ahora» de varias cuentas a la vez (pantalla de arranque). */
export async function setOpeningBalancesNow(values: { id: number; balance: number }[]): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    for (const v of values) {
      await db.execute(
        `UPDATE treasury_accounts SET opening_balance = $1, opening_date = datetime('now','localtime') WHERE id = $2`,
        [roundMoney(v.balance), v.id],
      );
    }
    await db.execute(
      `INSERT INTO settings (key, value) VALUES ($1, '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [TREASURY_STARTED_SETTING],
    );
  });
}

export async function setTreasuryAccountActive(id: number, active: boolean): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ kind: string }[]>("SELECT kind FROM treasury_accounts WHERE id = $1", [id]);
  if (rows[0]?.kind === "cajon") throw new Error("El cajón no se puede ocultar.");
  await db.execute("UPDATE treasury_accounts SET active = $1 WHERE id = $2", [active ? 1 : 0, id]);
}

async function openCashSessionRow(db: Db): Promise<{ id: number; opened_at: string } | null> {
  const rows = await db.select<{ id: number; opened_at: string }[]>(
    "SELECT id, opened_at FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1",
  );
  return rows[0] ?? null;
}

/**
 * El cajón sigue a la caja: con la caja abierta, lo que debería haber (como el arqueo, más los
 * cobros de fiado en efectivo de ese turno); con la caja cerrada, lo que se contó al cerrar.
 * Antes de usar la caja, el saldo inicial.
 */
async function drawerBalance(db: Db, account: TreasuryAccount): Promise<{ balance: number; source: DrawerSource }> {
  const open = await openCashSessionRow(db);
  if (open) {
    const rows = await db.select<{ sales: number; movs: number; fiado: number }[]>(
      `SELECT
         (SELECT COALESCE(SUM(total), 0) FROM sales
          WHERE cash_session_id = $1 AND voided = 0 AND payment_method = 'efectivo') AS sales,
         (SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0)
          FROM cash_movements WHERE cash_session_id = $1) AS movs,
         (SELECT COALESCE(SUM(amount), 0) FROM customer_payments
          WHERE payment_method = 'efectivo' AND created_at >= $2) AS fiado`,
      [open.id, open.opened_at],
    );
    const r = rows[0];
    return { balance: roundMoney((r?.sales ?? 0) + (r?.movs ?? 0) + (r?.fiado ?? 0)), source: "caja_abierta" };
  }
  const closed = await db.select<{ declared_cash: number }[]>(
    `SELECT declared_cash FROM cash_sessions
     WHERE status = 'closed' AND declared_cash IS NOT NULL AND closed_at >= $1
     ORDER BY closed_at DESC, id DESC LIMIT 1`,
    [account.opening_date],
  );
  if (closed[0]) return { balance: roundMoney(closed[0].declared_cash), source: "caja_cerrada" };
  return { balance: roundMoney(account.opening_balance), source: "inicial" };
}

interface MethodTotal {
  method: string;
  total: number;
}

function methodsFor(accountId: number, map: MethodMap): Set<MappableMethod> {
  return new Set(MAPPABLE_METHODS.filter((m) => map[m] === accountId));
}

function sumMapped(rows: MethodTotal[], methods: Set<MappableMethod>): number {
  let total = 0;
  for (const r of rows) {
    const m = normalizeMethod(r.method);
    if (m && methods.has(m)) total += r.total;
  }
  return total;
}

export interface AccountFlows {
  sales: number;
  customerPayments: number;
  expenses: number;
  supplierPayments: number;
  manualIn: number;
  manualOut: number;
}

/** Lo automático y lo manual de una cuenta (no cajón) entre `from` y `to` (datetime, `to` exclusivo o null). */
async function accountFlows(
  db: Db,
  accountId: number,
  map: MethodMap,
  from: string,
  to: string | null,
): Promise<AccountFlows> {
  const methods = methodsFor(accountId, map);
  const toSql = (col: string, idx: number) => (to ? ` AND ${col} < $${idx}` : "");
  const p = to ? [from, to] : [from];
  const [sales, cust, exp, sup, manual] = await Promise.all([
    methods.size
      ? db.select<MethodTotal[]>(
          `SELECT payment_method AS method, COALESCE(SUM(total), 0) AS total FROM sales
           WHERE voided = 0 AND created_at >= $1${toSql("created_at", 2)} GROUP BY payment_method`,
          p,
        )
      : Promise.resolve([]),
    methods.size
      ? db.select<MethodTotal[]>(
          `SELECT payment_method AS method, COALESCE(SUM(amount), 0) AS total FROM customer_payments
           WHERE created_at >= $1${toSql("created_at", 2)} GROUP BY payment_method`,
          p,
        )
      : Promise.resolve([]),
    methods.size
      ? db.select<MethodTotal[]>(
          `SELECT method, COALESCE(SUM(amount), 0) AS total FROM expenses
           WHERE voided = 0 AND created_at >= $1${toSql("created_at", 2)} GROUP BY method`,
          p,
        )
      : Promise.resolve([]),
    methods.size
      ? db.select<MethodTotal[]>(
          `SELECT payment_method AS method, COALESCE(SUM(-amount), 0) AS total FROM supplier_movements
           WHERE kind = 'payment' AND created_at >= $1${toSql("created_at", 2)} GROUP BY payment_method`,
          p,
        )
      : Promise.resolve([]),
    db.select<{ inn: number; out: number }[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN to_account_id = $${p.length + 1} THEN amount ELSE 0 END), 0) AS inn,
         COALESCE(SUM(CASE WHEN from_account_id = $${p.length + 1} THEN amount ELSE 0 END), 0) AS out
       FROM treasury_movements
       WHERE voided = 0 AND moved_at >= $1${toSql("moved_at", 2)}`,
      [...p, accountId],
    ),
  ]);
  return {
    sales: sumMapped(sales, methods),
    customerPayments: sumMapped(cust, methods),
    expenses: sumMapped(exp, methods),
    supplierPayments: sumMapped(sup, methods),
    manualIn: manual[0]?.inn ?? 0,
    manualOut: manual[0]?.out ?? 0,
  };
}

export function flowsNet(f: AccountFlows): number {
  return f.sales + f.customerPayments - f.expenses - f.supplierPayments + f.manualIn - f.manualOut;
}

export async function getAccountBalances(): Promise<AccountBalance[]> {
  const db = await getDb();
  const [accounts, map] = await Promise.all([listTreasuryAccounts(), getMethodMap()]);
  const out: AccountBalance[] = [];
  for (const account of accounts) {
    if (account.kind === "cajon") {
      const d = await drawerBalance(db, account);
      out.push({ account, balance: d.balance, drawerSource: d.source });
      continue;
    }
    const f = await accountFlows(db, account.id, map, account.opening_date, null);
    out.push({ account, balance: roundMoney(account.opening_balance + flowsNet(f)) });
  }
  return out;
}

export interface DrawerFlows {
  cashSales: number;
  cashCustomerPayments: number;
  cashIn: number;
  cashOut: number;
  closeDifference: number;
}

export interface PeriodSummary {
  drawer: DrawerFlows | null;
  accounts: { account: TreasuryAccount; flows: AccountFlows }[];
}

/** Qué entró y salió de cada cuenta entre dos días (YYYY-MM-DD, inclusive). */
export async function getPeriodSummary(fromYmd: string, toYmd: string): Promise<PeriodSummary> {
  const db = await getDb();
  const [accounts, map] = await Promise.all([listTreasuryAccounts(), getMethodMap()]);
  const from = `${fromYmd} 00:00:00`;
  const to = `${toYmd} 23:59:60`;
  let drawer: DrawerFlows | null = null;
  const list: PeriodSummary["accounts"] = [];
  for (const account of accounts) {
    if (account.kind === "cajon") {
      const rows = await db.select<DrawerFlows[]>(
        `SELECT
           (SELECT COALESCE(SUM(total), 0) FROM sales
            WHERE voided = 0 AND payment_method = 'efectivo' AND created_at >= $1 AND created_at < $2) AS cashSales,
           (SELECT COALESCE(SUM(amount), 0) FROM customer_payments
            WHERE payment_method = 'efectivo' AND created_at >= $1 AND created_at < $2) AS cashCustomerPayments,
           (SELECT COALESCE(SUM(amount), 0) FROM cash_movements
            WHERE type = 'income' AND concept <> 'Efectivo de apertura'
              AND created_at >= $1 AND created_at < $2) AS cashIn,
           (SELECT COALESCE(SUM(amount), 0) FROM cash_movements
            WHERE type = 'expense' AND created_at >= $1 AND created_at < $2) AS cashOut,
           (SELECT COALESCE(SUM(cash_difference), 0) FROM cash_sessions
            WHERE status = 'closed' AND closed_at >= $1 AND closed_at < $2) AS closeDifference`,
        [from, to],
      );
      drawer = rows[0] ?? null;
      continue;
    }
    const start = account.opening_date > from ? account.opening_date : from;
    list.push({ account, flows: await accountFlows(db, account.id, map, start, to) });
  }
  return { drawer, accounts: list };
}

export async function listTreasuryMovements(fromYmd: string, toYmd: string): Promise<TreasuryMovement[]> {
  const db = await getDb();
  return db.select<TreasuryMovement[]>(
    `SELECT m.*, fa.name AS from_name, ta.name AS to_name, u.display_name AS user_name
     FROM treasury_movements m
     LEFT JOIN treasury_accounts fa ON fa.id = m.from_account_id
     LEFT JOIN treasury_accounts ta ON ta.id = m.to_account_id
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.voided = 0 AND date(m.moved_at) BETWEEN $1 AND $2
     ORDER BY m.moved_at DESC, m.id DESC`,
    [fromYmd, toYmd],
  );
}

/** Suma de retiros del dueño entre dos días (informativo en Resultado). */
export async function getOwnerWithdrawals(fromYmd: string, toYmd: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM treasury_movements
     WHERE voided = 0 AND type = 'retiro' AND date(moved_at) BETWEEN $1 AND $2`,
    [fromYmd, toYmd],
  );
  return roundMoney(rows[0]?.total ?? 0);
}

async function accountById(db: Db, id: number | null): Promise<TreasuryAccount | null> {
  if (id == null) return null;
  const rows = await db.select<TreasuryAccount[]>("SELECT * FROM treasury_accounts WHERE id = $1", [id]);
  const a = rows[0];
  if (!a || !a.active) throw new Error("Esa cuenta ya no está disponible.");
  return a;
}

/**
 * Anota un traslado, retiro, aporte o ajuste. Si toca el cajón, también entra como
 * ingreso o egreso de la caja abierta, así el arqueo cierra (sin caja abierta no se puede).
 */
export async function createTreasuryMovement(input: {
  type: TreasuryMovementType;
  fromAccountId: number | null;
  toAccountId: number | null;
  amount: number;
  note: string;
  userId: number | null;
}): Promise<void> {
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw new Error("El monto tiene que ser mayor a cero.");
  const note = input.note.trim();

  await withImmediateTransaction(async () => {
    const db = await getDb();
    const from = await accountById(db, input.fromAccountId);
    const to = await accountById(db, input.toAccountId);
    if (input.type === "traslado") {
      if (!from || !to) throw new Error("Elegí de qué cuenta sale y a cuál va.");
      if (from.id === to.id) throw new Error("Elegí dos cuentas distintas.");
    }
    if (input.type === "retiro" && (!from || to)) throw new Error("Elegí de qué cuenta sale el retiro.");
    if (input.type === "aporte" && (!to || from)) throw new Error("Elegí a qué cuenta entra el aporte.");
    if (input.type === "ajuste") {
      if ((from ? 1 : 0) + (to ? 1 : 0) !== 1) throw new Error("Elegí la cuenta a ajustar.");
      if ((from ?? to)?.kind === "cajon") {
        throw new Error("El cajón se corrige contando la plata al cerrar la caja.");
      }
    }

    let cashMovementId: number | null = null;
    if (from?.kind === "cajon" || to?.kind === "cajon") {
      const open = await openCashSessionRow(db);
      if (!open) throw new Error("No hay caja abierta. Abrila desde Caja para sacar o poner efectivo en el cajón.");
      const outOfDrawer = from?.kind === "cajon";
      const concept =
        input.type === "retiro"
          ? "Retiro del dueño"
          : input.type === "aporte"
            ? "Aporte del dueño"
            : outOfDrawer
              ? `Pasé a ${to?.name ?? "otra cuenta"}`
              : `Traje de ${from?.name ?? "otra cuenta"}`;
      const res = await db.execute(
        `INSERT INTO cash_movements (cash_session_id, user_id, type, amount, concept)
         VALUES ($1, $2, $3, $4, $5)`,
        [open.id, input.userId, outOfDrawer ? "expense" : "income", amount, note ? `${concept} — ${note}` : concept],
      );
      cashMovementId = res.lastInsertId as number;
    }

    await db.execute(
      `INSERT INTO treasury_movements (type, from_account_id, to_account_id, amount, note, cash_movement_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [input.type, from?.id ?? null, to?.id ?? null, amount, note, cashMovementId, input.userId],
    );
  });
}

/**
 * Anula un movimiento a mano. Si pasó por una caja que sigue abierta, se saca también de la caja.
 * Si esa caja ya se cerró no se anula: se corrige anotando el movimiento al revés.
 */
export async function voidTreasuryMovement(id: number): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<{ voided: number; cash_movement_id: number | null }[]>(
      "SELECT voided, cash_movement_id FROM treasury_movements WHERE id = $1",
      [id],
    );
    const mv = rows[0];
    if (!mv) throw new Error("Ese movimiento ya no existe.");
    if (mv.voided) throw new Error("Ese movimiento ya estaba anulado.");
    if (mv.cash_movement_id != null) {
      const cash = await db.select<{ status: string }[]>(
        `SELECT cs.status FROM cash_movements m
         JOIN cash_sessions cs ON cs.id = m.cash_session_id
         WHERE m.id = $1`,
        [mv.cash_movement_id],
      );
      if (cash[0]?.status === "closed") {
        throw new Error("Esa caja ya se cerró. Para corregirlo, anotá el movimiento al revés.");
      }
      if (cash[0]) await db.execute("DELETE FROM cash_movements WHERE id = $1", [mv.cash_movement_id]);
    }
    await db.execute("UPDATE treasury_movements SET voided = 1 WHERE id = $1", [id]);
  });
}
