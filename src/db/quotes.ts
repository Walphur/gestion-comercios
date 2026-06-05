import type { Quote, QuoteItem, QuoteStatus } from "../types";
import { syncCashSessionStorage } from "./cash";
import { recordSale, type SaleItemInput } from "./sales";
import { notifyWorkshopSync } from "../lib/workshopSync";
import { getDb } from "./index";

export interface QuoteItemInput {
  product_id: number | null;
  variant_id: number | null;
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
}

export interface QuoteInput {
  customer_id: number | null;
  vehicle_id?: number | null;
  appointment_id?: number | null;
  discount_pct: number;
  notes?: string | null;
  valid_until?: string | null;
  items: QuoteItemInput[];
  user_id?: number | null;
}

const QUOTE_SELECT = `q.*,
            c.name AS customer_name,
            u.display_name AS seller_name,
            v.plate AS vehicle_plate,
            v.brand AS vehicle_brand,
            v.model AS vehicle_model`;

const QUOTE_FROM = `FROM quotes q
     LEFT JOIN customers c ON c.id = q.customer_id
     LEFT JOIN users u ON u.id = q.user_id
     LEFT JOIN vehicles v ON v.id = q.vehicle_id`;

function lineTotal(qty: number, unitPrice: number, discountPct: number): number {
  return qty * unitPrice * (1 - discountPct / 100);
}

function calcTotals(items: QuoteItemInput[], discountPct: number) {
  const subtotal = items.reduce((a, i) => a + i.line_total, 0);
  const total = subtotal * (1 - discountPct / 100);
  return { subtotal, total };
}

async function nextQuoteNumber(): Promise<string> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM quotes");
  const seq = (rows[0]?.n ?? 0) + 1;
  const year = new Date().getFullYear();
  return `P-${year}-${String(seq).padStart(4, "0")}`;
}

export async function listQuotes(limit = 200): Promise<Quote[]> {
  const db = await getDb();
  return db.select<Quote[]>(
    `SELECT ${QUOTE_SELECT}
     ${QUOTE_FROM}
     ORDER BY q.id DESC
     LIMIT $1`,
    [limit],
  );
}

export async function getQuote(id: number): Promise<Quote | null> {
  const db = await getDb();
  const rows = await db.select<Quote[]>(
    `SELECT ${QUOTE_SELECT}
     ${QUOTE_FROM}
     WHERE q.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getQuoteItems(quoteId: number): Promise<QuoteItem[]> {
  const db = await getDb();
  return db.select<QuoteItem[]>(
    `SELECT * FROM quote_items WHERE quote_id = $1 ORDER BY sort_order, id`,
    [quoteId],
  );
}

export async function createQuote(input: QuoteInput): Promise<number> {
  if (input.items.length === 0) throw new Error("Agregá al menos un ítem al presupuesto.");
  const db = await getDb();
  const number = await nextQuoteNumber();
  const { subtotal, total } = calcTotals(input.items, input.discount_pct);
  const res = await db.execute(
    `INSERT INTO quotes
       (quote_number, customer_id, vehicle_id, appointment_id, status, subtotal, discount_pct, total, notes, valid_until, user_id)
     VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10)`,
    [
      number,
      input.customer_id,
      input.vehicle_id ?? null,
      input.appointment_id ?? null,
      subtotal,
      input.discount_pct,
      total,
      input.notes?.trim() || null,
      input.valid_until || null,
      input.user_id ?? null,
    ],
  );
  const quoteId = res.lastInsertId as number;
  await replaceQuoteItems(quoteId, input.items);
  void notifyWorkshopSync("quote", quoteId);
  return quoteId;
}

export async function updateQuote(id: number, input: QuoteInput): Promise<void> {
  const q = await getQuote(id);
  if (!q) throw new Error("Presupuesto no encontrado.");
  if (q.status !== "draft" && q.status !== "sent") {
    throw new Error("Solo se puede editar un presupuesto en borrador o enviado.");
  }
  if (input.items.length === 0) throw new Error("Agregá al menos un ítem.");
  const db = await getDb();
  const { subtotal, total } = calcTotals(input.items, input.discount_pct);
  await db.execute(
    `UPDATE quotes SET
       customer_id=$1, vehicle_id=$2, appointment_id=$3,
       subtotal=$4, discount_pct=$5, total=$6,
       notes=$7, valid_until=$8,
       updated_at=datetime('now','localtime')
     WHERE id=$9`,
    [
      input.customer_id,
      input.vehicle_id ?? null,
      input.appointment_id ?? null,
      subtotal,
      input.discount_pct,
      total,
      input.notes?.trim() || null,
      input.valid_until || null,
      id,
    ],
  );
  await replaceQuoteItems(id, input.items);
  void notifyWorkshopSync("quote", id);
}

async function replaceQuoteItems(quoteId: number, items: QuoteItemInput[]): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM quote_items WHERE quote_id = $1", [quoteId]);
  let order = 0;
  for (const it of items) {
    await db.execute(
      `INSERT INTO quote_items
         (quote_id, product_id, variant_id, name, qty, unit_price, discount_pct, line_total, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        quoteId,
        it.product_id,
        it.variant_id,
        it.name,
        it.qty,
        it.unit_price,
        it.discount_pct,
        it.line_total,
        order++,
      ],
    );
  }
}

