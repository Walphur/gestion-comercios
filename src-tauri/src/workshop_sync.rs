use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use uuid::Uuid;

static LAST_IMPORT_COUNT: AtomicU32 = AtomicU32::new(0);
static LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SyncRole {
    Off,
    Workshop,
    Counter,
}

impl SyncRole {
    fn from_str(s: &str) -> Self {
        match s {
            "workshop" => SyncRole::Workshop,
            "counter" => SyncRole::Counter,
            _ => SyncRole::Off,
        }
    }

    fn label(self) -> &'static str {
        match self {
            SyncRole::Off => "Desactivada",
            SyncRole::Workshop => "PC taller (envía presupuestos; recibe clientes)",
            SyncRole::Counter => "PC mostrador (envía clientes; recibe taller)",
        }
    }
}

fn can_export_entity(role: SyncRole, entity_type: &str) -> bool {
    match role {
        SyncRole::Off => false,
        SyncRole::Workshop => true,
        SyncRole::Counter => entity_type == "customer",
    }
}

#[derive(Serialize)]
pub struct WorkshopSyncStatus {
    pub enabled: bool,
    pub role: String,
    pub role_label: String,
    pub device_id: String,
    pub folder_path: Option<String>,
    pub pending_exports: u32,
    pub last_import_count: u32,
    pub last_import_at: Option<String>,
    pub last_export_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct SyncPacket {
    version: u32,
    device_id: String,
    exported_at: String,
    entity: String,
    sync_id: String,
    op: String,
    payload: serde_json::Value,
}

fn read_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = $1",
        [key],
        |r| r.get(0),
    )
    .ok()
    .filter(|s: &String| !s.trim().is_empty())
}

fn write_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn ensure_device_id(conn: &Connection) -> Result<String, String> {
    if let Some(id) = read_setting(conn, "workshop_sync_device_id") {
        return Ok(id);
    }
    let id = Uuid::new_v4().to_string();
    write_setting(conn, "workshop_sync_device_id", &id)?;
    Ok(id)
}

pub fn get_sync_role(conn: &Connection) -> SyncRole {
    read_setting(conn, "workshop_sync_role")
        .map(|s| SyncRole::from_str(&s))
        .unwrap_or(SyncRole::Off)
}

fn new_sync_id() -> String {
    Uuid::new_v4().to_string()
}

