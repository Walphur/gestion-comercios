//! LAN Sync CDC — entidades de taller/clínica.
//!
//! Builders (outbox → payload) y appliers (payload → DB local) para:
//! brand, workshop_resource, vehicle, appointment, quote, service_order,
//! delivery_note, vehicle_inspection.
//!
//! Reglas clave:
//! - stock_applied en OT/remito: se copia como metadata pero **no** toca products.stock.
//! - Stock viaja exclusivamente por stock_movements (ya en LAN sync).
//! - Dependencias faltantes → LanSyncError::Dependency (deferred, reintento automático).
//! - LWW vía updated_at + lamport (mismo helper que los otros appliers).

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use super::conflict::{payload_updated_at, ConflictPolicy, LamportDeviceWins};
use super::errors::{LanResult, LanSyncError};
use super::outbox::new_uuid;
use super::protocol::SyncEvent;

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn str_f<'a>(p: &'a Value, k: &str) -> Option<&'a str> {
    p.get(k).and_then(|v| v.as_str())
}

fn f64_f(p: &Value, k: &str, default: f64) -> f64 {
    p.get(k).and_then(|v| v.as_f64()).unwrap_or(default)
}

fn i64_f(p: &Value, k: &str, default: i64) -> i64 {
    p.get(k)
        .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
        .unwrap_or(default)
}

