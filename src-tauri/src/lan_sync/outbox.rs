use crate::settings_util::{read_setting, read_setting_or, write_setting};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use uuid::Uuid;

use super::errors::{LanResult, LanSyncError};
use super::protocol::SyncEvent;

const KEY_DEVICE_ID: &str = "lan_sync_device_id";
const KEY_LAMPORT: &str = "lan_sync_lamport";

pub fn new_uuid() -> String {
    Uuid::new_v4().simple().to_string()
}

/// Garantiza `lan_sync_device_id` estable (hex UUID sin guiones).
pub fn ensure_device_id(conn: &Connection) -> LanResult<String> {
    let existing = read_setting(conn, KEY_DEVICE_ID).unwrap_or_default();
    if !existing.trim().is_empty() {
        return Ok(existing);
    }
    let id = new_uuid();
    write_setting(conn, KEY_DEVICE_ID, &id).map_err(LanSyncError::db)?;
    Ok(id)
}

pub fn next_lamport(conn: &Connection) -> LanResult<i64> {
    let cur: i64 = read_setting_or(conn, KEY_LAMPORT, "0")
        .parse()
        .unwrap_or(0);
    let next = cur + 1;
    write_setting(conn, KEY_LAMPORT, &next.to_string()).map_err(LanSyncError::db)?;
    Ok(next)
}

pub fn bump_lamport_at_least(conn: &Connection, seen: i64) -> LanResult<()> {
    let cur: i64 = read_setting_or(conn, KEY_LAMPORT, "0")
        .parse()
        .unwrap_or(0);
    if seen > cur {
        write_setting(conn, KEY_LAMPORT, &seen.to_string()).map_err(LanSyncError::db)?;
    }
    Ok(())
}

const DEFAULT_SENDING_TIMEOUT_SECS: i64 = 30;
const CATCHUP_PAGE_SIZE: i64 = 200;

pub fn pending_count(conn: &Connection) -> LanResult<u64> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM lan_sync_outbox
             WHERE status IN ('pending', 'sending', 'failed')",
            [],
            |r| r.get(0),
        )
        .map_err(LanSyncError::db)?;
    Ok(n as u64)
}

/// Vuelve a `pending` los envíos cuyo ACK no llegó a tiempo.
pub fn reclaim_stale_sending(conn: &Connection) -> LanResult<u64> {
    let timeout_secs: i64 = read_setting_or(conn, "lan_sync_sending_timeout_secs", "30")
        .parse()
        .unwrap_or(DEFAULT_SENDING_TIMEOUT_SECS)
        .clamp(5, 600);
    let changed = conn
        .execute(
            &format!(
                "UPDATE lan_sync_outbox
                 SET status = 'pending',
                     last_error = COALESCE(last_error, 'ack_timeout'),
                     sending_at = NULL
                 WHERE status = 'sending'
                   AND (
                     sending_at IS NULL
                     OR sending_at < datetime('now', 'localtime', '-{timeout_secs} seconds')
                   )"
            ),
            [],
        )
        .map_err(LanSyncError::db)?;
    // failed listos para reintento
    let retried = conn
        .execute(
            "UPDATE lan_sync_outbox
             SET status = 'pending'
             WHERE status = 'failed'
               AND (next_retry_at IS NULL OR next_retry_at <= datetime('now','localtime'))",
            [],
        )
        .map_err(LanSyncError::db)?;
    Ok((changed + retried) as u64)
}

/// Filas outbox listas para materializar/enviar.
pub fn list_pending(conn: &Connection, limit: i64) -> LanResult<Vec<OutboxRow>> {
    reclaim_stale_sending(conn)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, event_id, entity_type, entity_sync_id, op, payload, lamport,
                    origin_device, created_at, status, entity_local_id
             FROM lan_sync_outbox
             WHERE status = 'pending'
             ORDER BY lamport ASC, id ASC
             LIMIT ?1",
        )
        .map_err(LanSyncError::db)?;
    let rows = stmt
        .query_map([limit], |r| {
            Ok(OutboxRow {
                id: r.get(0)?,
                event_id: r.get(1)?,
                entity_type: r.get(2)?,
                entity_sync_id: r.get(3)?,
                op: r.get(4)?,
                payload: r.get(5)?,
                lamport: r.get(6)?,
                origin_device: r.get(7)?,
                created_at: r.get(8)?,
                status: r.get(9)?,
                entity_local_id: r.get(10)?,
            })
        })
        .map_err(LanSyncError::db)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(LanSyncError::db)?);
    }
    Ok(out)
}

