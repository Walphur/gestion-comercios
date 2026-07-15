use crate::settings_util::write_setting;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use super::conflict::{payload_updated_at, ConflictPolicy, LastWriteWins};
use super::errors::{LanResult, LanSyncError};
use super::outbox::bump_lamport_at_least;
use super::protocol::SyncEvent;

/// Aplica un evento remoto/local en la DB. Idempotente por `event_id`.
///
/// - product: **no** sobrescribe `stock` (usar stock_movement).
/// - sale: upsert + items; **no** toca stock.
/// - stock_movement: si es nuevo, inserta y suma `qty` (ya firmada) a `products.stock`.
pub fn apply_event(conn: &Connection, event: &SyncEvent) -> LanResult<bool> {
    let already: Option<String> = conn
        .query_row(
            "SELECT event_id FROM lan_sync_applied WHERE event_id = ?1",
            [&event.event_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?;
    if already.is_some() {
        return Ok(false);
    }

    write_setting(conn, "lan_sync_applying", "1").map_err(LanSyncError::db)?;
    let result = apply_event_inner(conn, event);
    let _ = write_setting(conn, "lan_sync_applying", "0");
    result?;

    conn.execute(
        "INSERT OR IGNORE INTO lan_sync_applied (event_id, entity_type) VALUES (?1, ?2)",
        params![event.event_id, event.entity_type],
    )
    .map_err(LanSyncError::db)?;

    bump_lamport_at_least(conn, event.lamport)?;
    Ok(true)
}

fn apply_event_inner(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    if event.op == "delete" {
        return apply_delete(conn, event);
    }
    match event.entity_type.as_str() {
        "category" => apply_category(conn, event),
        "supplier" => apply_supplier(conn, event),
        "customer" => apply_customer(conn, event),
        "product" => apply_product(conn, event),
        "sale" => apply_sale(conn, event),
        "stock_movement" => apply_stock_movement(conn, event),
        other => Err(LanSyncError::Protocol(format!(
            "entity_type no soportado: {other}"
        ))),
    }
}

fn apply_delete(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    match event.entity_type.as_str() {
        "category" => {
            conn.execute(
                "DELETE FROM categories WHERE sync_id = ?1",
                [&event.entity_sync_id],
            )
            .map_err(LanSyncError::db)?;
        }
        "supplier" => {
            conn.execute(
                "DELETE FROM suppliers WHERE sync_id = ?1",
                [&event.entity_sync_id],
            )
            .map_err(LanSyncError::db)?;
        }
        "customer" => {
            conn.execute(
                "UPDATE customers SET active = 0, updated_at = datetime('now','localtime') WHERE sync_id = ?1",
                [&event.entity_sync_id],
            )
            .map_err(LanSyncError::db)?;
        }
        "product" => {
            conn.execute(
                "UPDATE products SET active = 0, updated_at = datetime('now','localtime') WHERE sync_id = ?1",
                [&event.entity_sync_id],
            )
            .map_err(LanSyncError::db)?;
        }
        _ => {}
    }
    Ok(())
}

fn str_field<'a>(payload: &'a Value, key: &str) -> Option<&'a str> {
    payload.get(key).and_then(|v| v.as_str())
}

fn f64_field(payload: &Value, key: &str, default: f64) -> f64 {
    payload
        .get(key)
        .and_then(|v| v.as_f64())
        .unwrap_or(default)
}

fn i64_field(payload: &Value, key: &str, default: i64) -> i64 {
    payload
        .get(key)
        .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
        .unwrap_or(default)
}

