import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";
import { voidSaleWithinTransaction } from "./sales";
import { roundMoney } from "./supplierAccounts";

export interface ShiftDeletePreview {
  sessionId: number;
  /** Ventas vigentes del turno (las anuladas se borran igual, sin volver a tocar el stock). */
  saleCount: number;
  saleTotal: number;
  voidedCount: number;
  movementCount: number;
  /** Gastos, pagos a proveedores y movimientos de Tesorería que salieron del cajón de este turno. */
  linkedOutside: number;
  /** Si hay alguno, no se puede borrar. */
  blockers: string[];
}

type Db = Awaited<ReturnType<typeof getDb>>;

const FIADO_SQL = "lower(s.payment_method) IN ('fiado', 'cuenta_corriente')";

function listNames(names: string[]): string {
  const shown = names.slice(0, 4);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} y ${rest} más` : shown.join(", ");
}

async function readPreview(db: Db, sessionId: number): Promise<ShiftDeletePreview> {
  const sessions = await db.select<{ status: string }[]>(
    "SELECT status FROM cash_sessions WHERE id = $1",
    [sessionId],
  );
  const session = sessions[0];
  if (!session) throw new Error("Ese turno ya no existe.");

  const [sales, movements, invoiced, fiado, linked] = await Promise.all([
    db.select<{ voided: number; count: number; total: number }[]>(
      `SELECT voided, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
       FROM sales WHERE cash_session_id = $1 GROUP BY voided`,
      [sessionId],
    ),
    db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM cash_movements WHERE cash_session_id = $1", [sessionId]),
    db.select<{ id: number; doc_number: string | null }[]>(
      `SELECT s.id, s.doc_number FROM sales s
       WHERE s.cash_session_id = $1 AND (
         s.fiscal_status IN ('pending', 'completed')
         OR EXISTS (SELECT 1 FROM fiscal_documents fd WHERE fd.sale_id = s.id)
         OR EXISTS (SELECT 1 FROM sync_queue q
                    WHERE q.entity_type = 'fiscal_invoice' AND q.entity_id = s.id
                      AND q.status IN ('PENDING', 'PROCESSING'))
       )
       ORDER BY s.id`,
      [sessionId],
    ),
    db.select<{ name: string | null }[]>(
      `SELECT DISTINCT c.name AS name FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.cash_session_id = $1 AND (
         ${FIADO_SQL}
         OR EXISTS (SELECT 1 FROM customer_balance_movements m
                    WHERE m.reference_type = 'sale' AND m.reference_id = s.id
                      AND m.customer_id = s.customer_id)
       )`,
      [sessionId],
    ),
    db.select<{ n: number }[]>(
      `SELECT
         (SELECT COUNT(*) FROM expenses WHERE voided = 0 AND cash_movement_id IN (SELECT id FROM cash_movements WHERE cash_session_id = $1))
       + (SELECT COUNT(*) FROM supplier_movements WHERE cash_movement_id IN (SELECT id FROM cash_movements WHERE cash_session_id = $1))
       + (SELECT COUNT(*) FROM treasury_movements WHERE voided = 0 AND cash_movement_id IN (SELECT id FROM cash_movements WHERE cash_session_id = $1))
       AS n`,
      [sessionId],
    ),
  ]);

  const active = sales.find((r) => !r.voided);
  const voided = sales.find((r) => r.voided);
  const blockers: string[] = [];
  if (session.status !== "closed") {
    blockers.push("El turno está abierto. Cerralo antes de borrarlo.");
  }
  if (invoiced.length > 0) {
    const docs = invoiced.map((s) => s.doc_number || `#${s.id}`);
    blockers.push(
      `Tiene ${invoiced.length === 1 ? "una venta" : `${invoiced.length} ventas`} con factura electrónica (${listNames(docs)}). Lo facturado no se borra.`,
    );
  }
  if (fiado.length > 0) {
    const names = fiado.map((r) => r.name?.trim() || "sin nombre");
    blockers.push(
      `Tiene ventas a fiado de ${listNames(names)}. La cuenta corriente guarda cada movimiento y no se borra.`,
    );
  }

  return {
    sessionId,
    saleCount: active?.count ?? 0,
    saleTotal: roundMoney(active?.total ?? 0),
    voidedCount: voided?.count ?? 0,
    movementCount: movements[0]?.n ?? 0,
    linkedOutside: linked[0]?.n ?? 0,
    blockers,
  };
}

export async function loadShiftDeletePreview(sessionId: number): Promise<ShiftDeletePreview> {
  return readPreview(await getDb(), sessionId);
}

/**
 * Saca las ventas de la cola LAN que todavía no salieron y, con la sincronización prendida,
 * avisa a las otras cajas que las borren (así no vuelven desde allá).
 */