fn resolve_id(conn: &Connection, table: &str, sync_id: Option<&str>) -> LanResult<Option<i64>> {
    let Some(sid) = sync_id.filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let id = conn
        .query_row(
            &format!("SELECT id FROM {table} WHERE sync_id = ?1"),
            [sid],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?;
    Ok(id)
}

fn require_id(
    conn: &Connection,
    table: &str,
    sync_id: Option<&str>,
    label: &str,
) -> LanResult<Option<i64>> {
    let Some(sid) = sync_id.filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let id = conn
        .query_row(
            &format!("SELECT id FROM {table} WHERE sync_id = ?1"),
            [sid],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?;
    if id.is_none() {
        return Err(LanSyncError::Dependency(format!(
            "{label} {sid} aún no existe en esta PC"
        )));
    }
    Ok(id)
}

fn ensure_item_sync_ids(conn: &Connection, table: &str, parent_col: &str, parent_id: i64) -> LanResult<()> {
    let sql = format!(
        "SELECT id FROM {table} WHERE {parent_col} = ?1 AND (sync_id IS NULL OR sync_id = '')"
    );
    let mut stmt = conn.prepare(&sql).map_err(LanSyncError::db)?;
    let missing_ids: Vec<i64> = stmt
        .query_map([parent_id], |r| r.get(0))
        .map_err(LanSyncError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(LanSyncError::db)?;
    drop(stmt);
    for iid in missing_ids {
        let fresh = new_uuid();
        let upd = format!("UPDATE {table} SET sync_id = ?1 WHERE id = ?2");
        conn.execute(&upd, params![fresh, iid])
            .map_err(LanSyncError::db)?;
    }
    Ok(())
}

fn accept_remote(
    event: &SyncEvent,
    local_lp: i64,
    local_origin: Option<&str>,
    local_ua: Option<&str>,
    remote_ua: Option<&str>,
) -> bool {
    LamportDeviceWins.should_accept_remote(
        event.lamport,
        &event.origin_device,
        remote_ua,
        local_lp,
        local_origin,
        local_ua,
    )
}

// ─── BUILD (outbox payload) ───────────────────────────────────────────────────

pub fn build_brand(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    conn.query_row(
        "SELECT sync_id, name, created_at FROM brands WHERE sync_id = ?1",
        [sync_id],
        |r| {
            Ok(json!({
                "sync_id": r.get::<_, String>(0)?,
                "name":    r.get::<_, String>(1)?,
                "created_at": r.get::<_, Option<String>>(2)?,
            }))
        },
    )
    .optional()
    .map_err(LanSyncError::db)?
    .ok_or_else(|| LanSyncError::Database(format!("brand sync_id={sync_id} no encontrada")))
}

pub fn build_workshop_resource(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    conn.query_row(
        "SELECT sync_id, name, notes, active, sort_order, created_at, updated_at
         FROM workshop_resources WHERE sync_id = ?1",
        [sync_id],
        |r| {
            Ok(json!({
                "sync_id":    r.get::<_, String>(0)?,
                "name":       r.get::<_, String>(1)?,
                "notes":      r.get::<_, Option<String>>(2)?,
                "active":     r.get::<_, i64>(3)?,
                "sort_order": r.get::<_, i64>(4)?,
                "created_at": r.get::<_, Option<String>>(5)?,
                "updated_at": r.get::<_, Option<String>>(6)?,
            }))
        },
    )
    .optional()
    .map_err(LanSyncError::db)?
    .ok_or_else(|| LanSyncError::Database(format!("workshop_resource sync_id={sync_id} no encontrado")))
}

pub fn build_vehicle(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    conn.query_row(
        "SELECT v.sync_id, v.plate, v.brand, v.model, v.year, v.odometer_km,
                v.notes, v.active, v.created_at, v.updated_at, c.sync_id
         FROM vehicles v
         LEFT JOIN customers c ON c.id = v.customer_id
         WHERE v.sync_id = ?1",
        [sync_id],
        |r| {
            Ok(json!({
                "sync_id":          r.get::<_, String>(0)?,
                "plate":            r.get::<_, String>(1)?,
                "brand":            r.get::<_, Option<String>>(2)?,
                "model":            r.get::<_, Option<String>>(3)?,
                "year":             r.get::<_, Option<i64>>(4)?,
                "odometer_km":      r.get::<_, Option<i64>>(5)?,
                "notes":            r.get::<_, Option<String>>(6)?,
                "active":           r.get::<_, i64>(7)?,
                "created_at":       r.get::<_, Option<String>>(8)?,
                "updated_at":       r.get::<_, Option<String>>(9)?,
                "customer_sync_id": r.get::<_, Option<String>>(10)?,
            }))
        },
    )
    .optional()
    .map_err(LanSyncError::db)?
    .ok_or_else(|| LanSyncError::Database(format!("vehicle sync_id={sync_id} no encontrado")))
}

pub fn build_appointment(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    conn.query_row(
        "SELECT a.sync_id, a.title, a.resource_name, a.subject_notes, a.status,
                a.starts_at, a.ends_at, a.notes, a.created_at, a.updated_at,
                c.sync_id, v.sync_id, wr.sync_id
         FROM appointments a
         LEFT JOIN customers c ON c.id = a.customer_id
         LEFT JOIN vehicles v ON v.id = a.vehicle_id
         LEFT JOIN workshop_resources wr ON wr.id = a.resource_id
         WHERE a.sync_id = ?1",
        [sync_id],
        |r| {
            Ok(json!({
                "sync_id":           r.get::<_, String>(0)?,
                "title":             r.get::<_, String>(1)?,
                "resource_name":     r.get::<_, Option<String>>(2)?,
                "subject_notes":     r.get::<_, Option<String>>(3)?,
                "status":            r.get::<_, String>(4)?,
                "starts_at":         r.get::<_, String>(5)?,
                "ends_at":           r.get::<_, String>(6)?,
                "notes":             r.get::<_, Option<String>>(7)?,
                "created_at":        r.get::<_, Option<String>>(8)?,
                "updated_at":        r.get::<_, Option<String>>(9)?,
                "customer_sync_id":  r.get::<_, Option<String>>(10)?,
                "vehicle_sync_id":   r.get::<_, Option<String>>(11)?,
                "resource_sync_id":  r.get::<_, Option<String>>(12)?,
            }))
        },
    )
    .optional()
    .map_err(LanSyncError::db)?
    .ok_or_else(|| LanSyncError::Database(format!("appointment sync_id={sync_id} no encontrado")))
}

pub fn build_quote(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    let (quote_id, mut payload) = conn
        .query_row(
            "SELECT q.id, q.sync_id, q.quote_number, q.status,
                    q.subtotal, q.discount_pct, q.total, q.notes, q.valid_until,
                    q.created_at, q.updated_at,
                    c.sync_id, v.sync_id, a.sync_id
             FROM quotes q
             LEFT JOIN customers c ON c.id = q.customer_id
             LEFT JOIN vehicles v ON v.id = q.vehicle_id
             LEFT JOIN appointments a ON a.id = q.appointment_id
             WHERE q.sync_id = ?1",
            [sync_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    json!({
                        "sync_id":              r.get::<_, String>(1)?,
                        "quote_number":         r.get::<_, String>(2)?,
                        "status":               r.get::<_, String>(3)?,
                        "subtotal":             r.get::<_, f64>(4)?,
                        "discount_pct":         r.get::<_, f64>(5)?,
                        "total":                r.get::<_, f64>(6)?,
                        "notes":                r.get::<_, Option<String>>(7)?,
                        "valid_until":          r.get::<_, Option<String>>(8)?,
                        "created_at":           r.get::<_, Option<String>>(9)?,
                        "updated_at":           r.get::<_, Option<String>>(10)?,
                        "customer_sync_id":     r.get::<_, Option<String>>(11)?,
                        "vehicle_sync_id":      r.get::<_, Option<String>>(12)?,
                        "appointment_sync_id":  r.get::<_, Option<String>>(13)?,
                    }),
                ))
            },
        )
        .optional()
        .map_err(LanSyncError::db)?
        .ok_or_else(|| LanSyncError::Database(format!("quote sync_id={sync_id} no encontrado")))?;

    // Asegurar sync_id en ítems antes de leer
    ensure_item_sync_ids(conn, "quote_items", "quote_id", quote_id)?;

    let mut stmt = conn
        .prepare(
            "SELECT qi.sync_id, qi.name, qi.qty, qi.unit_price, qi.discount_pct,
                    qi.line_total, qi.sort_order, p.sync_id
             FROM quote_items qi
             LEFT JOIN products p ON p.id = qi.product_id
             WHERE qi.quote_id = ?1
             ORDER BY qi.sort_order, qi.id",
        )
        .map_err(LanSyncError::db)?;
    let items: Vec<Value> = stmt
        .query_map([quote_id], |r| {
            Ok(json!({
                "sync_id":       r.get::<_, Option<String>>(0)?,
                "name":          r.get::<_, String>(1)?,
                "qty":           r.get::<_, f64>(2)?,
                "unit_price":    r.get::<_, f64>(3)?,
                "discount_pct":  r.get::<_, f64>(4)?,
                "line_total":    r.get::<_, f64>(5)?,
                "sort_order":    r.get::<_, i64>(6)?,
                "product_sync_id": r.get::<_, Option<String>>(7)?,
            }))
        })
        .map_err(LanSyncError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(LanSyncError::db)?;

    payload.as_object_mut().unwrap().insert("items".into(), Value::Array(items));
    Ok(payload)
}

pub fn build_service_order(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    let (order_id, mut payload) = conn
        .query_row(
            "SELECT so.id, so.sync_id, so.order_number, so.title, so.subject_notes,
                    so.status, so.subtotal, so.discount_pct, so.total, so.notes,
                    so.stock_applied, so.odometer_km,
                    so.created_at, so.updated_at,
                    c.sync_id, v.sync_id, a.sync_id, q.sync_id
             FROM service_orders so
             LEFT JOIN customers c ON c.id = so.customer_id
             LEFT JOIN vehicles v ON v.id = so.vehicle_id
             LEFT JOIN appointments a ON a.id = so.appointment_id
             LEFT JOIN quotes q ON q.id = so.quote_id
             WHERE so.sync_id = ?1",
            [sync_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    json!({
                        "sync_id":             r.get::<_, String>(1)?,
                        "order_number":        r.get::<_, String>(2)?,
                        "title":               r.get::<_, String>(3)?,
                        "subject_notes":       r.get::<_, Option<String>>(4)?,
                        "status":              r.get::<_, String>(5)?,
                        "subtotal":            r.get::<_, f64>(6)?,
                        "discount_pct":        r.get::<_, f64>(7)?,
                        "total":               r.get::<_, f64>(8)?,
                        "notes":               r.get::<_, Option<String>>(9)?,
                        // Metadata: el applier NO toca stock con este campo.
                        "stock_applied":       r.get::<_, i64>(10)?,
                        "odometer_km":         r.get::<_, Option<i64>>(11)?,
                        "created_at":          r.get::<_, Option<String>>(12)?,
                        "updated_at":          r.get::<_, Option<String>>(13)?,
                        "customer_sync_id":    r.get::<_, Option<String>>(14)?,
                        "vehicle_sync_id":     r.get::<_, Option<String>>(15)?,
                        "appointment_sync_id": r.get::<_, Option<String>>(16)?,
                        "quote_sync_id":       r.get::<_, Option<String>>(17)?,
                    }),
                ))
            },
        )
        .optional()
        .map_err(LanSyncError::db)?
        .ok_or_else(|| LanSyncError::Database(format!("service_order sync_id={sync_id} no encontrado")))?;

    ensure_item_sync_ids(conn, "service_order_items", "order_id", order_id)?;

    let mut stmt = conn
        .prepare(
            "SELECT soi.sync_id, soi.name, soi.qty, soi.unit_price, soi.discount_pct,
                    soi.line_total, soi.is_labor, soi.sort_order, p.sync_id
             FROM service_order_items soi
             LEFT JOIN products p ON p.id = soi.product_id
             WHERE soi.order_id = ?1
             ORDER BY soi.sort_order, soi.id",
        )
        .map_err(LanSyncError::db)?;
    let items: Vec<Value> = stmt
        .query_map([order_id], |r| {
            Ok(json!({
                "sync_id":         r.get::<_, Option<String>>(0)?,
                "name":            r.get::<_, String>(1)?,
                "qty":             r.get::<_, f64>(2)?,
                "unit_price":      r.get::<_, f64>(3)?,
                "discount_pct":    r.get::<_, f64>(4)?,
                "line_total":      r.get::<_, f64>(5)?,
                "is_labor":        r.get::<_, i64>(6)?,
                "sort_order":      r.get::<_, i64>(7)?,
                "product_sync_id": r.get::<_, Option<String>>(8)?,
            }))
        })
        .map_err(LanSyncError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(LanSyncError::db)?;

    payload.as_object_mut().unwrap().insert("items".into(), Value::Array(items));
    Ok(payload)
}

pub fn build_delivery_note(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    let (note_id, mut payload) = conn
        .query_row(
            "SELECT dn.id, dn.sync_id, dn.note_number, dn.destination, dn.status,
                    dn.notes, dn.issued_at, dn.stock_applied,
                    dn.created_at, dn.updated_at, c.sync_id
             FROM delivery_notes dn
             LEFT JOIN customers c ON c.id = dn.customer_id
             WHERE dn.sync_id = ?1",
            [sync_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    json!({
                        "sync_id":         r.get::<_, String>(1)?,
                        "note_number":     r.get::<_, String>(2)?,
                        "destination":     r.get::<_, Option<String>>(3)?,
                        "status":          r.get::<_, String>(4)?,
                        "notes":           r.get::<_, Option<String>>(5)?,
                        "issued_at":       r.get::<_, Option<String>>(6)?,
                        // Metadata: el applier NO toca stock con este campo.
                        "stock_applied":   r.get::<_, i64>(7)?,
                        "created_at":      r.get::<_, Option<String>>(8)?,
                        "updated_at":      r.get::<_, Option<String>>(9)?,
                        "customer_sync_id": r.get::<_, Option<String>>(10)?,
                    }),
                ))
            },
        )
        .optional()
        .map_err(LanSyncError::db)?
        .ok_or_else(|| LanSyncError::Database(format!("delivery_note sync_id={sync_id} no encontrado")))?;

    // delivery_note_items no tiene sync_id: generamos en el payload al vuelo
    let mut stmt = conn
        .prepare(
            "SELECT dni.id, dni.name, dni.qty, dni.sort_order, p.sync_id
             FROM delivery_note_items dni
             LEFT JOIN products p ON p.id = dni.product_id
             WHERE dni.note_id = ?1
             ORDER BY dni.sort_order, dni.id",
        )
        .map_err(LanSyncError::db)?;
    let items: Vec<Value> = stmt
        .query_map([note_id], |r| {
            Ok(json!({
                "local_id":        r.get::<_, i64>(0)?,
                "name":            r.get::<_, String>(1)?,
                "qty":             r.get::<_, f64>(2)?,
                "sort_order":      r.get::<_, i64>(3)?,
                "product_sync_id": r.get::<_, Option<String>>(4)?,
            }))
        })
        .map_err(LanSyncError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(LanSyncError::db)?;

    payload.as_object_mut().unwrap().insert("items".into(), Value::Array(items));
    Ok(payload)
}