fn resolve_id_by_sync(conn: &Connection, table: &str, sync_id: Option<&str>) -> LanResult<Option<i64>> {
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

fn apply_category(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let name = str_field(p, "name").unwrap_or("Sin nombre");
    let updated_at = payload_updated_at(p);
    let created_at = str_field(p, "created_at");

    let existing: Option<(i64, Option<String>)> = conn
        .query_row(
            "SELECT id, updated_at FROM categories WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    if let Some((id, local_ua)) = existing {
        if !LastWriteWins.should_accept_remote(
            updated_at,
            event.lamport,
            local_ua.as_deref(),
            0,
        ) {
            return Ok(());
        }
        conn.execute(
            "UPDATE categories SET name = ?1, updated_at = COALESCE(?2, datetime('now','localtime')) WHERE id = ?3",
            params![name, updated_at, id],
        )
        .map_err(LanSyncError::db)?;
    } else {
        // Conflicto de nombre UNIQUE: actualizar fila existente con ese nombre
        let by_name: Option<i64> = conn
            .query_row(
                "SELECT id FROM categories WHERE name = ?1",
                [name],
                |r| r.get(0),
            )
            .optional()
            .map_err(LanSyncError::db)?;
        if let Some(id) = by_name {
            conn.execute(
                "UPDATE categories SET sync_id = ?1, updated_at = COALESCE(?2, datetime('now','localtime')) WHERE id = ?3",
                params![event.entity_sync_id, updated_at, id],
            )
            .map_err(LanSyncError::db)?;
        } else {
            conn.execute(
                "INSERT INTO categories (name, sync_id, created_at, updated_at)
                 VALUES (?1, ?2, COALESCE(?3, datetime('now','localtime')), COALESCE(?4, datetime('now','localtime')))",
                params![name, event.entity_sync_id, created_at, updated_at],
            )
            .map_err(LanSyncError::db)?;
        }
    }
    Ok(())
}

fn apply_supplier(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let name = str_field(p, "name").unwrap_or("Sin nombre");
    let phone = str_field(p, "phone");
    let notes = str_field(p, "notes");
    let updated_at = payload_updated_at(p);
    let created_at = str_field(p, "created_at");

    let existing: Option<(i64, Option<String>)> = conn
        .query_row(
            "SELECT id, updated_at FROM suppliers WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    if let Some((id, local_ua)) = existing {
        if !LastWriteWins.should_accept_remote(
            updated_at,
            event.lamport,
            local_ua.as_deref(),
            0,
        ) {
            return Ok(());
        }
        conn.execute(
            "UPDATE suppliers SET name = ?1, phone = ?2, notes = ?3,
             updated_at = COALESCE(?4, datetime('now','localtime')) WHERE id = ?5",
            params![name, phone, notes, updated_at, id],
        )
        .map_err(LanSyncError::db)?;
    } else {
        let by_name: Option<i64> = conn
            .query_row("SELECT id FROM suppliers WHERE name = ?1", [name], |r| r.get(0))
            .optional()
            .map_err(LanSyncError::db)?;
        if let Some(id) = by_name {
            conn.execute(
                "UPDATE suppliers SET sync_id = ?1, phone = ?2, notes = ?3,
                 updated_at = COALESCE(?4, datetime('now','localtime')) WHERE id = ?5",
                params![event.entity_sync_id, phone, notes, updated_at, id],
            )
            .map_err(LanSyncError::db)?;
        } else {
            conn.execute(
                "INSERT INTO suppliers (name, phone, notes, sync_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, COALESCE(?5, datetime('now','localtime')), COALESCE(?6, datetime('now','localtime')))",
                params![name, phone, notes, event.entity_sync_id, created_at, updated_at],
            )
            .map_err(LanSyncError::db)?;
        }
    }
    Ok(())
}

fn apply_customer(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let name = str_field(p, "name").unwrap_or("Sin nombre");
    let phone = str_field(p, "phone");
    let document = str_field(p, "document");
    let email = str_field(p, "email");
    let credit_limit = f64_field(p, "credit_limit", 0.0);
    let balance = f64_field(p, "balance", 0.0);
    let notes = str_field(p, "notes");
    let active = i64_field(p, "active", 1);
    let updated_at = payload_updated_at(p);
    let created_at = str_field(p, "created_at");

    let existing: Option<(i64, Option<String>)> = conn
        .query_row(
            "SELECT id, updated_at FROM customers WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    if let Some((id, local_ua)) = existing {
        if !LastWriteWins.should_accept_remote(
            updated_at,
            event.lamport,
            local_ua.as_deref(),
            0,
        ) {
            return Ok(());
        }
        conn.execute(
            "UPDATE customers SET name = ?1, phone = ?2, document = ?3, email = ?4,
             credit_limit = ?5, balance = ?6, notes = ?7, active = ?8,
             updated_at = COALESCE(?9, datetime('now','localtime')) WHERE id = ?10",
            params![
                name,
                phone,
                document,
                email,
                credit_limit,
                balance,
                notes,
                active,
                updated_at,
                id
            ],
        )
        .map_err(LanSyncError::db)?;
    } else {
        conn.execute(
            "INSERT INTO customers (name, phone, document, email, credit_limit, balance, notes, active, sync_id, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9, COALESCE(?10, datetime('now','localtime')), COALESCE(?11, datetime('now','localtime')))",
            params![
                name,
                phone,
                document,
                email,
                credit_limit,
                balance,
                notes,
                active,
                event.entity_sync_id,
                created_at,
                updated_at
            ],
        )
        .map_err(LanSyncError::db)?;
    }
    Ok(())
}

fn apply_product(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let name = str_field(p, "name").unwrap_or("Sin nombre");
    let sku = str_field(p, "sku");
    let barcode = str_field(p, "barcode");
    let description = str_field(p, "description");
    let cost = f64_field(p, "cost", 0.0);
    let price = f64_field(p, "price", 0.0);
    let min_stock = f64_field(p, "min_stock", 0.0);
    let unit = str_field(p, "unit").unwrap_or("unidad");
    let tax_rate = f64_field(p, "tax_rate", 21.0);
    let active = i64_field(p, "active", 1);
    let updated_at = payload_updated_at(p);
    let created_at = str_field(p, "created_at");
    let category_id = resolve_id_by_sync(conn, "categories", str_field(p, "category_sync_id"))?;
    let supplier_id = resolve_id_by_sync(conn, "suppliers", str_field(p, "supplier_sync_id"))?;

    let existing: Option<(i64, Option<String>)> = conn
        .query_row(
            "SELECT id, updated_at FROM products WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    if let Some((id, local_ua)) = existing {
        if !LastWriteWins.should_accept_remote(
            updated_at,
            event.lamport,
            local_ua.as_deref(),
            0,
        ) {
            return Ok(());
        }
        // NO tocar stock — el payload puede traerlo solo como info.
        conn.execute(
            "UPDATE products SET sku = ?1, barcode = ?2, name = ?3, description = ?4,
             category_id = ?5, supplier_id = ?6, cost = ?7, price = ?8,
             min_stock = ?9, unit = ?10, tax_rate = ?11, active = ?12,
             updated_at = COALESCE(?13, datetime('now','localtime'))
             WHERE id = ?14",
            params![
                sku,
                barcode,
                name,
                description,
                category_id,
                supplier_id,
                cost,
                price,
                min_stock,
                unit,
                tax_rate,
                active,
                updated_at,
                id
            ],
        )
        .map_err(LanSyncError::db)?;
    } else {
        // Alta: stock inicial 0; movimientos remontan el inventario.
        conn.execute(
            "INSERT INTO products (sku, barcode, name, description, category_id, supplier_id,
             cost, price, stock, min_stock, unit, tax_rate, active, sync_id, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,?9,?10,?11,?12,?13,
                     COALESCE(?14, datetime('now','localtime')),
                     COALESCE(?15, datetime('now','localtime')))",
            params![
                sku,
                barcode,
                name,
                description,
                category_id,
                supplier_id,
                cost,
                price,
                min_stock,
                unit,
                tax_rate,
                active,
                event.entity_sync_id,
                created_at,
                updated_at
            ],
        )
        .map_err(LanSyncError::db)?;
    }
    Ok(())
}