async function dropSalesFromLan(db: Db, sales: { id: number; sync_id: string | null }[]): Promise<void> {
  const ids = sales.map((s) => s.id);
  const syncIds = sales.map((s) => s.sync_id).filter((s): s is string => Boolean(s));
  const keys = [...syncIds, ...ids.map((id) => `pending-sale-${id}`)];
  const idPh = ids.map((_, i) => `$${i + 1}`).join(",");
  const keyPh = keys.map((_, i) => `$${ids.length + i + 1}`).join(",");
  await db.execute(
    `DELETE FROM lan_sync_outbox
     WHERE entity_type = 'sale' AND status IN ('pending', 'sending', 'failed')
       AND (entity_local_id IN (${idPh}) OR entity_sync_id IN (${keyPh}))`,
    [...ids, ...keys],
  );

  const enabled = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = 'lan_sync_enabled' LIMIT 1",
  );
  if (enabled[0]?.value !== "1") return;
  for (const s of sales) {
    if (!s.sync_id || s.sync_id.startsWith("pending-")) continue;
    await db.execute(
      `INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, op, payload, origin_device, lamport)
       VALUES (
         lower(hex(randomblob(16))), 'sale', $1, 'delete', $2,
         COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
         COALESCE((SELECT CAST(value AS INTEGER) + 1 FROM settings WHERE key = 'lan_sync_lamport'), 1)
       )`,
      [s.sync_id, JSON.stringify({ reason: "cash_session_deleted" })],
    );
    await db.execute(
      `UPDATE settings
       SET value = CAST(COALESCE((SELECT CAST(value AS INTEGER) + 1 FROM settings WHERE key = 'lan_sync_lamport'), 1) AS TEXT)
       WHERE key = 'lan_sync_lamport'`,
    );
  }
}

/**
 * Borra un turno cerrado de esta caja con sus ventas (devolviendo el stock como al anular),
 * sus ingresos y egresos y el arqueo. Todo en una transacción. No borra lo facturado ni lo fiado.
 */
export async function deleteClosedCashSession(
  sessionId: number,
  userId: number,
): Promise<ShiftDeletePreview> {
  return withImmediateTransaction(async () => {
    const db = await getDb();
    const preview = await readPreview(db, sessionId);
    if (preview.blockers.length > 0) throw new Error(`No se puede borrar el turno. ${preview.blockers.join(" ")}`);

    const sales = await db.select<{ id: number; voided: number; sync_id: string | null }[]>(
      "SELECT id, voided, sync_id FROM sales WHERE cash_session_id = $1 ORDER BY id",
      [sessionId],
    );
    for (const s of sales) {
      if (!s.voided) await voidSaleWithinTransaction(s.id, userId);
    }

    if (sales.length > 0) {
      const ids = sales.map((s) => s.id);
      const ph = ids.map((_, i) => `$${i + 1}`).join(",");
      await db.execute(
        `UPDATE quotes SET status = 'approved', sale_id = NULL, updated_at = datetime('now','localtime')
         WHERE sale_id IN (${ph})`,
        ids,
      );
      await db.execute(
        `UPDATE service_orders
         SET status = CASE WHEN status = 'delivered' THEN 'ready' ELSE status END,
             sale_id = NULL, updated_at = datetime('now','localtime')
         WHERE sale_id IN (${ph})`,
        ids,
      );
      await db.execute(`UPDATE table_orders SET sale_id = NULL WHERE sale_id IN (${ph})`, ids);
      await db.execute(
        `DELETE FROM sync_queue WHERE entity_type = 'fiscal_invoice' AND entity_id IN (${ph})`,
        ids,
      );
      await dropSalesFromLan(db, sales);
      await db.execute(`DELETE FROM sale_items WHERE sale_id IN (${ph})`, ids);
      await db.execute(`DELETE FROM sales WHERE id IN (${ph})`, ids);
    }

    const ofSession = "SELECT id FROM cash_movements WHERE cash_session_id = $1";
    await db.execute(`UPDATE expenses SET cash_movement_id = NULL WHERE cash_movement_id IN (${ofSession})`, [sessionId]);
    await db.execute(`UPDATE supplier_movements SET cash_movement_id = NULL WHERE cash_movement_id IN (${ofSession})`, [
      sessionId,
    ]);
    await db.execute(`UPDATE treasury_movements SET cash_movement_id = NULL WHERE cash_movement_id IN (${ofSession})`, [
      sessionId,
    ]);
    await db.execute("DELETE FROM cash_movements WHERE cash_session_id = $1", [sessionId]);
    await db.execute("DELETE FROM cash_sessions WHERE id = $1", [sessionId]);

    const details = [`ventas=${preview.saleCount}`, `total=${preview.saleTotal}`];
    if (preview.voidedCount > 0) details.push(`anuladas=${preview.voidedCount}`);
    await db.execute(
      `INSERT INTO action_log (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'cash_session_deleted', 'cash_session', $2, $3)`,
      [userId, sessionId, details.join(", ")],
    );
    return preview;
  });
}