pub fn build_vehicle_inspection(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    conn.query_row(
        "SELECT vi.sync_id, vi.inspection_number, vi.odometer_km,
                vi.fuel_level, vi.exterior_condition, vi.interior_condition,
                vi.belongings, vi.customer_reported, vi.notes, vi.received_by,
                vi.created_at, vi.updated_at,
                v.sync_id, c.sync_id, so.sync_id
         FROM vehicle_inspections vi
         LEFT JOIN vehicles v ON v.id = vi.vehicle_id
         LEFT JOIN customers c ON c.id = vi.customer_id
         LEFT JOIN service_orders so ON so.id = vi.service_order_id
         WHERE vi.sync_id = ?1",
        [sync_id],
        |r| {
            Ok(json!({
                "sync_id":             r.get::<_, String>(0)?,
                "inspection_number":   r.get::<_, String>(1)?,
                "odometer_km":         r.get::<_, Option<i64>>(2)?,
                "fuel_level":          r.get::<_, Option<String>>(3)?,
                "exterior_condition":  r.get::<_, Option<String>>(4)?,
                "interior_condition":  r.get::<_, Option<String>>(5)?,
                "belongings":          r.get::<_, Option<String>>(6)?,
                "customer_reported":   r.get::<_, Option<String>>(7)?,
                "notes":               r.get::<_, Option<String>>(8)?,
                "received_by":         r.get::<_, Option<String>>(9)?,
                "created_at":          r.get::<_, Option<String>>(10)?,
                "updated_at":          r.get::<_, Option<String>>(11)?,
                "vehicle_sync_id":     r.get::<_, Option<String>>(12)?,
                "customer_sync_id":    r.get::<_, Option<String>>(13)?,
                "service_order_sync_id": r.get::<_, Option<String>>(14)?,
            }))
        },
    )
    .optional()
    .map_err(LanSyncError::db)?
    .ok_or_else(|| LanSyncError::Database(format!("vehicle_inspection sync_id={sync_id} no encontrado")))
}

// ─── APPLY (payload → DB local) ──────────────────────────────────────────────

pub fn apply_brand(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let name = str_f(p, "name").unwrap_or("Sin nombre");
    let created_at = str_f(p, "created_at");

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM brands WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    if existing.is_some() {
        // Marcas: solo actualizamos nombre si cambia; no hay updated_at.
        conn.execute(
            "UPDATE brands SET name = ?1 WHERE sync_id = ?2",
            params![name, event.entity_sync_id],
        )
        .map_err(LanSyncError::db)?;
    } else {
        // Intentar unificar por nombre si ya existe sin sync_id.
        let by_name: Option<i64> = conn
            .query_row("SELECT id FROM brands WHERE name = ?1", [name], |r| r.get(0))
            .optional()
            .map_err(LanSyncError::db)?;
        if let Some(id) = by_name {
            conn.execute(
                "UPDATE brands SET sync_id = ?1 WHERE id = ?2",
                params![event.entity_sync_id, id],
            )
            .map_err(LanSyncError::db)?;
        } else {
            conn.execute(
                "INSERT INTO brands (name, sync_id, created_at)
                 VALUES (?1, ?2, COALESCE(?3, datetime('now','localtime')))",
                params![name, event.entity_sync_id, created_at],
            )
            .map_err(LanSyncError::db)?;
        }
    }
    Ok(())
}

