import type { DeliveryNote, DeliveryNoteItem } from "../types";
import { deductStockForReference, restoreStockForReference } from "./stock";
import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

export interface DeliveryNoteItemInput {
  product_id: number | null;
  name: string;
  qty: number;
}

export interface DeliveryNoteInput {
  customer_id: number | null;
  destination?: string | null;
  notes?: string | null;
  items: DeliveryNoteItemInput[];
  user_id?: number | null;
}

async function nextNoteNumber(): Promise<string> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM delivery_notes");
  const seq = (rows[0]?.n ?? 0) + 1;
  return `R-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`;
}

export async function listDeliveryNotes(limit = 200): Promise<DeliveryNote[]> {
  const db = await getDb();
  return db.select<DeliveryNote[]>(
    `SELECT n.*,
            c.name AS customer_name,
            u.display_name AS seller_name,
            (SELECT COUNT(*) FROM delivery_note_items i WHERE i.note_id = n.id) AS item_count
     FROM delivery_notes n
     LEFT JOIN customers c ON c.id = n.customer_id
     LEFT JOIN users u ON u.id = n.user_id
     ORDER BY n.id DESC
     LIMIT $1`,
    [limit],
  );
}

export async function getDeliveryNote(id: number): Promise<DeliveryNote | null> {
  const db = await getDb();
  const rows = await db.select<DeliveryNote[]>(
    `SELECT n.*, c.name AS customer_name, u.display_name AS seller_name
     FROM delivery_notes n
     LEFT JOIN customers c ON c.id = n.customer_id
     LEFT JOIN users u ON u.id = n.user_id
     WHERE n.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getDeliveryNoteItems(noteId: number): Promise<DeliveryNoteItem[]> {
  const db = await getDb();
  return db.select<DeliveryNoteItem[]>(
    `SELECT * FROM delivery_note_items WHERE note_id = $1 ORDER BY sort_order, id`,
    [noteId],
  );
}

async function replaceItems(noteId: number, items: DeliveryNoteItemInput[]): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM delivery_note_items WHERE note_id = $1", [noteId]);
  let order = 0;
  for (const it of items) {
    await db.execute(
      `INSERT INTO delivery_note_items (note_id, product_id, name, qty, sort_order)
       VALUES ($1,$2,$3,$4,$5)`,
      [noteId, it.product_id, it.name.trim(), it.qty, order++],
    );
  }
}

export async function createDeliveryNote(input: DeliveryNoteInput): Promise<number> {
  if (input.items.length === 0) throw new Error("Agregá al menos un ítem al remito.");
  return withImmediateTransaction(async () => {
    const number = await nextNoteNumber();
    const db = await getDb();
    const res = await db.execute(
      `INSERT INTO delivery_notes (note_number, customer_id, destination, notes, user_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        number,
        input.customer_id,
        input.destination?.trim() || null,
        input.notes?.trim() || null,
        input.user_id ?? null,
      ],
    );
    const id = res.lastInsertId as number;
    await replaceItems(id, input.items);
    return id;
  });
}

export async function updateDeliveryNote(id: number, input: DeliveryNoteInput): Promise<void> {
  const note = await getDeliveryNote(id);
  if (!note) throw new Error("Remito no encontrado.");
  if (note.status !== "draft") throw new Error("Solo se puede editar un remito en borrador.");
  if (input.items.length === 0) throw new Error("Agregá al menos un ítem.");
  await withImmediateTransaction(async () => {
    const db = await getDb();
    await db.execute(
      `UPDATE delivery_notes SET customer_id=$1, destination=$2, notes=$3,
       updated_at=datetime('now','localtime') WHERE id=$4`,
      [input.customer_id, input.destination?.trim() || null, input.notes?.trim() || null, id],
    );
    await replaceItems(id, input.items);
  });
}

async function applyStock(noteId: number, userId: number | null): Promise<void> {
  const items = await getDeliveryNoteItems(noteId);
  for (const it of items) {
    if (it.product_id != null && it.qty > 0) {
      await deductStockForReference(
        it.product_id,
        it.qty,
        "remito",
        "delivery_note",
        noteId,
        userId,
      );
    }
  }
}

async function revertStock(noteId: number, userId: number | null): Promise<void> {
  const items = await getDeliveryNoteItems(noteId);
  for (const it of items) {
    if (it.product_id != null && it.qty > 0) {
      await restoreStockForReference(
        it.product_id,
        it.qty,
        "remito_void",
        "delivery_note_void",
        noteId,
        userId,
      );
    }
  }
}

export async function issueDeliveryNote(id: number, userId: number | null): Promise<void> {
  await withImmediateTransaction(async () => {
    const note = await getDeliveryNote(id);
    if (!note) throw new Error("Remito no encontrado.");
    if (note.status !== "draft") throw new Error("El remito ya fue emitido.");
    await applyStock(id, userId);
    const db = await getDb();
    await db.execute(
      `UPDATE delivery_notes SET status='issued', stock_applied=1,
       issued_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=$1`,
      [id],
    );
  });
}

export async function cancelDeliveryNote(id: number, userId: number | null): Promise<void> {
  await withImmediateTransaction(async () => {
    const note = await getDeliveryNote(id);
    if (!note) throw new Error("Remito no encontrado.");
    if (note.status === "cancelled") return;
    if (note.stock_applied) await revertStock(id, userId);
    const db = await getDb();
    await db.execute(
      `UPDATE delivery_notes SET status='cancelled', stock_applied=0,
       updated_at=datetime('now','localtime') WHERE id=$1`,
      [id],
    );
  });
}

export async function deleteDeliveryNote(id: number): Promise<void> {
  const note = await getDeliveryNote(id);
  if (!note) return;
  if (note.status !== "draft") throw new Error("Solo se pueden eliminar borradores.");
  const db = await getDb();
  await db.execute("DELETE FROM delivery_notes WHERE id = $1", [id]);
}