fn ensure_entity_sync_id(
    conn: &Connection,
    table: &str,
    id: i64,
) -> Result<String, String> {
    let sql = format!("SELECT sync_id FROM {table} WHERE id = ?1");
    let existing: Option<String> = conn
        .query_row(&sql, [id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|s: &String| !s.is_empty());

    if let Some(sid) = existing {
        return Ok(sid);
    }

    let sid = new_sync_id();
    let upd = format!("UPDATE {table} SET sync_id = ?1 WHERE id = ?2");
    conn.execute(&upd, params![sid, id])
        .map_err(|e| e.to_string())?;
    Ok(sid)
}

pub fn queue_export(conn: &Connection, entity_type: &str, entity_id: i64) -> Result<(), String> {
    let role = get_sync_role(conn);
    if !can_export_entity(role, entity_type) {
        return Ok(());
    }
    conn.execute(
        "INSERT OR IGNORE INTO sync_export_queue (entity_type, entity_id) VALUES (?1, ?2)",
        params![entity_type, entity_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn queue_quote_dependencies(conn: &Connection, quote_id: i64) -> Result<(), String> {
    let row: Option<(Option<i64>, Option<i64>, Option<i64>)> = conn
        .query_row(
            "SELECT customer_id, vehicle_id, appointment_id FROM quotes WHERE id = ?1",
            [quote_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((cust, veh, appt)) = row {
        if let Some(id) = cust {
            queue_export(conn, "customer", id)?;
        }
        if let Some(id) = veh {
            queue_export(conn, "vehicle", id)?;
        }
        if let Some(id) = appt {
            queue_export(conn, "appointment", id)?;
        }
    }
    queue_export(conn, "quote", quote_id)
}

fn queue_order_dependencies(conn: &Connection, order_id: i64) -> Result<(), String> {
    let row: Option<(Option<i64>, Option<i64>, Option<i64>, Option<i64>)> = conn
        .query_row(
            "SELECT customer_id, vehicle_id, appointment_id, quote_id FROM service_orders WHERE id = ?1",
            [order_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((cust, veh, appt, quote)) = row {
        if let Some(id) = cust {
            queue_export(conn, "customer", id)?;
        }
        if let Some(id) = veh {
            queue_export(conn, "vehicle", id)?;
        }
        if let Some(id) = appt {
            queue_export(conn, "appointment", id)?;
        }
        if let Some(id) = quote {
            queue_quote_dependencies(conn, id)?;
        }
    }
    queue_export(conn, "service_order", order_id)
}

pub fn queue_export_smart(
    conn: &Connection,
    entity_type: &str,
    entity_id: i64,
) -> Result<(), String> {
    let role = get_sync_role(conn);
    if role == SyncRole::Off {
        return Ok(());
    }
    if role == SyncRole::Counter && entity_type != "customer" {
        return Ok(());
    }
    match entity_type {
        "quote" => queue_quote_dependencies(conn, entity_id),
        "service_order" => queue_order_dependencies(conn, entity_id),
        "vehicle" => {
            let cust: Option<i64> = conn
                .query_row(
                    "SELECT customer_id FROM vehicles WHERE id = ?1",
                    [entity_id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .flatten();
            if let Some(id) = cust {
                queue_export(conn, "customer", id)?;
            }
            queue_export(conn, "vehicle", entity_id)
        }
        "appointment" => {
            let row: Option<(Option<i64>, Option<i64>)> = conn
                .query_row(
                    "SELECT customer_id, vehicle_id FROM appointments WHERE id = ?1",
                    [entity_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            if let Some((cust, veh)) = row {
                if let Some(id) = cust {
                    queue_export(conn, "customer", id)?;
                }
                if let Some(id) = veh {
                    queue_export(conn, "vehicle", id)?;
                }
            }
            queue_export(conn, "appointment", entity_id)
        }
        _ => queue_export(conn, entity_type, entity_id),
    }
}

fn entity_priority(entity_type: &str) -> i32 {
    match entity_type {
        "customer" => 0,
        "vehicle" => 1,
        "appointment" => 2,
        "quote" => 3,
        "service_order" => 4,
        _ => 9,
    }
}

fn build_customer_payload(conn: &Connection, id: i64) -> Result<serde_json::Value, String> {
    let sync_id = ensure_entity_sync_id(conn, "customers", id)?;
    let row = conn
        .query_row(
            "SELECT name, phone, document, email, credit_limit, notes, active
             FROM customers WHERE id = ?1",
            [id],
            |r| {
                Ok(serde_json::json!({
                    "sync_id": sync_id,
                    "name": r.get::<_, String>(0)?,
                    "phone": r.get::<_, Option<String>>(1)?,
                    "document": r.get::<_, Option<String>>(2)?,
                    "email": r.get::<_, Option<String>>(3)?,
                    "credit_limit": r.get::<_, f64>(4)?,
                    "notes": r.get::<_, Option<String>>(5)?,
                    "active": r.get::<_, i32>(6)? == 1,
                }))
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(row)
}

fn build_vehicle_payload(conn: &Connection, id: i64) -> Result<serde_json::Value, String> {
    let sync_id = ensure_entity_sync_id(conn, "vehicles", id)?;
    let (
        customer_id,
        plate,
        brand,
        model,
        year,
        odometer_km,
        notes,
        active,
    ): (
        Option<i64>,
        String,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<i64>,
        Option<String>,
        i32,
    ) = conn
        .query_row(
            "SELECT customer_id, plate, brand, model, year, odometer_km, notes, active
             FROM vehicles WHERE id = ?1",
            [id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    let customer_sync_id = match customer_id {
        Some(cid) => Some(ensure_entity_sync_id(conn, "customers", cid)?),
        None => None,
    };
    Ok(serde_json::json!({
        "sync_id": sync_id,
        "customer_sync_id": customer_sync_id,
        "plate": plate,
        "brand": brand,
        "model": model,
        "year": year,
        "odometer_km": odometer_km,
        "notes": notes,
        "active": active == 1,
    }))
}

fn build_appointment_payload(conn: &Connection, id: i64) -> Result<serde_json::Value, String> {
    let sync_id = ensure_entity_sync_id(conn, "appointments", id)?;
    let (
        customer_id,
        vehicle_id,
        title,
        resource_name,
        subject_notes,
        status,
        starts_at,
        ends_at,
        notes,
    ): (
        Option<i64>,
        Option<i64>,
        String,
        Option<String>,
        Option<String>,
        String,
        String,
        String,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT customer_id, vehicle_id, title, resource_name, subject_notes, status,
                    starts_at, ends_at, notes
             FROM appointments WHERE id = ?1",
            [id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    let customer_sync_id = match customer_id {
        Some(cid) => Some(ensure_entity_sync_id(conn, "customers", cid)?),
        None => None,
    };
    let vehicle_sync_id = match vehicle_id {
        Some(vid) => Some(ensure_entity_sync_id(conn, "vehicles", vid)?),
        None => None,
    };
    Ok(serde_json::json!({
        "sync_id": sync_id,
        "customer_sync_id": customer_sync_id,
        "vehicle_sync_id": vehicle_sync_id,
        "title": title,
        "resource_name": resource_name,
        "subject_notes": subject_notes,
        "status": status,
        "starts_at": starts_at,
        "ends_at": ends_at,
        "notes": notes,
    }))
}

fn build_quote_payload(conn: &Connection, id: i64) -> Result<serde_json::Value, String> {
    let sync_id = ensure_entity_sync_id(conn, "quotes", id)?;
    let (
        quote_number,
        customer_id,
        vehicle_id,
        appointment_id,
        status,
        subtotal,
        discount_pct,
        total,
        notes,
        valid_until,
        updated_at,
    ): (
        String,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        String,
        f64,
        f64,
        f64,
        Option<String>,
        Option<String>,
        String,
    ) = conn
        .query_row(
            "SELECT quote_number, customer_id, vehicle_id, appointment_id, status,
                    subtotal, discount_pct, total, notes, valid_until, updated_at
             FROM quotes WHERE id = ?1",
            [id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                    r.get(9)?,
                    r.get(10)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    let customer_sync_id = match customer_id {
        Some(cid) => Some(ensure_entity_sync_id(conn, "customers", cid)?),
        None => None,
    };
    let vehicle_sync_id = match vehicle_id {
        Some(vid) => Some(ensure_entity_sync_id(conn, "vehicles", vid)?),
        None => None,
    };
    let appointment_sync_id = match appointment_id {
        Some(aid) => Some(ensure_entity_sync_id(conn, "appointments", aid)?),
        None => None,
    };
    let mut payload = serde_json::json!({
        "sync_id": sync_id,
        "quote_number": quote_number,
        "customer_sync_id": customer_sync_id,
        "vehicle_sync_id": vehicle_sync_id,
        "appointment_sync_id": appointment_sync_id,
        "status": status,
        "subtotal": subtotal,
        "discount_pct": discount_pct,
        "total": total,
        "notes": notes,
        "valid_until": valid_until,
        "updated_at": updated_at,
    });

    let mut items = Vec::new();
    let mut stmt = conn
        .prepare(
            "SELECT qi.name, qi.qty, qi.unit_price, qi.discount_pct, qi.line_total,
                    qi.sort_order, p.barcode
             FROM quote_items qi
             LEFT JOIN products p ON p.id = qi.product_id
             WHERE qi.quote_id = ?1
             ORDER BY qi.sort_order, qi.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([id], |r| {
            Ok(serde_json::json!({
                "name": r.get::<_, String>(0)?,
                "qty": r.get::<_, f64>(1)?,
                "unit_price": r.get::<_, f64>(2)?,
                "discount_pct": r.get::<_, f64>(3)?,
                "line_total": r.get::<_, f64>(4)?,
                "sort_order": r.get::<_, i32>(5)?,
                "barcode": r.get::<_, Option<String>>(6)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    if let Some(obj) = payload.as_object_mut() {
        obj.insert("items".to_string(), serde_json::Value::Array(items));
    }
    Ok(payload)
}

fn build_service_order_payload(conn: &Connection, id: i64) -> Result<serde_json::Value, String> {
    let sync_id = ensure_entity_sync_id(conn, "service_orders", id)?;
    let (
        order_number,
        customer_id,
        vehicle_id,
        appointment_id,
        quote_id,
        odometer_km,
        title,
        subject_notes,
        status,
        subtotal,
        discount_pct,
        total,
        notes,
        stock_applied,
        updated_at,
    ): (
        String,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        String,
        Option<String>,
        String,
        f64,
        f64,
        f64,
        Option<String>,
        i32,
        String,
    ) = conn
        .query_row(
            "SELECT order_number, customer_id, vehicle_id, appointment_id, quote_id,
                    odometer_km, title, subject_notes, status, subtotal, discount_pct,
                    total, notes, stock_applied, updated_at
             FROM service_orders WHERE id = ?1",
            [id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                    r.get(9)?,
                    r.get(10)?,
                    r.get(11)?,
                    r.get(12)?,
                    r.get(13)?,
                    r.get(14)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    let customer_sync_id = match customer_id {
        Some(cid) => Some(ensure_entity_sync_id(conn, "customers", cid)?),
        None => None,
    };
    let vehicle_sync_id = match vehicle_id {
        Some(vid) => Some(ensure_entity_sync_id(conn, "vehicles", vid)?),
        None => None,
    };
    let appointment_sync_id = match appointment_id {
        Some(aid) => Some(ensure_entity_sync_id(conn, "appointments", aid)?),
        None => None,
    };
    let quote_sync_id = match quote_id {
        Some(qid) => Some(ensure_entity_sync_id(conn, "quotes", qid)?),
        None => None,
    };
    let mut payload = serde_json::json!({
        "sync_id": sync_id,
        "order_number": order_number,
        "customer_sync_id": customer_sync_id,
        "vehicle_sync_id": vehicle_sync_id,
        "appointment_sync_id": appointment_sync_id,
        "quote_sync_id": quote_sync_id,
        "odometer_km": odometer_km,
        "title": title,
        "subject_notes": subject_notes,
        "status": status,
        "subtotal": subtotal,
        "discount_pct": discount_pct,
        "total": total,
        "notes": notes,
        "stock_applied": stock_applied == 1,
        "updated_at": updated_at,
    });

    let mut items = Vec::new();
    let mut stmt = conn
        .prepare(
            "SELECT soi.name, soi.qty, soi.unit_price, soi.discount_pct, soi.line_total,
                    soi.is_labor, soi.sort_order, p.barcode
             FROM service_order_items soi
             LEFT JOIN products p ON p.id = soi.product_id
             WHERE soi.order_id = ?1
             ORDER BY soi.sort_order, soi.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([id], |r| {
            Ok(serde_json::json!({
                "name": r.get::<_, String>(0)?,
                "qty": r.get::<_, f64>(1)?,
                "unit_price": r.get::<_, f64>(2)?,
                "discount_pct": r.get::<_, f64>(3)?,
                "line_total": r.get::<_, f64>(4)?,
                "is_labor": r.get::<_, i32>(5)? == 1,
                "sort_order": r.get::<_, i32>(6)?,
                "barcode": r.get::<_, Option<String>>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    if let Some(obj) = payload.as_object_mut() {
        obj.insert("items".to_string(), serde_json::Value::Array(items));
    }
    Ok(payload)
}

fn build_packet(
    conn: &Connection,
    device_id: &str,
    entity_type: &str,
    entity_id: i64,
) -> Result<SyncPacket, String> {
    let payload = match entity_type {
        "customer" => build_customer_payload(conn, entity_id)?,
        "vehicle" => build_vehicle_payload(conn, entity_id)?,
        "appointment" => build_appointment_payload(conn, entity_id)?,
        "quote" => build_quote_payload(conn, entity_id)?,
        "service_order" => build_service_order_payload(conn, entity_id)?,
        _ => return Err(format!("Tipo de entidad desconocido: {entity_type}")),
    };
    let sync_id = payload
        .get("sync_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(SyncPacket {
        version: 1,
        device_id: device_id.to_string(),
        exported_at: chrono_like_now(),
        entity: entity_type.to_string(),
        sync_id,
        op: "upsert".to_string(),
        payload,
    })
}

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    format!("{secs}")
}

fn outbox_dir(folder: &Path, device_id: &str) -> PathBuf {
    folder.join("outbox").join(device_id)
}

fn write_packet_file(dir: &Path, packet: &SyncPacket) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let fname = format!(
        "{}_{}_{}.json",
        packet.exported_at, packet.entity, packet.sync_id
    );
    let path = dir.join(&fname);
    let tmp = dir.join(format!("{fname}.tmp"));
    let json = serde_json::to_string_pretty(packet).map_err(|e| e.to_string())?;
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn flush_exports(conn: &Connection) -> Result<u32, String> {
    if get_sync_role(conn) == SyncRole::Off {
        return Ok(0);
    }
    let folder = match read_setting(conn, "workshop_sync_folder") {
        Some(p) => PathBuf::from(p),
        None => return Ok(0),
    };
    if !folder.exists() {
        return Err("La carpeta de sincronización no existe.".into());
    }

    let device_id = ensure_device_id(conn)?;
    let outbox = outbox_dir(&folder, &device_id);

    let mut rows: Vec<(i64, String, i64)> = conn
        .prepare("SELECT id, entity_type, entity_id FROM sync_export_queue")
        .map_err(|e| e.to_string())?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    rows.sort_by(|a, b| {
        entity_priority(&a.1)
            .cmp(&entity_priority(&b.1))
            .then(a.0.cmp(&b.0))
    });

    let mut count = 0u32;
    for (queue_id, entity_type, entity_id) in rows {
        match build_packet(conn, &device_id, &entity_type, entity_id) {
            Ok(packet) => {
                write_packet_file(&outbox, &packet)?;
                conn.execute(
                    "DELETE FROM sync_export_queue WHERE id = ?1",
                    [queue_id],
                )
                .map_err(|e| e.to_string())?;
                count += 1;
            }
            Err(e) => {
                *LAST_ERROR.lock().unwrap() = Some(e);
            }
        }
    }

    if count > 0 {
        write_setting(conn, "workshop_sync_last_export_at", &chrono_like_now())?;
    }
    Ok(count)
}

fn resolve_local_id_by_sync_id(
    conn: &Connection,
    table: &str,
    sync_id: &str,
) -> Result<Option<i64>, String> {
    let sql = format!("SELECT id FROM {table} WHERE sync_id = ?1");
    conn.query_row(&sql, [sync_id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())
}

fn resolve_product_id(conn: &Connection, barcode: &Option<String>) -> Option<i64> {
    let code = barcode.as_ref()?.trim();
    if code.is_empty() {
        return None;
    }
    conn.query_row(
        "SELECT id FROM products WHERE barcode = ?1 AND active = 1 LIMIT 1",
        [code],
        |r| r.get(0),
    )
    .optional()
    .ok()
    .flatten()
}

fn import_customer(conn: &Connection, payload: &serde_json::Value) -> Result<(), String> {
    let sync_id = payload["sync_id"].as_str().ok_or("sync_id faltante")?;
    let name = payload["name"].as_str().ok_or("nombre faltante")?;

    if let Some(id) = resolve_local_id_by_sync_id(conn, "customers", sync_id)? {
        conn.execute(
            "UPDATE customers SET name=?1, phone=?2, document=?3, email=?4,
             credit_limit=?5, notes=?6, active=?7 WHERE id=?8",
            params![
                name,
                payload["phone"].as_str(),
                payload["document"].as_str(),
                payload["email"].as_str(),
                payload["credit_limit"].as_f64().unwrap_or(0.0),
                payload["notes"].as_str(),
                if payload["active"].as_bool().unwrap_or(true) {
                    1
                } else {
                    0
                },
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    if let Some(phone) = payload["phone"].as_str().filter(|s| !s.is_empty()) {
        if let Ok(id) = conn.query_row(
            "SELECT id FROM customers WHERE phone = ?1 LIMIT 1",
            [phone],
            |r| r.get::<_, i64>(0),
        ) {
            conn.execute(
                "UPDATE customers SET sync_id=?1, name=?2, document=?3, email=?4, notes=?5 WHERE id=?6",
                params![
                    sync_id,
                    name,
                    payload["document"].as_str(),
                    payload["email"].as_str(),
                    payload["notes"].as_str(),
                    id
                ],
            )
            .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    conn.execute(
        "INSERT INTO customers (sync_id, name, phone, document, email, credit_limit, notes, active, balance)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0)",
        params![
            sync_id,
            name,
            payload["phone"].as_str(),
            payload["document"].as_str(),
            payload["email"].as_str(),
            payload["credit_limit"].as_f64().unwrap_or(0.0),
            payload["notes"].as_str(),
            if payload["active"].as_bool().unwrap_or(true) {
                1
            } else {
                0
            },
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn import_vehicle(conn: &Connection, payload: &serde_json::Value) -> Result<(), String> {
    let sync_id = payload["sync_id"].as_str().ok_or("sync_id faltante")?;
    let plate = payload["plate"].as_str().ok_or("patente faltante")?;

    let customer_local = payload["customer_sync_id"]
        .as_str()
        .and_then(|sid| resolve_local_id_by_sync_id(conn, "customers", sid).ok().flatten());

    if let Some(id) = resolve_local_id_by_sync_id(conn, "vehicles", sync_id)? {
        conn.execute(
            "UPDATE vehicles SET customer_id=?1, plate=?2, brand=?3, model=?4, year=?5,
             odometer_km=?6, notes=?7, active=?8,
             updated_at=datetime('now','localtime') WHERE id=?9",
            params![
                customer_local,
                plate,
                payload["brand"].as_str(),
                payload["model"].as_str(),
                payload["year"].as_i64(),
                payload["odometer_km"].as_i64(),
                payload["notes"].as_str(),
                if payload["active"].as_bool().unwrap_or(true) {
                    1
                } else {
                    0
                },
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    conn.execute(
        "INSERT INTO vehicles (sync_id, customer_id, plate, brand, model, year, odometer_km, notes, active)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![
            sync_id,
            customer_local,
            plate,
            payload["brand"].as_str(),
            payload["model"].as_str(),
            payload["year"].as_i64(),
            payload["odometer_km"].as_i64(),
            payload["notes"].as_str(),
            if payload["active"].as_bool().unwrap_or(true) {
                1
            } else {
                0
            },
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn import_appointment(conn: &Connection, payload: &serde_json::Value) -> Result<(), String> {
    let sync_id = payload["sync_id"].as_str().ok_or("sync_id faltante")?;
    let customer_local = payload["customer_sync_id"]
        .as_str()
        .and_then(|sid| resolve_local_id_by_sync_id(conn, "customers", sid).ok().flatten());
    let vehicle_local = payload["vehicle_sync_id"]
        .as_str()
        .and_then(|sid| resolve_local_id_by_sync_id(conn, "vehicles", sid).ok().flatten());

    if let Some(id) = resolve_local_id_by_sync_id(conn, "appointments", sync_id)? {
        conn.execute(
            "UPDATE appointments SET customer_id=?1, vehicle_id=?2, title=?3, resource_name=?4,
             subject_notes=?5, status=?6, starts_at=?7, ends_at=?8, notes=?9,
             updated_at=datetime('now','localtime') WHERE id=?10",
            params![
                customer_local,
                vehicle_local,
                payload["title"].as_str().ok_or("título faltante")?,
                payload["resource_name"].as_str(),
                payload["subject_notes"].as_str(),
                payload["status"].as_str().unwrap_or("scheduled"),
                payload["starts_at"].as_str().ok_or("starts_at faltante")?,
                payload["ends_at"].as_str().ok_or("ends_at faltante")?,
                payload["notes"].as_str(),
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    conn.execute(
        "INSERT INTO appointments (sync_id, customer_id, vehicle_id, title, resource_name,
         subject_notes, status, starts_at, ends_at, notes)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            sync_id,
            customer_local,
            vehicle_local,
            payload["title"].as_str().ok_or("título faltante")?,
            payload["resource_name"].as_str(),
            payload["subject_notes"].as_str(),
            payload["status"].as_str().unwrap_or("scheduled"),
            payload["starts_at"].as_str().ok_or("starts_at faltante")?,
            payload["ends_at"].as_str().ok_or("ends_at faltante")?,
            payload["notes"].as_str(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn import_quote(conn: &Connection, payload: &serde_json::Value) -> Result<(), String> {
    let sync_id = payload["sync_id"].as_str().ok_or("sync_id faltante")?;
    let customer_local = payload["customer_sync_id"]
        .as_str()
        .and_then(|sid| resolve_local_id_by_sync_id(conn, "customers", sid).ok().flatten());
    let vehicle_local = payload["vehicle_sync_id"]
        .as_str()
        .and_then(|sid| resolve_local_id_by_sync_id(conn, "vehicles", sid).ok().flatten());
    let appointment_local = payload["appointment_sync_id"]
        .as_str()
        .and_then(|sid| resolve_local_id_by_sync_id(conn, "appointments", sid).ok().flatten());

    let quote_id = if let Some(id) = resolve_local_id_by_sync_id(conn, "quotes", sync_id)? {
        conn.execute(
            "UPDATE quotes SET quote_number=?1, customer_id=?2, vehicle_id=?3, appointment_id=?4,
             status=?5, subtotal=?6, discount_pct=?7, total=?8, notes=?9, valid_until=?10,
             updated_at=datetime('now','localtime') WHERE id=?11",
            params![
                payload["quote_number"].as_str().ok_or("quote_number faltante")?,
                customer_local,
                vehicle_local,
                appointment_local,
                payload["status"].as_str().unwrap_or("draft"),
                payload["subtotal"].as_f64().unwrap_or(0.0),
                payload["discount_pct"].as_f64().unwrap_or(0.0),
                payload["total"].as_f64().unwrap_or(0.0),
                payload["notes"].as_str(),
                payload["valid_until"].as_str(),
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM quote_items WHERE quote_id = ?1", [id])
            .map_err(|e| e.to_string())?;
        id
    } else {
        conn.execute(
            "INSERT INTO quotes (sync_id, quote_number, customer_id, vehicle_id, appointment_id,
             status, subtotal, discount_pct, total, notes, valid_until)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                sync_id,
                payload["quote_number"].as_str().ok_or("quote_number faltante")?,
                customer_local,
                vehicle_local,
                appointment_local,
                payload["status"].as_str().unwrap_or("draft"),
                payload["subtotal"].as_f64().unwrap_or(0.0),
                payload["discount_pct"].as_f64().unwrap_or(0.0),
                payload["total"].as_f64().unwrap_or(0.0),
                payload["notes"].as_str(),
                payload["valid_until"].as_str(),
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };

    if let Some(items) = payload["items"].as_array() {
        for (i, it) in items.iter().enumerate() {
            let barcode = it["barcode"].as_str().map(|s| s.to_string());
            let product_id = resolve_product_id(conn, &barcode);
            conn.execute(
                "INSERT INTO quote_items (quote_id, product_id, name, qty, unit_price,
                 discount_pct, line_total, sort_order)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    quote_id,
                    product_id,
                    it["name"].as_str().unwrap_or("Ítem"),
                    it["qty"].as_f64().unwrap_or(1.0),
                    it["unit_price"].as_f64().unwrap_or(0.0),
                    it["discount_pct"].as_f64().unwrap_or(0.0),
                    it["line_total"].as_f64().unwrap_or(0.0),
                    it["sort_order"].as_i64().unwrap_or(i as i64) as i32,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn import_service_order(conn: &Connection, payload: &serde_json::Value) -> Result<(), String> {
    let sync_id = payload["sync_id"].as_str().ok_or("sync_id faltante")?;
    let customer_local = payload["customer_sync_id"]
        .as_str()
        .and_then(|sid| resolve_local_id_by_sync_id(conn, "customers", sid).ok().flatten());
    let vehicle_local = payload["vehicle_sync_id"]
        .as_str()
        .and_then(|sid| resolve_local_id_by_sync_id(conn, "vehicles", sid).ok().flatten());
    let appointment_local = payload["appointment_sync_id"]
        .as_str()
        .and_then(|sid| resolve_local_id_by_sync_id(conn, "appointments", sid).ok().flatten());
    let quote_local = payload["quote_sync_id"]
        .as_str()
        .and_then(|sid| resolve_local_id_by_sync_id(conn, "quotes", sid).ok().flatten());

    let order_id = if let Some(id) = resolve_local_id_by_sync_id(conn, "service_orders", sync_id)? {
        conn.execute(
            "UPDATE service_orders SET order_number=?1, customer_id=?2, vehicle_id=?3,
             appointment_id=?4, quote_id=?5, odometer_km=?6, title=?7, subject_notes=?8,
             status=?9, subtotal=?10, discount_pct=?11, total=?12, notes=?13,
             updated_at=datetime('now','localtime') WHERE id=?14",
            params![
                payload["order_number"].as_str().ok_or("order_number faltante")?,
                customer_local,
                vehicle_local,
                appointment_local,
                quote_local,
                payload["odometer_km"].as_i64(),
                payload["title"].as_str().ok_or("título faltante")?,
                payload["subject_notes"].as_str(),
                payload["status"].as_str().unwrap_or("pending"),
                payload["subtotal"].as_f64().unwrap_or(0.0),
                payload["discount_pct"].as_f64().unwrap_or(0.0),
                payload["total"].as_f64().unwrap_or(0.0),
                payload["notes"].as_str(),
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM service_order_items WHERE order_id = ?1", [id])
            .map_err(|e| e.to_string())?;
        id
    } else {
        conn.execute(
            "INSERT INTO service_orders (sync_id, order_number, customer_id, vehicle_id,
             appointment_id, quote_id, odometer_km, title, subject_notes, status,
             subtotal, discount_pct, total, notes, stock_applied)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,0)",
            params![
                sync_id,
                payload["order_number"].as_str().ok_or("order_number faltante")?,
                customer_local,
                vehicle_local,
                appointment_local,
                quote_local,
                payload["odometer_km"].as_i64(),
                payload["title"].as_str().ok_or("título faltante")?,
                payload["subject_notes"].as_str(),
                payload["status"].as_str().unwrap_or("pending"),
                payload["subtotal"].as_f64().unwrap_or(0.0),
                payload["discount_pct"].as_f64().unwrap_or(0.0),
                payload["total"].as_f64().unwrap_or(0.0),
                payload["notes"].as_str(),
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };

    if let Some(items) = payload["items"].as_array() {
        for (i, it) in items.iter().enumerate() {
            let barcode = it["barcode"].as_str().map(|s| s.to_string());
            let product_id = resolve_product_id(conn, &barcode);
            conn.execute(
                "INSERT INTO service_order_items (order_id, product_id, name, qty, unit_price,
                 discount_pct, line_total, is_labor, sort_order)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    order_id,
                    product_id,
                    it["name"].as_str().unwrap_or("Ítem"),
                    it["qty"].as_f64().unwrap_or(1.0),
                    it["unit_price"].as_f64().unwrap_or(0.0),
                    it["discount_pct"].as_f64().unwrap_or(0.0),
                    it["line_total"].as_f64().unwrap_or(0.0),
                    if it["is_labor"].as_bool().unwrap_or(false) {
                        1
                    } else {
                        0
                    },
                    it["sort_order"].as_i64().unwrap_or(i as i64) as i32,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn import_packet(conn: &Connection, packet: &SyncPacket) -> Result<(), String> {
    if packet.op != "upsert" {
        return Ok(());
    }
    match packet.entity.as_str() {
        "customer" => import_customer(conn, &packet.payload),
        "vehicle" => import_vehicle(conn, &packet.payload),
        "appointment" => import_appointment(conn, &packet.payload),
        "quote" => import_quote(conn, &packet.payload),
        "service_order" => import_service_order(conn, &packet.payload),
        _ => Ok(()),
    }
}

pub fn import_inbox(conn: &Connection) -> Result<u32, String> {
    if get_sync_role(conn) == SyncRole::Off {
        return Ok(0);
    }
    let folder = match read_setting(conn, "workshop_sync_folder") {
        Some(p) => PathBuf::from(p),
        None => return Ok(0),
    };
    if !folder.exists() {
        return Err("La carpeta de sincronización no existe.".into());
    }

    let device_id = ensure_device_id(conn)?;
    let outbox_root = folder.join("outbox");
    if !outbox_root.exists() {
        return Ok(0);
    }

    let mut files: Vec<PathBuf> = Vec::new();
    for entry in fs::read_dir(&outbox_root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if dir_name == device_id {
            continue;
        }
        for f in fs::read_dir(&path).map_err(|e| e.to_string())? {
            let f = f.map_err(|e| e.to_string())?;
            let fp = f.path();
            if fp.extension().and_then(|e| e.to_str()) == Some("json") {
                files.push(fp);
            }
        }
    }

    files.sort();

    let mut imported = 0u32;
    for file_path in files {
        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if file_name.is_empty() {
            continue;
        }

        let already: bool = conn
            .query_row(
                "SELECT 1 FROM sync_import_log WHERE file_name = ?1",
                [&file_name],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if already {
            continue;
        }

        let raw = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
        let packet: SyncPacket = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        if packet.device_id == device_id {
            continue;
        }

        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        match import_packet(&tx, &packet) {
            Ok(()) => {
                tx.execute(
                    "INSERT INTO sync_import_log (file_name, entity_type, sync_id) VALUES (?1,?2,?3)",
                    params![file_name, packet.entity, packet.sync_id],
                )
                .map_err(|e| e.to_string())?;
                tx.commit().map_err(|e| e.to_string())?;
                imported += 1;
            }
            Err(e) => {
                let _ = tx.rollback();
                *LAST_ERROR.lock().unwrap() = Some(format!("{file_name}: {e}"));
            }
        }
    }

    if imported > 0 {
        write_setting(conn, "workshop_sync_last_import_at", &chrono_like_now())?;
        LAST_IMPORT_COUNT.store(imported, Ordering::Relaxed);
    }
    Ok(imported)
}

pub fn run_sync_cycle(conn: &Connection) -> Result<(), String> {
    if get_sync_role(conn) == SyncRole::Off {
        return Ok(());
    }
    flush_exports(conn)?;
    import_inbox(conn)?;
    Ok(())
}

pub fn get_status(conn: &Connection) -> Result<WorkshopSyncStatus, String> {
    let role = get_sync_role(conn);
    let device_id = ensure_device_id(conn)?;
    let pending: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_export_queue",
            [],
            |r| r.get::<_, u32>(0),
        )
        .unwrap_or(0);

    let last_import_at = read_setting(conn, "workshop_sync_last_import_at");
    let last_export_at = read_setting(conn, "workshop_sync_last_export_at");

    Ok(WorkshopSyncStatus {
        enabled: role != SyncRole::Off,
        role: match role {
            SyncRole::Off => "off".into(),
            SyncRole::Workshop => "workshop".into(),
            SyncRole::Counter => "counter".into(),
        },
        role_label: role.label().into(),
        device_id,
        folder_path: read_setting(conn, "workshop_sync_folder"),
        pending_exports: pending,
        last_import_count: LAST_IMPORT_COUNT.load(Ordering::Relaxed),
        last_import_at,
        last_export_at,
        last_error: LAST_ERROR.lock().unwrap().clone(),
    })
}

pub fn set_sync_config(
    conn: &Connection,
    role: &str,
    folder: Option<&str>,
) -> Result<(), String> {
    write_setting(conn, "workshop_sync_role", role)?;
    if let Some(f) = folder {
        write_setting(conn, "workshop_sync_folder", f)?;
        let p = PathBuf::from(f);
        fs::create_dir_all(p.join("outbox")).map_err(|e| e.to_string())?;
    }
    let _ = ensure_device_id(conn)?;
    Ok(())
}

static WORKSHOP_SYNC_RUNNING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

pub fn spawn_workshop_sync_worker(interval_secs: u64) {
    if WORKSHOP_SYNC_RUNNING.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(8));
        loop {
            if let Ok(path) = crate::db_path::get_db_path() {
                if let Ok(conn) = Connection::open(&path) {
                    let _ = conn.busy_timeout(Duration::from_secs(30));
                    if let Err(e) = run_sync_cycle(&conn) {
                        *LAST_ERROR.lock().unwrap() = Some(e);
                    }
                }
            }
            thread::sleep(Duration::from_secs(interval_secs.max(60)));
        }
    });
}