pub fn apply_workshop_resource(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let name = str_f(p, "name").unwrap_or("Sin nombre");
    let notes = str_f(p, "notes");
    let active = i64_f(p, "active", 1);
    let sort_order = i64_f(p, "sort_order", 0);
    let updated_at = payload_updated_at(p);
    let created_at = str_f(p, "created_at");

    let existing: Option<(i64, Option<String>, i64, Option<String>)> = conn
        .query_row(
            "SELECT id, updated_at, sync_lamport, sync_origin FROM workshop_resources WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2).unwrap_or(0), r.get(3)?)),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    if let Some((id, local_ua, local_lp, local_origin)) = existing {
        if !accept_remote(event, local_lp, local_origin.as_deref(), local_ua.as_deref(), updated_at) {
            return Ok(());
        }
        conn.execute(
            "UPDATE workshop_resources SET name = ?1, notes = ?2, active = ?3, sort_order = ?4,
             updated_at = COALESCE(?5, datetime('now','localtime')) WHERE id = ?6",
            params![name, notes, active, sort_order, updated_at, id],
        )
        .map_err(LanSyncError::db)?;
    } else {
        conn.execute(
            "INSERT INTO workshop_resources (name, notes, active, sort_order, sync_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5,
                     COALESCE(?6, datetime('now','localtime')),
                     COALESCE(?7, datetime('now','localtime')))",
            params![name, notes, active, sort_order, event.entity_sync_id, created_at, updated_at],
        )
        .map_err(LanSyncError::db)?;
    }
    Ok(())
}

pub fn apply_vehicle(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let plate = str_f(p, "plate").unwrap_or("");
    let brand = str_f(p, "brand");
    let model = str_f(p, "model");
    let year = p.get("year").and_then(|v| v.as_i64());
    let odometer_km = p.get("odometer_km").and_then(|v| v.as_i64());
    let notes = str_f(p, "notes");
    let active = i64_f(p, "active", 1);
    let updated_at = payload_updated_at(p);
    let created_at = str_f(p, "created_at");

    let customer_id = resolve_id(conn, "customers", str_f(p, "customer_sync_id"))?;

    let existing: Option<(i64, Option<String>, i64, Option<String>)> = conn
        .query_row(
            "SELECT id, updated_at, sync_lamport, sync_origin FROM vehicles WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2).unwrap_or(0), r.get(3)?)),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    if let Some((id, local_ua, local_lp, local_origin)) = existing {
        if !accept_remote(event, local_lp, local_origin.as_deref(), local_ua.as_deref(), updated_at) {
            return Ok(());
        }
        conn.execute(
            "UPDATE vehicles SET customer_id = ?1, plate = ?2, brand = ?3, model = ?4, year = ?5,
             odometer_km = ?6, notes = ?7, active = ?8,
             updated_at = COALESCE(?9, datetime('now','localtime')),
             sync_lamport = ?10, sync_origin = ?11 WHERE id = ?12",
            params![customer_id, plate, brand, model, year, odometer_km, notes, active,
                    updated_at, event.lamport, event.origin_device, id],
        )
        .map_err(LanSyncError::db)?;
    } else {
        conn.execute(
            "INSERT INTO vehicles (customer_id, plate, brand, model, year, odometer_km, notes, active,
             sync_id, created_at, updated_at, sync_lamport, sync_origin)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,
                     COALESCE(?10, datetime('now','localtime')),
                     COALESCE(?11, datetime('now','localtime')), ?12, ?13)",
            params![customer_id, plate, brand, model, year, odometer_km, notes, active,
                    event.entity_sync_id, created_at, updated_at, event.lamport, event.origin_device],
        )
        .map_err(LanSyncError::db)?;
    }
    Ok(())
}

pub fn apply_appointment(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let title = str_f(p, "title").unwrap_or("");
    let resource_name = str_f(p, "resource_name");
    let subject_notes = str_f(p, "subject_notes");
    let status = str_f(p, "status").unwrap_or("pending");
    let starts_at = str_f(p, "starts_at").unwrap_or("");
    let ends_at = str_f(p, "ends_at").unwrap_or("");
    let notes = str_f(p, "notes");
    let updated_at = payload_updated_at(p);
    let created_at = str_f(p, "created_at");

    // FKs: customer y vehicle no son requeridos (opcionales en appointments).
    // resource_id tampoco es requerido.
    let customer_id = resolve_id(conn, "customers", str_f(p, "customer_sync_id"))?;
    let vehicle_id = resolve_id(conn, "vehicles", str_f(p, "vehicle_sync_id"))?;
    let resource_id = resolve_id(conn, "workshop_resources", str_f(p, "resource_sync_id"))?;

    let existing: Option<(i64, Option<String>, i64, Option<String>)> = conn
        .query_row(
            "SELECT id, updated_at, sync_lamport, sync_origin FROM appointments WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2).unwrap_or(0), r.get(3)?)),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    if let Some((id, local_ua, local_lp, local_origin)) = existing {
        if !accept_remote(event, local_lp, local_origin.as_deref(), local_ua.as_deref(), updated_at) {
            return Ok(());
        }
        conn.execute(
            "UPDATE appointments SET customer_id = ?1, vehicle_id = ?2, resource_id = ?3,
             title = ?4, resource_name = ?5, subject_notes = ?6, status = ?7,
             starts_at = ?8, ends_at = ?9, notes = ?10,
             updated_at = COALESCE(?11, datetime('now','localtime')),
             sync_lamport = ?12, sync_origin = ?13 WHERE id = ?14",
            params![customer_id, vehicle_id, resource_id, title, resource_name, subject_notes,
                    status, starts_at, ends_at, notes, updated_at,
                    event.lamport, event.origin_device, id],
        )
        .map_err(LanSyncError::db)?;
    } else {
        conn.execute(
            "INSERT INTO appointments (customer_id, vehicle_id, resource_id, title,
             resource_name, subject_notes, status, starts_at, ends_at, notes, sync_id,
             created_at, updated_at, sync_lamport, sync_origin)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,
                     COALESCE(?12, datetime('now','localtime')),
                     COALESCE(?13, datetime('now','localtime')), ?14, ?15)",
            params![customer_id, vehicle_id, resource_id, title, resource_name, subject_notes,
                    status, starts_at, ends_at, notes, event.entity_sync_id,
                    created_at, updated_at, event.lamport, event.origin_device],
        )
        .map_err(LanSyncError::db)?;
    }
    Ok(())
}