export async function setQuoteStatus(id: number, status: QuoteStatus): Promise<void> {
  const q = await getQuote(id);
  if (!q) throw new Error("Presupuesto no encontrado.");
  if (q.status === "converted") throw new Error("Este presupuesto ya se convirtió en venta.");
  const db = await getDb();
  await db.execute(
    `UPDATE quotes SET status=$1, updated_at=datetime('now','localtime') WHERE id=$2`,
    [status, id],
  );
  void notifyWorkshopSync("quote", id);
}

export async function deleteQuote(id: number): Promise<void> {
  const q = await getQuote(id);
  if (!q) return;
  if (q.status !== "draft" && q.status !== "rejected") {
    throw new Error("Solo se pueden eliminar borradores o rechazados.");
  }
  const db = await getDb();
  await db.execute("DELETE FROM quotes WHERE id = $1", [id]);
}

export interface ConvertQuoteInput {
  payment_method: string;
  paid: number | null;
  user_id: number | null;
}

/** Convierte presupuesto aprobado o enviado en venta y descuenta stock. */
export async function convertQuoteToSale(
  quoteId: number,
  input: ConvertQuoteInput,
): Promise<number> {
  const q = await getQuote(quoteId);
  if (!q) throw new Error("Presupuesto no encontrado.");
  if (q.status === "converted") throw new Error("Ya fue convertido en venta.");
  if (q.status === "rejected") throw new Error("El presupuesto fue rechazado.");
  if (q.status === "draft") {
    throw new Error("Marcá el presupuesto como enviado o aprobado antes de cobrar.");
  }

  const cashSessionId = await syncCashSessionStorage();
  if (cashSessionId == null) {
    throw new Error("Abrí el turno de caja antes de convertir a venta.");
  }

  const items = await getQuoteItems(quoteId);
  if (items.length === 0) throw new Error("El presupuesto no tiene ítems.");

  const saleItems: SaleItemInput[] = items.map((it) => ({
    product_id: it.product_id,
    variant_id: it.variant_id,
    name: it.name,
    qty: it.qty,
    unit_price: it.unit_price,
    discount_pct: it.discount_pct,
    line_total: it.line_total,
    stock_qty: it.qty,
  }));

  const paid = input.paid;
  const change =
    paid != null && paid >= q.total ? paid - q.total : paid != null ? paid - q.total : null;

  const saleId = await recordSale({
    subtotal: q.subtotal,
    discount_pct: q.discount_pct,
    total: q.total,
    payment_method: input.payment_method,
    paid,
    change_due: change,
    user_id: input.user_id,
    cash_session_id: cashSessionId,
    customer_id: q.customer_id,
    items: saleItems,
  });

  const db = await getDb();
  await db.execute(
    `UPDATE quotes SET status='converted', sale_id=$1, updated_at=datetime('now','localtime') WHERE id=$2`,
    [saleId, quoteId],
  );

  return saleId;
}

/** Helper para armar ítems desde el editor. */
export function buildQuoteItem(
  name: string,
  qty: number,
  unitPrice: number,
  discountPct: number,
  productId: number | null = null,
  variantId: number | null = null,
): QuoteItemInput {
  return {
    product_id: productId,
    variant_id: variantId,
    name,
    qty,
    unit_price: unitPrice,
    discount_pct: discountPct,
    line_total: lineTotal(qty, unitPrice, discountPct),
  };
}