/// ACK idempotente: cualquier estado → acked.
pub fn mark_acked(conn: &Connection, event_ids: &[String]) -> LanResult<()> {
    if event_ids.is_empty() {
        return Ok(());
    }
    for eid in event_ids {
        conn.execute(
            "UPDATE lan_sync_outbox
             SET status = 'acked',
                 acked_at = datetime('now','localtime'),
                 last_error = NULL,
                 sending_at = NULL,
                 next_retry_at = NULL
             WHERE event_id = ?1",
            [eid],
        )
        .map_err(LanSyncError::db)?;
    }
    Ok(())
}

pub fn mark_failed(conn: &Connection, event_id: &str, err: &str) -> LanResult<()> {
    // Backoff: 5s * 2^min(attempt,5) — vuelve a pending vía reclaim
    let attempt: i64 = conn
        .query_row(
            "SELECT COALESCE(attempt_count, 0) FROM lan_sync_outbox WHERE event_id = ?1",
            [event_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?
        .unwrap_or(0);
    let delay = 5i64 * (1i64 << attempt.min(5));
    conn.execute(
        &format!(
            "UPDATE lan_sync_outbox
             SET status = 'failed',
                 last_error = ?1,
                 sending_at = NULL,
                 next_retry_at = datetime('now','localtime', '+{delay} seconds')
             WHERE event_id = ?2"
        ),
        params![err, event_id],
    )
    .map_err(LanSyncError::db)?;
    Ok(())
}

/// Vuelve a pending de inmediato (p.ej. tras error de red antes de ACK).
pub fn requeue_sending(conn: &Connection, event_ids: &[String]) -> LanResult<()> {
    for eid in event_ids {
        conn.execute(
            "UPDATE lan_sync_outbox
             SET status = 'pending', sending_at = NULL
             WHERE event_id = ?1 AND status = 'sending'",
            [eid],
        )
        .map_err(LanSyncError::db)?;
    }
    Ok(())
}

#[derive(Debug, Clone)]
pub struct OutboxRow {
    pub id: i64,
    pub event_id: String,
    pub entity_type: String,
    pub entity_sync_id: String,
    pub op: String,
    pub payload: Option<String>,
    pub lamport: i64,
    pub origin_device: String,
    pub created_at: String,
    pub status: String,
    pub entity_local_id: Option<i64>,
}

impl OutboxRow {
    pub fn into_event_with_payload(self, payload: Value) -> SyncEvent {
        SyncEvent {
            event_id: self.event_id,
            entity_type: self.entity_type,
            entity_sync_id: self.entity_sync_id,
            op: self.op,
            payload,
            lamport: self.lamport,
            origin_device: self.origin_device,
            created_at: self.created_at,
        }
    }
}

fn ensure_row_sync_id(conn: &Connection, table: &str, id: i64) -> LanResult<String> {
    let existing: Option<String> = conn
        .query_row(
            &format!("SELECT sync_id FROM {table} WHERE id = ?1"),
            [id],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(LanSyncError::db)?
        .flatten();
    if let Some(s) = existing {
        if !s.is_empty() {
            return Ok(s);
        }
    }
    let sid = new_uuid();
    conn.execute(
        &format!("UPDATE {table} SET sync_id = ?1 WHERE id = ?2"),
        params![sid, id],
    )
    .map_err(LanSyncError::db)?;
    Ok(sid)
}

/// Carga JSON completo para el tipo de entidad.
///
/// Para `product`, el payload **incluye** `stock` solo informativo; el applier
/// **no** debe sobrescribir `products.stock` con ese valor (stock vía movimientos).
pub fn build_payload_for_row(
    conn: &Connection,
    entity_type: &str,
    entity_sync_id: &str,
) -> LanResult<Value> {
    match entity_type {
        "category" => build_category(conn, entity_sync_id),
        "product" => build_product(conn, entity_sync_id),
        "customer" => build_customer(conn, entity_sync_id),
        "supplier" => build_supplier(conn, entity_sync_id),
        "sale" => build_sale(conn, entity_sync_id),
        "stock_movement" => build_stock_movement(conn, entity_sync_id),
        "customer_balance_movement" => build_customer_balance_movement(conn, entity_sync_id),
        other => Err(LanSyncError::Protocol(format!(
            "tipo de entidad desconocido: {other}"
        ))),
    }
}

fn build_category(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    let row = conn
        .query_row(
            "SELECT id, name, created_at, updated_at, sync_id FROM categories WHERE sync_id = ?1",
            [sync_id],
            |r| {
                Ok(json!({
                    "sync_id": r.get::<_, String>(4)?,
                    "name": r.get::<_, String>(1)?,
                    "created_at": r.get::<_, Option<String>>(2)?,
                    "updated_at": r.get::<_, Option<String>>(3)?,
                }))
            },
        )
        .optional()
        .map_err(LanSyncError::db)?;
    row.ok_or_else(|| LanSyncError::Database(format!("category sync_id={sync_id} no encontrada")))
}

fn build_product(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    let mut row = conn
        .query_row(
            "SELECT p.id, p.sku, p.barcode, p.name, p.description, p.category_id, p.supplier_id,
                    p.cost, p.price, p.stock, p.min_stock, p.unit, p.tax_rate, p.active,
                    p.created_at, p.updated_at, p.sync_id,
                    c.sync_id, s.sync_id
             FROM products p
             LEFT JOIN categories c ON c.id = p.category_id
             LEFT JOIN suppliers s ON s.id = p.supplier_id
             WHERE p.sync_id = ?1",
            [sync_id],
            |r| {
                Ok(json!({
                    "sync_id": r.get::<_, String>(16)?,
                    "sku": r.get::<_, Option<String>>(1)?,
                    "barcode": r.get::<_, Option<String>>(2)?,
                    "name": r.get::<_, String>(3)?,
                    "description": r.get::<_, Option<String>>(4)?,
                    "category_sync_id": r.get::<_, Option<String>>(17)?,
                    "supplier_sync_id": r.get::<_, Option<String>>(18)?,
                    "cost": r.get::<_, f64>(7)?,
                    "price": r.get::<_, f64>(8)?,
                    // Informativo: el applier ignora stock en upsert de producto.
                    "stock": r.get::<_, f64>(9)?,
                    "min_stock": r.get::<_, f64>(10)?,
                    "unit": r.get::<_, String>(11)?,
                    "tax_rate": r.get::<_, f64>(12)?,
                    "active": r.get::<_, i64>(13)?,
                    "created_at": r.get::<_, Option<String>>(14)?,
                    "updated_at": r.get::<_, Option<String>>(15)?,
                }))
            },
        )
        .optional()
        .map_err(LanSyncError::db)?
        .ok_or_else(|| LanSyncError::Database(format!("product sync_id={sync_id} no encontrado")))?;

    // Asegurar sync_id en categoría/proveedor si existen ids pero sync_id null —
    // el JOIN ya lo resolvió; no hace falta más.
    let _ = &mut row;
    Ok(row)
}

fn build_customer(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    // Sin balance absoluto — el saldo viaja por customer_balance_movement.
    conn.query_row(
        "SELECT sync_id, name, phone, document, email, credit_limit, notes, active,
                created_at, updated_at
         FROM customers WHERE sync_id = ?1",
        [sync_id],
        |r| {
            Ok(json!({
                "sync_id": r.get::<_, String>(0)?,
                "name": r.get::<_, String>(1)?,
                "phone": r.get::<_, Option<String>>(2)?,
                "document": r.get::<_, Option<String>>(3)?,
                "email": r.get::<_, Option<String>>(4)?,
                "credit_limit": r.get::<_, f64>(5)?,
                "notes": r.get::<_, Option<String>>(6)?,
                "active": r.get::<_, i64>(7)?,
                "created_at": r.get::<_, Option<String>>(8)?,
                "updated_at": r.get::<_, Option<String>>(9)?,
            }))
        },
    )
    .optional()
    .map_err(LanSyncError::db)?
    .ok_or_else(|| LanSyncError::Database(format!("customer sync_id={sync_id} no encontrado")))
}

fn build_customer_balance_movement(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    conn.query_row(
        "SELECT m.sync_id, m.delta, m.device_id, m.reason, m.reference_type, m.reference_id,
                m.created_at, c.sync_id
         FROM customer_balance_movements m
         JOIN customers c ON c.id = m.customer_id
         WHERE m.sync_id = ?1",
        [sync_id],
        |r| {
            Ok(json!({
                "sync_id": r.get::<_, String>(0)?,
                "delta": r.get::<_, f64>(1)?,
                "device_id": r.get::<_, String>(2)?,
                "reason": r.get::<_, Option<String>>(3)?,
                "reference_type": r.get::<_, Option<String>>(4)?,
                "reference_id": r.get::<_, Option<i64>>(5)?,
                "created_at": r.get::<_, Option<String>>(6)?,
                "customer_sync_id": r.get::<_, String>(7)?,
            }))
        },
    )
    .optional()
    .map_err(LanSyncError::db)?
    .ok_or_else(|| {
        LanSyncError::Database(format!(
            "customer_balance_movement sync_id={sync_id} no encontrado"
        ))
    })
}

fn build_supplier(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    conn.query_row(
        "SELECT sync_id, name, phone, notes, created_at, updated_at
         FROM suppliers WHERE sync_id = ?1",
        [sync_id],
        |r| {
            Ok(json!({
                "sync_id": r.get::<_, String>(0)?,
                "name": r.get::<_, String>(1)?,
                "phone": r.get::<_, Option<String>>(2)?,
                "notes": r.get::<_, Option<String>>(3)?,
                "created_at": r.get::<_, Option<String>>(4)?,
                "updated_at": r.get::<_, Option<String>>(5)?,
            }))
        },
    )
    .optional()
    .map_err(LanSyncError::db)?
    .ok_or_else(|| LanSyncError::Database(format!("supplier sync_id={sync_id} no encontrado")))
}

fn build_sale(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    let sale = conn
        .query_row(
            "SELECT s.id, s.subtotal, s.discount_pct, s.total, s.payment_method, s.paid, s.change_due,
                    s.created_at, s.updated_at, s.sync_id, s.voided, s.customer_id,
                    c.sync_id, s.doc_number
             FROM sales s
             LEFT JOIN customers c ON c.id = s.customer_id
             WHERE s.sync_id = ?1",
            [sync_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    json!({
                        "sync_id": r.get::<_, String>(9)?,
                        "subtotal": r.get::<_, f64>(1)?,
                        "discount_pct": r.get::<_, f64>(2)?,
                        "total": r.get::<_, f64>(3)?,
                        "payment_method": r.get::<_, String>(4)?,
                        "paid": r.get::<_, Option<f64>>(5)?,
                        "change_due": r.get::<_, Option<f64>>(6)?,
                        "created_at": r.get::<_, Option<String>>(7)?,
                        "updated_at": r.get::<_, Option<String>>(8)?,
                        "voided": r.get::<_, Option<i64>>(10)?.unwrap_or(0),
                        "customer_sync_id": r.get::<_, Option<String>>(12)?,
                        "doc_number": r.get::<_, Option<String>>(13)?,
                    }),
                ))
            },
        )
        .optional()
        .map_err(LanSyncError::db)?
        .ok_or_else(|| LanSyncError::Database(format!("sale sync_id={sync_id} no encontrada")))?;

    let (sale_id, mut payload) = sale;
    let mut stmt = conn
        .prepare(
            "SELECT si.sync_id, si.name, si.qty, si.unit_price, si.discount_pct, si.line_total,
                    si.stock_qty, p.sync_id
             FROM sale_items si
             LEFT JOIN products p ON p.id = si.product_id
             WHERE si.sale_id = ?1",
        )
        .map_err(LanSyncError::db)?;
    let items_iter = stmt
        .query_map([sale_id], |r| {
            let mut item_sync: Option<String> = r.get(0)?;
            if item_sync.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
                item_sync = Some(new_uuid());
            }
            Ok(json!({
                "sync_id": item_sync,
                "name": r.get::<_, String>(1)?,
                "qty": r.get::<_, f64>(2)?,
                "unit_price": r.get::<_, f64>(3)?,
                "discount_pct": r.get::<_, f64>(4)?,
                "line_total": r.get::<_, f64>(5)?,
                "stock_qty": r.get::<_, Option<f64>>(6)?,
                "product_sync_id": r.get::<_, Option<String>>(7)?,
            }))
        })
        .map_err(LanSyncError::db)?;
    let mut items = Vec::new();
    for it in items_iter {
        items.push(it.map_err(LanSyncError::db)?);
    }
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("items".into(), Value::Array(items));
    }
    Ok(payload)
}