pub fn apply_quote(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let quote_number = str_f(p, "quote_number").unwrap_or("");
    let status = str_f(p, "status").unwrap_or("draft");
    let subtotal = f64_f(p, "subtotal", 0.0);
    let discount_pct = f64_f(p, "discount_pct", 0.0);
    let total = f64_f(p, "total", 0.0);
    let notes = str_f(p, "notes");
    let valid_until = str_f(p, "valid_until");
    let updated_at = payload_updated_at(p);
    let created_at = str_f(p, "created_at");

    // customer es requerido para un presupuesto útil; deferir si falta.
    let customer_sync = str_f(p, "customer_sync_id");
    let customer_id = if let Some(sid) = customer_sync.filter(|s| !s.is_empty()) {
        require_id(conn, "customers", Some(sid), "cliente")?
    } else {
        None
    };

    let vehicle_id = resolve_id(conn, "vehicles", str_f(p, "vehicle_sync_id"))?;
    let appointment_id = resolve_id(conn, "appointments", str_f(p, "appointment_sync_id"))?;

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM quotes WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    let quote_id = if let Some(id) = existing {
        conn.execute(
            "UPDATE quotes SET quote_number = COALESCE(?1, quote_number), status = ?2,
             subtotal = ?3, discount_pct = ?4, total = ?5, notes = ?6, valid_until = ?7,
             customer_id = ?8, vehicle_id = ?9, appointment_id = ?10,
             updated_at = COALESCE(?11, datetime('now','localtime')) WHERE id = ?12",
            params![quote_number, status, subtotal, discount_pct, total, notes, valid_until,
                    customer_id, vehicle_id, appointment_id, updated_at, id],
        )
        .map_err(LanSyncError::db)?;
        id
    } else {
        conn.execute(
            "INSERT INTO quotes (quote_number, status, subtotal, discount_pct, total, notes,
             valid_until, customer_id, vehicle_id, appointment_id, sync_id, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,
                     COALESCE(?12, datetime('now','localtime')),
                     COALESCE(?13, datetime('now','localtime')))",
            params![quote_number, status, subtotal, discount_pct, total, notes, valid_until,
                    customer_id, vehicle_id, appointment_id, event.entity_sync_id,
                    created_at, updated_at],
        )
        .map_err(LanSyncError::db)?;
        conn.last_insert_rowid()
    };

    // Upsert de ítems por sync_id
    if let Some(items) = p.get("items").and_then(|v| v.as_array()) {
        for item in items {
            let item_sync = str_f(item, "sync_id").unwrap_or("");
            if item_sync.is_empty() {
                continue;
            }
            let item_name = str_f(item, "name").unwrap_or("");
            let qty = f64_f(item, "qty", 0.0);
            let unit_price = f64_f(item, "unit_price", 0.0);
            let disc = f64_f(item, "discount_pct", 0.0);
            let line_total = f64_f(item, "line_total", 0.0);
            let sort_order = i64_f(item, "sort_order", 0);
            let product_id = resolve_id(conn, "products", str_f(item, "product_sync_id"))?;

            let exists: Option<i64> = conn
                .query_row(
                    "SELECT id FROM quote_items WHERE sync_id = ?1",
                    [item_sync],
                    |r| r.get(0),
                )
                .optional()
                .map_err(LanSyncError::db)?;

            if let Some(iid) = exists {
                conn.execute(
                    "UPDATE quote_items SET quote_id = ?1, product_id = ?2, name = ?3, qty = ?4,
                     unit_price = ?5, discount_pct = ?6, line_total = ?7, sort_order = ?8
                     WHERE id = ?9",
                    params![quote_id, product_id, item_name, qty, unit_price, disc, line_total, sort_order, iid],
                )
                .map_err(LanSyncError::db)?;
            } else {
                conn.execute(
                    "INSERT INTO quote_items (quote_id, product_id, name, qty, unit_price,
                     discount_pct, line_total, sort_order, sync_id)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                    params![quote_id, product_id, item_name, qty, unit_price, disc, line_total, sort_order, item_sync],
                )
                .map_err(LanSyncError::db)?;
            }
        }
    }
    Ok(())
}