fn apply_sale(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let subtotal = f64_field(p, "subtotal", 0.0);
    let discount_pct = f64_field(p, "discount_pct", 0.0);
    let total = f64_field(p, "total", 0.0);
    let payment_method = str_field(p, "payment_method").unwrap_or("efectivo");
    let paid = p.get("paid").and_then(|v| v.as_f64());
    let change_due = p.get("change_due").and_then(|v| v.as_f64());
    let voided = i64_field(p, "voided", 0);
    let created_at = str_field(p, "created_at");
    let updated_at = payload_updated_at(p);
    let customer_id = resolve_id_by_sync(conn, "customers", str_field(p, "customer_sync_id"))?;

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM sales WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    let sale_id = if let Some(id) = existing {
        conn.execute(
            "UPDATE sales SET subtotal = ?1, discount_pct = ?2, total = ?3, payment_method = ?4,
             paid = ?5, change_due = ?6, voided = ?7, customer_id = ?8,
             updated_at = COALESCE(?9, datetime('now','localtime'))
             WHERE id = ?10",
            params![
                subtotal,
                discount_pct,
                total,
                payment_method,
                paid,
                change_due,
                voided,
                customer_id,
                updated_at,
                id
            ],
        )
        .map_err(LanSyncError::db)?;
        id
    } else {
        conn.execute(
            "INSERT INTO sales (subtotal, discount_pct, total, payment_method, paid, change_due,
             voided, customer_id, sync_id, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,
                     COALESCE(?10, datetime('now','localtime')),
                     COALESCE(?11, datetime('now','localtime')))",
            params![
                subtotal,
                discount_pct,
                total,
                payment_method,
                paid,
                change_due,
                voided,
                customer_id,
                event.entity_sync_id,
                created_at,
                updated_at
            ],
        )
        .map_err(LanSyncError::db)?;
        conn.last_insert_rowid()
    };

    // Reemplazar items por sync_id sin tocar stock.
    if let Some(items) = p.get("items").and_then(|v| v.as_array()) {
        for item in items {
            let item_sync = str_field(item, "sync_id").unwrap_or("");
            if item_sync.is_empty() {
                continue;
            }
            let item_name = str_field(item, "name").unwrap_or("");
            let qty = f64_field(item, "qty", 0.0);
            let unit_price = f64_field(item, "unit_price", 0.0);
            let disc = f64_field(item, "discount_pct", 0.0);
            let line_total = f64_field(item, "line_total", 0.0);
            let stock_qty = item.get("stock_qty").and_then(|v| v.as_f64());
            let product_id =
                resolve_id_by_sync(conn, "products", str_field(item, "product_sync_id"))?;

            let exists: Option<i64> = conn
                .query_row(
                    "SELECT id FROM sale_items WHERE sync_id = ?1",
                    [item_sync],
                    |r| r.get(0),
                )
                .optional()
                .map_err(LanSyncError::db)?;

            if let Some(iid) = exists {
                conn.execute(
                    "UPDATE sale_items SET sale_id = ?1, product_id = ?2, name = ?3, qty = ?4,
                     unit_price = ?5, discount_pct = ?6, line_total = ?7, stock_qty = ?8
                     WHERE id = ?9",
                    params![
                        sale_id,
                        product_id,
                        item_name,
                        qty,
                        unit_price,
                        disc,
                        line_total,
                        stock_qty,
                        iid
                    ],
                )
                .map_err(LanSyncError::db)?;
            } else {
                conn.execute(
                    "INSERT INTO sale_items (sale_id, product_id, name, qty, unit_price, discount_pct, line_total, stock_qty, sync_id)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                    params![
                        sale_id,
                        product_id,
                        item_name,
                        qty,
                        unit_price,
                        disc,
                        line_total,
                        stock_qty,
                        item_sync
                    ],
                )
                .map_err(LanSyncError::db)?;
            }
        }
    }
    Ok(())
}