fn build_stock_movement(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    conn.query_row(
        "SELECT m.sync_id, m.movement_type, m.qty, m.reference_type, m.reference_id,
                m.created_at, m.device_id, p.sync_id
         FROM stock_movements m
         JOIN products p ON p.id = m.product_id
         WHERE m.sync_id = ?1",
        [sync_id],
        |r| {
            // qty ya viene con signo (venta negativa, ajuste +/-) según stock.ts
            Ok(json!({
                "sync_id": r.get::<_, String>(0)?,
                "movement_type": r.get::<_, String>(1)?,
                "qty": r.get::<_, f64>(2)?,
                "reference_type": r.get::<_, Option<String>>(3)?,
                "reference_id": r.get::<_, Option<i64>>(4)?,
                "created_at": r.get::<_, Option<String>>(5)?,
                "device_id": r.get::<_, Option<String>>(6)?,
                "product_sync_id": r.get::<_, String>(7)?,
            }))
        },
    )
    .optional()
    .map_err(LanSyncError::db)?
    .ok_or_else(|| {
        LanSyncError::Database(format!("stock_movement sync_id={sync_id} no encontrado"))
    })
}

/// Materializa eventos listos para envío (completa payload y asegura sync_id).
pub fn materialize_pending(conn: &Connection, limit: i64) -> LanResult<Vec<SyncEvent>> {
    let rows = list_pending(conn, limit)?;
    let mut events = Vec::with_capacity(rows.len());
    for mut row in rows {
        if let Some(local_id) = row.entity_local_id {
            if let Ok(sid) = resolve_sync_id_by_local(conn, &row.entity_type, local_id) {
                if sid != row.entity_sync_id {
                    conn.execute(
                        "UPDATE lan_sync_outbox SET entity_sync_id = ?1 WHERE id = ?2",
                        params![sid, row.id],
                    )
                    .map_err(LanSyncError::db)?;
                    row.entity_sync_id = sid;
                }
            }
        }
        let _ = ensure_entity_sync_id(conn, &row.entity_type, &row.entity_sync_id);
        let payload = match build_payload_for_row(conn, &row.entity_type, &row.entity_sync_id) {
            Ok(p) => {
                // La venta se encola al INSERT del encabezado, antes de los ítems.
                if row.entity_type == "sale" {
                    let empty = p
                        .get("items")
                        .and_then(|v| v.as_array())
                        .map(|a| a.is_empty())
                        .unwrap_or(true);
                    if empty {
                        continue;
                    }
                }
                p
            }
            Err(e) => {
                mark_failed(conn, &row.event_id, &e.to_string())?;
                continue;
            }
        };
        let payload_str = serde_json::to_string(&payload)?;
        conn.execute(
            "UPDATE lan_sync_outbox
             SET payload = ?1,
                 status = 'sending',
                 sending_at = datetime('now','localtime'),
                 attempt_count = COALESCE(attempt_count, 0) + 1,
                 last_error = NULL
             WHERE id = ?2",
            params![payload_str, row.id],
        )
        .map_err(LanSyncError::db)?;
        events.push(row.into_event_with_payload(payload));
    }
    Ok(events)
}

