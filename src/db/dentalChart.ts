import { getDb } from "./index";

/** Cuadrantes FDI de adulto, como los ve quien atiende. */
export const ADULT_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11] as const;
export const ADULT_UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28] as const;
export const ADULT_LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38] as const;
export const ADULT_LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41] as const;

export type DentalStatus = "arreglado" | "a_tratar" | "extraido";

const STATUSES = new Set<DentalStatus>(["arreglado", "a_tratar", "extraido"]);

const ADULT_TEETH = new Set<number>([
  ...ADULT_UPPER_RIGHT,
  ...ADULT_UPPER_LEFT,
  ...ADULT_LOWER_LEFT,
  ...ADULT_LOWER_RIGHT,
]);

export function isAdultTooth(tooth: number): boolean {
  return ADULT_TEETH.has(tooth);
}

export function nextDentalStatus(current: DentalStatus | null): DentalStatus | null {
  if (current === null) return "arreglado";
  if (current === "arreglado") return "a_tratar";
  if (current === "a_tratar") return "extraido";
  return null;
}

export async function listDentalMarks(
  customerId: number,
): Promise<Partial<Record<number, DentalStatus>>> {
  if (!Number.isInteger(customerId) || customerId <= 0) return {};
  const db = await getDb();
  const rows = await db.select<{ tooth: number; status: string }[]>(
    `SELECT tooth, status FROM dental_chart_marks WHERE customer_id = $1`,
    [customerId],
  );
  const marks: Partial<Record<number, DentalStatus>> = {};
  for (const row of rows) {
    if (!isAdultTooth(row.tooth)) continue;
    if (!STATUSES.has(row.status as DentalStatus)) continue;
    marks[row.tooth] = row.status as DentalStatus;
  }
  return marks;
}

/** `null` borra la marca: el diente queda sin marcar. */
export async function setDentalMark(
  customerId: number,
  tooth: number,
  status: DentalStatus | null,
): Promise<void> {
  if (!Number.isInteger(customerId) || customerId <= 0 || !isAdultTooth(tooth)) {
    throw new Error("No se pudo guardar la ficha.");
  }
  if (status !== null && !STATUSES.has(status)) {
    throw new Error("No se pudo guardar la ficha.");
  }
  const db = await getDb();
  const customer = await db.select<{ id: number }[]>(
    "SELECT id FROM customers WHERE id = $1",
    [customerId],
  );
  if (!customer.length) throw new Error("No se pudo guardar la ficha.");
  if (status === null) {
    await db.execute(
      "DELETE FROM dental_chart_marks WHERE customer_id = $1 AND tooth = $2",
      [customerId, tooth],
    );
    return;
  }
  await db.execute(
    `INSERT INTO dental_chart_marks (customer_id, tooth, status, updated_at)
     VALUES ($1, $2, $3, datetime('now','localtime'))
     ON CONFLICT(customer_id, tooth) DO UPDATE SET
       status = excluded.status,
       updated_at = datetime('now','localtime')`,
    [customerId, tooth, status],
  );
}