pub fn apply_service_order(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let order_number = str_f(p, "order_number").unwrap_or("");
    let title = str_f(p, "title").unwrap_or("");
    let subject_notes = str_f(p, "subject_notes");
    let status = str_f(p, "status").unwrap_or("pending");
    let subtotal = f64_f(p, "subtotal", 0.0);
    let discount_pct = f64_f(p, "discount_pct", 0.0);
    let total = f64_f(p, "total", 0.0);
    let notes = str_f(p, "notes");
    // stock_applied = metadata solo. NO toca products.stock.
    let stock_applied = i64_f(p, "stock_applied", 0);
    let odometer_km = p.get("odometer_km").and_then(|v| v.as_i64());
    let updated_at = payload_updated_at(p);
    let created_at = str_f(p, "created_at");

    // customer deferir si falta
    let customer_sync = str_f(p, "customer_sync_id");
    let customer_id = if let Some(sid) = customer_sync.filter(|s| !s.is_empty()) {
        require_id(conn, "customers", Some(sid), "cliente")?
    } else {
        None
    };

    let vehicle_id = resolve_id(conn, "vehicles", str_f(p, "vehicle_sync_id"))?;
    let appointment_id = resolve_id(conn, "appointments", str_f(p, "appointment_sync_id"))?;
    let quote_id = resolve_id(conn, "quotes", str_f(p, "quote_sync_id"))?;

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM service_orders WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    let order_id = if let Some(id) = existing {
        conn.execute(
            "UPDATE service_orders SET order_number = COALESCE(?1, order_number),
             title = ?2, subject_notes = ?3, status = ?4, subtotal = ?5, discount_pct = ?6,
             total = ?7, notes = ?8, stock_applied = ?9, odometer_km = ?10,
             customer_id = ?11, vehicle_id = ?12, appointment_id = ?13, quote_id = ?14,
             updated_at = COALESCE(?15, datetime('now','localtime')) WHERE id = ?16",
            params![order_number, title, subject_notes, status, subtotal, discount_pct, total, notes,
                    stock_applied, odometer_km, customer_id, vehicle_id, appointment_id, quote_id,
                    updated_at, id],
        )
        .map_err(LanSyncError::db)?;
        id
    } else {
        conn.execute(
            "INSERT INTO service_orders (order_number, title, subject_notes, status,
             subtotal, discount_pct, total, notes, stock_applied, odometer_km,
             customer_id, vehicle_id, appointment_id, quote_id, sync_id, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,
                     COALESCE(?16, datetime('now','localtime')),
                     COALESCE(?17, datetime('now','localtime')))",
            params![order_number, title, subject_notes, status, subtotal, discount_pct, total, notes,
                    stock_applied, odometer_km, customer_id, vehicle_id, appointment_id, quote_id,
                    event.entity_sync_id, created_at, updated_at],
        )
        .map_err(LanSyncError::db)?;
        conn.last_insert_rowid()
    };

    if let Some(items) = p.get("items").and_then(|v| v.as_array()) {
        for item in items {
            let item_sync = str_f(item, "sync_id").unwrap_or("");
            if item_sync.is_empty() {
                continue;
            }
            let item_name = str_f(item, "name").unwrap_or("");
            let qty = f64_f(item, "qty", 0.0);
            let unit_price = f64_f(item, "unit_price", 0.0);
            let disc = f64_f(item, "discount_pct", 0.0);
            let line_total = f64_f(item, "line_total", 0.0);
            let is_labor = i64_f(item, "is_labor", 0);
            let sort_order = i64_f(item, "sort_order", 0);
            let product_id = resolve_id(conn, "products", str_f(item, "product_sync_id"))?;

            let exists: Option<i64> = conn
                .query_row(
                    "SELECT id FROM service_order_items WHERE sync_id = ?1",
                    [item_sync],
                    |r| r.get(0),
                )
                .optional()
                .map_err(LanSyncError::db)?;

            if let Some(iid) = exists {
                conn.execute(
                    "UPDATE service_order_items SET order_id = ?1, product_id = ?2, name = ?3,
                     qty = ?4, unit_price = ?5, discount_pct = ?6, line_total = ?7,
                     is_labor = ?8, sort_order = ?9 WHERE id = ?10",
                    params![order_id, product_id, item_name, qty, unit_price, disc, line_total,
                            is_labor, sort_order, iid],
                )
                .map_err(LanSyncError::db)?;
            } else {
                conn.execute(
                    "INSERT INTO service_order_items (order_id, product_id, name, qty, unit_price,
                     discount_pct, line_total, is_labor, sort_order, sync_id)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                    params![order_id, product_id, item_name, qty, unit_price, disc, line_total,
                            is_labor, sort_order, item_sync],
                )
                .map_err(LanSyncError::db)?;
            }
        }
    }
    Ok(())
}

pub fn apply_delivery_note(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let note_number = str_f(p, "note_number").unwrap_or("");
    let destination = str_f(p, "destination");
    let status = str_f(p, "status").unwrap_or("draft");
    let notes = str_f(p, "notes");
    let issued_at = str_f(p, "issued_at");
    // stock_applied: solo metadata, NO toca products.stock.
    let stock_applied = i64_f(p, "stock_applied", 0);
    let updated_at = payload_updated_at(p);
    let created_at = str_f(p, "created_at");

    let customer_sync = str_f(p, "customer_sync_id");
    let customer_id = if let Some(sid) = customer_sync.filter(|s| !s.is_empty()) {
        require_id(conn, "customers", Some(sid), "cliente")?
    } else {
        None
    };

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM delivery_notes WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    let note_id = if let Some(id) = existing {
        conn.execute(
            "UPDATE delivery_notes SET note_number = COALESCE(?1, note_number),
             destination = ?2, status = ?3, notes = ?4, issued_at = ?5,
             stock_applied = ?6, customer_id = ?7,
             updated_at = COALESCE(?8, datetime('now','localtime')) WHERE id = ?9",
            params![note_number, destination, status, notes, issued_at, stock_applied,
                    customer_id, updated_at, id],
        )
        .map_err(LanSyncError::db)?;
        id
    } else {
        conn.execute(
            "INSERT INTO delivery_notes (note_number, destination, status, notes, issued_at,
             stock_applied, customer_id, sync_id, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,
                     COALESCE(?9, datetime('now','localtime')),
                     COALESCE(?10, datetime('now','localtime')))",
            params![note_number, destination, status, notes, issued_at, stock_applied,
                    customer_id, event.entity_sync_id, created_at, updated_at],
        )
        .map_err(LanSyncError::db)?;
        conn.last_insert_rowid()
    };

    // Ítems: delivery_note_items no tiene sync_id; reconciliar por local_id si existe,
    // si no, limpiar y reinsertar (safe porque note_id es nuestro, no compartido).
    if let Some(items) = p.get("items").and_then(|v| v.as_array()) {
        conn.execute("DELETE FROM delivery_note_items WHERE note_id = ?1", [note_id])
            .map_err(LanSyncError::db)?;
        for item in items {
            let item_name = str_f(item, "name").unwrap_or("");
            let qty = f64_f(item, "qty", 0.0);
            let sort_order = i64_f(item, "sort_order", 0);
            let product_id = resolve_id(conn, "products", str_f(item, "product_sync_id"))?;
            conn.execute(
                "INSERT INTO delivery_note_items (note_id, product_id, name, qty, sort_order)
                 VALUES (?1,?2,?3,?4,?5)",
                params![note_id, product_id, item_name, qty, sort_order],
            )
            .map_err(LanSyncError::db)?;
        }
    }
    Ok(())
}