/// Aplica movimiento: qty ya viene con signo (venta negativa, ajuste +/-).
fn apply_stock_movement(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM stock_movements WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?;
    if exists.is_some() {
        return Ok(());
    }

    let product_sync = str_field(p, "product_sync_id")
        .ok_or_else(|| LanSyncError::Protocol("stock_movement sin product_sync_id".into()))?;
    let product_id: i64 = conn
        .query_row(
            "SELECT id FROM products WHERE sync_id = ?1",
            [product_sync],
            |r| r.get(0),
        )
        .map_err(|_| {
            LanSyncError::Database(format!(
                "producto {product_sync} no existe para stock_movement"
            ))
        })?;

    let qty = f64_field(p, "qty", 0.0);
    let movement_type = str_field(p, "movement_type").unwrap_or("adjustment");
    let reference_type = str_field(p, "reference_type");
    let reference_id = p.get("reference_id").and_then(|v| v.as_i64());
    let device_id = str_field(p, "device_id");
    let created_at = str_field(p, "created_at");

    conn.execute(
        "INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, sync_id, device_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, COALESCE(?8, datetime('now','localtime')))",
        params![
            product_id,
            movement_type,
            qty,
            reference_type,
            reference_id,
            event.entity_sync_id,
            device_id,
            created_at
        ],
    )
    .map_err(LanSyncError::db)?;

    // Delta firmado: mismo convenio que stock.ts (venta = qty negativa en el insert).
    conn.execute(
        "UPDATE products SET stock = stock + ?1 WHERE id = ?2",
        params![qty, product_id],
    )
    .map_err(LanSyncError::db)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn mem_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO settings VALUES ('lan_sync_applying','0'), ('lan_sync_lamport','0');
            CREATE TABLE products (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL, stock REAL NOT NULL DEFAULT 0,
              cost REAL DEFAULT 0, price REAL DEFAULT 0, min_stock REAL DEFAULT 0,
              unit TEXT DEFAULT 'unidad', tax_rate REAL DEFAULT 21, active INTEGER DEFAULT 1,
              sync_id TEXT, created_at TEXT, updated_at TEXT,
              sku TEXT, barcode TEXT, description TEXT, category_id INTEGER, supplier_id INTEGER
            );
            CREATE TABLE stock_movements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              product_id INTEGER NOT NULL,
              movement_type TEXT NOT NULL,
              qty REAL NOT NULL,
              reference_type TEXT,
              reference_id INTEGER,
              sync_id TEXT,
              device_id TEXT,
              created_at TEXT
            );
            CREATE TABLE lan_sync_applied (
              event_id TEXT PRIMARY KEY,
              entity_type TEXT NOT NULL,
              applied_at TEXT DEFAULT (datetime('now'))
            );
            ",
        )
        .unwrap();
        conn
    }

    #[test]
    fn stock_movement_adds_signed_qty() {
        let conn = mem_conn();
        conn.execute(
            "INSERT INTO products (name, stock, sync_id) VALUES ('Agua', 10, 'prod1')",
            [],
        )
        .unwrap();

        let ev = SyncEvent {
            event_id: "e1".into(),
            entity_type: "stock_movement".into(),
            entity_sync_id: "mov1".into(),
            op: "upsert".into(),
            payload: json!({
                "product_sync_id": "prod1",
                "qty": -3.0,
                "movement_type": "sale"
            }),
            lamport: 1,
            origin_device: "d1".into(),
            created_at: "2026-07-14 12:00:00".into(),
        };
        assert!(apply_event(&conn, &ev).unwrap());
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE sync_id='prod1'", [], |r| r.get(0))
            .unwrap();
        assert!((stock - 7.0).abs() < f64::EPSILON);

        // idempotente
        assert!(!apply_event(&conn, &ev).unwrap());
        let stock2: f64 = conn
            .query_row("SELECT stock FROM products WHERE sync_id='prod1'", [], |r| r.get(0))
            .unwrap();
        assert!((stock2 - 7.0).abs() < f64::EPSILON);
    }

    #[test]
    fn product_upsert_does_not_overwrite_stock() {
        let conn = mem_conn();
        conn.execute(
            "INSERT INTO products (name, stock, price, sync_id, updated_at) VALUES ('Agua', 5, 100, 'prod1', '2026-07-14 10:00:00')",
            [],
        )
        .unwrap();
        let ev = SyncEvent {
            event_id: "e2".into(),
            entity_type: "product".into(),
            entity_sync_id: "prod1".into(),
            op: "upsert".into(),
            payload: json!({
                "name": "Agua mineral",
                "price": 120.0,
                "stock": 999.0,
                "updated_at": "2026-07-14 12:00:00",
                "unit": "unidad",
                "tax_rate": 21,
                "active": 1,
                "cost": 0,
                "min_stock": 0
            }),
            lamport: 2,
            origin_device: "d1".into(),
            created_at: "2026-07-14 12:00:00".into(),
        };
        apply_event(&conn, &ev).unwrap();
        let (name, stock, price): (String, f64, f64) = conn
            .query_row(
                "SELECT name, stock, price FROM products WHERE sync_id='prod1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(name, "Agua mineral");
        assert!((price - 120.0).abs() < f64::EPSILON);
        assert!((stock - 5.0).abs() < f64::EPSILON);
    }
}