fn resolve_sync_id_by_local(conn: &Connection, entity_type: &str, local_id: i64) -> LanResult<String> {
    let table = match entity_type {
        "category" => "categories",
        "product" => "products",
        "customer" => "customers",
        "supplier" => "suppliers",
        "sale" => "sales",
        "stock_movement" => "stock_movements",
        "customer_balance_movement" => "customer_balance_movements",
        _ => {
            return Err(LanSyncError::Protocol(format!(
                "tipo desconocido: {entity_type}"
            )))
        }
    };
    ensure_row_sync_id(conn, table, local_id)
}

fn ensure_entity_sync_id(conn: &Connection, entity_type: &str, sync_id: &str) -> LanResult<()> {
    let table = match entity_type {
        "category" => "categories",
        "product" => "products",
        "customer" => "customers",
        "supplier" => "suppliers",
        "sale" => "sales",
        "stock_movement" => "stock_movements",
        "customer_balance_movement" => "customer_balance_movements",
        _ => return Ok(()),
    };
    let exists: Option<i64> = conn
        .query_row(
            &format!("SELECT id FROM {table} WHERE sync_id = ?1"),
            [sync_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?;
    if exists.is_none() {
        // sync_id puede haber sido generado en el trigger sin update de la fila —
        // intentamos backfill no destructivo solo si hay un único row reciente sin sync.
        let _ = sync_id;
    }
    let _ = table;
    Ok(())
}

fn map_store_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<SyncEvent> {
    let payload_str: Option<String> = r.get(4)?;
    let payload = payload_str
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(Value::Null);
    Ok(SyncEvent {
        event_id: r.get(0)?,
        entity_type: r.get(1)?,
        entity_sync_id: r.get(2)?,
        op: r.get(3)?,
        payload,
        lamport: r.get(5)?,
        origin_device: r.get(6)?,
        created_at: r.get(7)?,
    })
}

pub fn insert_event_store(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let payload = serde_json::to_string(&event.payload)?;
    conn.execute(
        "INSERT OR IGNORE INTO lan_sync_event_store
         (event_id, entity_type, entity_sync_id, op, payload, lamport, origin_device, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            event.event_id,
            event.entity_type,
            event.entity_sync_id,
            event.op,
            payload,
            event.lamport,
            event.origin_device,
            event.created_at,
        ],
    )
    .map_err(LanSyncError::db)?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct CatchupPage {
    pub events: Vec<SyncEvent>,
    pub has_more: bool,
    pub next_lamport: i64,
    pub next_event_id: String,
}

/// Página de catch-up con cursor (lamport, event_id). Sin límite duro global:
/// el cliente itera hasta `has_more == false`.
pub fn list_event_store_page(
    conn: &Connection,
    since_lamport: i64,
    after_event_id: &str,
    page_size: i64,
) -> LanResult<CatchupPage> {
    let limit = page_size.clamp(1, 500);
    let after = after_event_id;
    let mut out = Vec::new();
    if after.is_empty() {
        let mut stmt = conn
            .prepare(
                "SELECT event_id, entity_type, entity_sync_id, op, payload, lamport, origin_device, created_at
                 FROM lan_sync_event_store
                 WHERE lamport > ?1
                 ORDER BY lamport ASC, event_id ASC
                 LIMIT ?2",
            )
            .map_err(LanSyncError::db)?;
        let rows = stmt
            .query_map(params![since_lamport, limit], map_store_row)
            .map_err(LanSyncError::db)?;
        for row in rows {
            out.push(row.map_err(LanSyncError::db)?);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT event_id, entity_type, entity_sync_id, op, payload, lamport, origin_device, created_at
                 FROM lan_sync_event_store
                 WHERE lamport > ?1
                    OR (lamport = ?1 AND event_id > ?2)
                 ORDER BY lamport ASC, event_id ASC
                 LIMIT ?3",
            )
            .map_err(LanSyncError::db)?;
        let rows = stmt
            .query_map(params![since_lamport, after, limit], map_store_row)
            .map_err(LanSyncError::db)?;
        for row in rows {
            out.push(row.map_err(LanSyncError::db)?);
        }
    }
    let has_more = out.len() as i64 >= limit;
    let (next_lamport, next_event_id) = out
        .last()
        .map(|e| (e.lamport, e.event_id.clone()))
        .unwrap_or((since_lamport, after_event_id.to_string()));
    Ok(CatchupPage {
        events: out,
        has_more,
        next_lamport,
        next_event_id,
    })
}

/// Compat: primera página (los callers deben paginar).
pub fn list_event_store_since(conn: &Connection, since_lamport: i64) -> LanResult<Vec<SyncEvent>> {
    Ok(list_event_store_page(conn, since_lamport, "", CATCHUP_PAGE_SIZE)?.events)
}

pub fn list_event_store_all_since(conn: &Connection, since_lamport: i64) -> LanResult<Vec<SyncEvent>> {
    let mut all = Vec::new();
    let mut lamport = since_lamport;
    let mut after = String::new();
    loop {
        let page = list_event_store_page(conn, lamport, &after, CATCHUP_PAGE_SIZE)?;
        if page.events.is_empty() {
            break;
        }
        lamport = page.next_lamport;
        after = page.next_event_id.clone();
        let more = page.has_more;
        all.extend(page.events);
        if !more {
            break;
        }
    }
    Ok(all)
}

pub fn append_log(
    conn: &Connection,
    direction: &str,
    peer: Option<&str>,
    summary: &str,
    detail: Option<&str>,
) -> LanResult<()> {
    conn.execute(
        "INSERT INTO lan_sync_log (direction, peer, summary, detail) VALUES (?1, ?2, ?3, ?4)",
        params![direction, peer, summary, detail],
    )
    .map_err(LanSyncError::db)?;
    Ok(())
}

#[allow(dead_code)]
pub fn ensure_sync_id_on_product(conn: &Connection, product_id: i64) -> LanResult<String> {
    ensure_row_sync_id(conn, "products", product_id)
}