pub fn apply_vehicle_inspection(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let inspection_number = str_f(p, "inspection_number").unwrap_or("");
    let odometer_km = p.get("odometer_km").and_then(|v| v.as_i64());
    let fuel_level = str_f(p, "fuel_level");
    let exterior_condition = str_f(p, "exterior_condition");
    let interior_condition = str_f(p, "interior_condition");
    let belongings = str_f(p, "belongings");
    let customer_reported = str_f(p, "customer_reported");
    let notes = str_f(p, "notes");
    let received_by = str_f(p, "received_by");
    let updated_at = payload_updated_at(p);
    let created_at = str_f(p, "created_at");

    // vehicle es requerido
    let vehicle_sync = str_f(p, "vehicle_sync_id");
    let vehicle_id = require_id(conn, "vehicles", vehicle_sync, "vehículo")?
        .ok_or_else(|| LanSyncError::Dependency("vehicle_inspection sin vehicle_sync_id".into()))?;

    let customer_id = resolve_id(conn, "customers", str_f(p, "customer_sync_id"))?;
    let service_order_id = resolve_id(conn, "service_orders", str_f(p, "service_order_sync_id"))?;

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM vehicle_inspections WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    if let Some(id) = existing {
        conn.execute(
            "UPDATE vehicle_inspections SET vehicle_id = ?1, customer_id = ?2,
             odometer_km = ?3, fuel_level = ?4, exterior_condition = ?5, interior_condition = ?6,
             belongings = ?7, customer_reported = ?8, notes = ?9, received_by = ?10,
             service_order_id = ?11,
             updated_at = COALESCE(?12, datetime('now','localtime')) WHERE id = ?13",
            params![vehicle_id, customer_id, odometer_km, fuel_level, exterior_condition,
                    interior_condition, belongings, customer_reported, notes, received_by,
                    service_order_id, updated_at, id],
        )
        .map_err(LanSyncError::db)?;
    } else {
        conn.execute(
            "INSERT INTO vehicle_inspections (inspection_number, vehicle_id, customer_id,
             odometer_km, fuel_level, exterior_condition, interior_condition, belongings,
             customer_reported, notes, received_by, service_order_id, sync_id, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,
                     COALESCE(?14, datetime('now','localtime')),
                     COALESCE(?15, datetime('now','localtime')))",
            params![inspection_number, vehicle_id, customer_id, odometer_km, fuel_level,
                    exterior_condition, interior_condition, belongings, customer_reported,
                    notes, received_by, service_order_id, event.entity_sync_id,
                    created_at, updated_at],
        )
        .map_err(LanSyncError::db)?;
    }
    Ok(())
}

/// Encola filas taller ya existentes (una vez) disparando triggers AU
/// (touch de una columna listada en cada `UPDATE OF …`).
pub fn enqueue_existing_workshop_once(conn: &Connection) -> LanResult<u64> {
    use crate::settings_util::{read_setting_flag, write_setting_flag};
    if read_setting_flag(conn, "lan_sync_workshop_enqueued") {
        return Ok(0);
    }
    let touches = [
        "UPDATE brands SET name = name WHERE sync_id IS NOT NULL AND TRIM(sync_id) != ''",
        "UPDATE workshop_resources SET name = name WHERE sync_id IS NOT NULL AND TRIM(sync_id) != ''",
        "UPDATE vehicles SET plate = plate WHERE sync_id IS NOT NULL AND TRIM(sync_id) != ''",
        "UPDATE appointments SET title = title WHERE sync_id IS NOT NULL AND TRIM(sync_id) != ''",
        "UPDATE quotes SET status = status WHERE sync_id IS NOT NULL AND TRIM(sync_id) != ''",
        "UPDATE service_orders SET title = title WHERE sync_id IS NOT NULL AND TRIM(sync_id) != ''",
        "UPDATE delivery_notes SET status = status WHERE sync_id IS NOT NULL AND TRIM(sync_id) != ''",
        "UPDATE vehicle_inspections SET notes = notes WHERE sync_id IS NOT NULL AND TRIM(sync_id) != ''",
    ];
    let mut n = 0u64;
    for sql in touches {
        n += conn.execute(sql, []).map_err(LanSyncError::db)? as u64;
    }
    write_setting_flag(conn, "lan_sync_workshop_enqueued", true).map_err(LanSyncError::db)?;
    Ok(n)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO settings VALUES
              ('lan_sync_applying','0'),
              ('lan_sync_lamport','0'),
              ('lan_sync_catchup_lamport','0'),
              ('lan_sync_catchup_event_id','');

            CREATE TABLE customers (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT, phone TEXT, document TEXT, email TEXT,
              credit_limit REAL DEFAULT 0, balance REAL DEFAULT 0,
              notes TEXT, active INTEGER DEFAULT 1,
              sync_id TEXT, created_at TEXT, updated_at TEXT,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE TABLE products (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL, stock REAL DEFAULT 0,
              barcode TEXT, sync_id TEXT,
              cost REAL DEFAULT 0, price REAL DEFAULT 0,
              active INTEGER DEFAULT 1,
              created_at TEXT, updated_at TEXT,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE TABLE brands (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE, sync_id TEXT, created_at TEXT
            );
            CREATE TABLE workshop_resources (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL, notes TEXT, active INTEGER DEFAULT 1,
              sort_order INTEGER DEFAULT 0, sync_id TEXT,
              created_at TEXT, updated_at TEXT,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE TABLE vehicles (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              customer_id INTEGER, plate TEXT NOT NULL,
              brand TEXT, model TEXT, year INTEGER, odometer_km INTEGER,
              notes TEXT, active INTEGER DEFAULT 1,
              sync_id TEXT, created_at TEXT, updated_at TEXT,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE TABLE appointments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              customer_id INTEGER, vehicle_id INTEGER, resource_id INTEGER,
              title TEXT NOT NULL, resource_name TEXT, subject_notes TEXT,
              status TEXT DEFAULT 'pending',
              starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
              notes TEXT, sync_id TEXT, created_at TEXT, updated_at TEXT,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE TABLE quotes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              quote_number TEXT NOT NULL, customer_id INTEGER, vehicle_id INTEGER,
              appointment_id INTEGER, status TEXT DEFAULT 'draft',
              subtotal REAL DEFAULT 0, discount_pct REAL DEFAULT 0, total REAL DEFAULT 0,
              notes TEXT, valid_until TEXT, sale_id INTEGER,
              sync_id TEXT, created_at TEXT, updated_at TEXT
            );
            CREATE TABLE quote_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              quote_id INTEGER NOT NULL, product_id INTEGER, name TEXT NOT NULL,
              qty REAL NOT NULL, unit_price REAL DEFAULT 0, discount_pct REAL DEFAULT 0,
              line_total REAL DEFAULT 0, sort_order INTEGER DEFAULT 0, sync_id TEXT
            );
            CREATE TABLE service_orders (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              order_number TEXT NOT NULL, customer_id INTEGER, vehicle_id INTEGER,
              appointment_id INTEGER, quote_id INTEGER, title TEXT NOT NULL,
              subject_notes TEXT, status TEXT DEFAULT 'pending',
              subtotal REAL DEFAULT 0, discount_pct REAL DEFAULT 0, total REAL DEFAULT 0,
              notes TEXT, stock_applied INTEGER DEFAULT 0, odometer_km INTEGER,
              sync_id TEXT, created_at TEXT, updated_at TEXT,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE TABLE service_order_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              order_id INTEGER NOT NULL, product_id INTEGER, name TEXT NOT NULL,
              qty REAL NOT NULL, unit_price REAL DEFAULT 0, discount_pct REAL DEFAULT 0,
              line_total REAL DEFAULT 0, is_labor INTEGER DEFAULT 0,
              sort_order INTEGER DEFAULT 0, sync_id TEXT
            );
            CREATE TABLE delivery_notes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              note_number TEXT NOT NULL, customer_id INTEGER, destination TEXT,
              status TEXT DEFAULT 'draft', notes TEXT, issued_at TEXT,
              stock_applied INTEGER DEFAULT 0,
              sync_id TEXT, created_at TEXT, updated_at TEXT
            );
            CREATE TABLE delivery_note_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              note_id INTEGER NOT NULL, product_id INTEGER,
              name TEXT NOT NULL, qty REAL NOT NULL, sort_order INTEGER DEFAULT 0
            );
            CREATE TABLE vehicle_inspections (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              inspection_number TEXT NOT NULL, vehicle_id INTEGER NOT NULL,
              customer_id INTEGER, odometer_km INTEGER,
              fuel_level TEXT, exterior_condition TEXT, interior_condition TEXT,
              belongings TEXT, customer_reported TEXT, notes TEXT, received_by TEXT,
              service_order_id INTEGER,
              sync_id TEXT, created_at TEXT, updated_at TEXT
            );
            CREATE TABLE lan_sync_applied (
              event_id TEXT PRIMARY KEY, entity_type TEXT NOT NULL,
              applied_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE lan_sync_conflicts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              event_id TEXT NOT NULL UNIQUE, entity_type TEXT NOT NULL,
              entity_sync_id TEXT NOT NULL, op TEXT NOT NULL, payload TEXT,
              lamport INTEGER NOT NULL, origin_device TEXT NOT NULL,
              created_at TEXT NOT NULL, reason TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'open', resolved_at TEXT, resolution TEXT
            );
            CREATE TABLE lan_sync_pending_apply (
              event_id TEXT PRIMARY KEY, entity_type TEXT NOT NULL,
              entity_sync_id TEXT NOT NULL, op TEXT NOT NULL, payload TEXT,
              lamport INTEGER NOT NULL, origin_device TEXT NOT NULL,
              created_at TEXT NOT NULL, reason TEXT NOT NULL DEFAULT 'deferred',
              updated_at TEXT
            );
            ",
        )
        .unwrap();
        conn
    }

    fn make_event(entity_type: &str, sync_id: &str, payload: Value) -> SyncEvent {
        SyncEvent {
            event_id: format!("ev-{sync_id}"),
            entity_type: entity_type.into(),
            entity_sync_id: sync_id.into(),
            op: "upsert".into(),
            payload,
            lamport: 1,
            origin_device: "pc-remota".into(),
            created_at: "2026-08-26 10:00:00".into(),
        }
    }

    #[test]
    fn apply_quote_with_items_ok() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO customers (name, sync_id) VALUES ('Cliente A', 'cust1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO products (name, stock, sync_id) VALUES ('Filtro', 5, 'prod1')",
            [],
        )
        .unwrap();

        let ev = make_event(
            "quote",
            "quot1",
            json!({
                "quote_number": "P-0001",
                "status": "draft",
                "subtotal": 1000.0,
                "discount_pct": 0.0,
                "total": 1000.0,
                "customer_sync_id": "cust1",
                "items": [
                    {
                        "sync_id": "qi1",
                        "name": "Filtro",
                        "qty": 2.0,
                        "unit_price": 500.0,
                        "discount_pct": 0.0,
                        "line_total": 1000.0,
                        "sort_order": 0,
                        "product_sync_id": "prod1"
                    }
                ]
            }),
        );

        apply_quote(&conn, &ev).unwrap();

        let (quote_count, item_count): (i64, i64) = conn
            .query_row(
                "SELECT (SELECT COUNT(*) FROM quotes), (SELECT COUNT(*) FROM quote_items)",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(quote_count, 1);
        assert_eq!(item_count, 1);

        // Stock NO debe haber cambiado
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE sync_id='prod1'", [], |r| r.get(0))
            .unwrap();
        assert!((stock - 5.0).abs() < f64::EPSILON, "stock no debe cambiar al aplicar quote");
    }

    #[test]
    fn apply_service_order_stock_applied_not_deducted() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO customers (name, sync_id) VALUES ('Taller X', 'cust2')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO products (name, stock, sync_id) VALUES ('Aceite', 10, 'prod2')",
            [],
        )
        .unwrap();

        let ev = make_event(
            "service_order",
            "so1",
            json!({
                "order_number": "OT-0001",
                "title": "Service 5000km",
                "status": "open",
                "subtotal": 2000.0,
                "discount_pct": 0.0,
                "total": 2000.0,
                "stock_applied": 1,
                "customer_sync_id": "cust2",
                "items": [
                    {
                        "sync_id": "soi1",
                        "name": "Aceite",
                        "qty": 4.0,
                        "unit_price": 500.0,
                        "discount_pct": 0.0,
                        "line_total": 2000.0,
                        "is_labor": 0,
                        "sort_order": 0,
                        "product_sync_id": "prod2"
                    }
                ]
            }),
        );

        apply_service_order(&conn, &ev).unwrap();

        // stock_applied se guardó como metadata
        let sa: i64 = conn
            .query_row("SELECT stock_applied FROM service_orders WHERE sync_id='so1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(sa, 1);

        // Pero products.stock NO se tocó
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE sync_id='prod2'", [], |r| r.get(0))
            .unwrap();
        assert!((stock - 10.0).abs() < f64::EPSILON, "stock no debe cambiar al aplicar service_order");
    }

    #[test]
    fn apply_quote_deferred_if_customer_missing() {
        let conn = setup_db();

        let ev = make_event(
            "quote",
            "quot-miss",
            json!({
                "quote_number": "P-9999",
                "status": "draft",
                "subtotal": 0.0,
                "discount_pct": 0.0,
                "total": 0.0,
                "customer_sync_id": "cust-nonexistent",
                "items": []
            }),
        );

        let result = apply_quote(&conn, &ev);
        assert!(
            matches!(result, Err(LanSyncError::Dependency(_))),
            "debe deferir si el cliente no existe, got: {result:?}"
        );
    }

    #[test]
    fn apply_vehicle_inspection_deferred_if_vehicle_missing() {
        let conn = setup_db();

        let ev = make_event(
            "vehicle_inspection",
            "vi-miss",
            json!({
                "inspection_number": "PE-001",
                "vehicle_sync_id": "veh-nonexistent",
                "odometer_km": 50000
            }),
        );

        let result = apply_vehicle_inspection(&conn, &ev);
        assert!(
            matches!(result, Err(LanSyncError::Dependency(_))),
            "debe deferir si el vehículo no existe"
        );
    }
}
