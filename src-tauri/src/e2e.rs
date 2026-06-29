//! Comandos solo para pruebas E2E (GESTION_E2E=1). No usar en producción.

use crate::database::open_exclusive;
use rusqlite::params;

fn e2e_enabled() -> Result<(), String> {
    if std::env::var("GESTION_E2E").ok().as_deref() == Some("1") {
        Ok(())
    } else {
        Err("Comando E2E no disponible".to_string())
    }
}

#[derive(serde::Serialize)]
pub struct E2eIntegrityResult {
    pub ok: bool,
    pub integrity: String,
    pub product_count: i64,
    pub sale_count: i64,
}

#[tauri::command]
pub fn e2e_integrity_check() -> Result<E2eIntegrityResult, String> {
    e2e_enabled()?;
    let conn = open_exclusive()?;
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let product_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM products WHERE active = 1", [], |r| r.get(0))
        .unwrap_or(0);
    let sale_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sales WHERE COALESCE(voided, 0) = 0", [], |r| r.get(0))
        .unwrap_or(0);
    Ok(E2eIntegrityResult {
        ok: integrity == "ok",
        integrity,
        product_count,
        sale_count,
    })
}

#[tauri::command]
pub fn e2e_seed_products(count: u32) -> Result<u32, String> {
    e2e_enabled()?;
    let conn = open_exclusive()?;
    let mut inserted = 0u32;
    for i in 0..count {
        let name = format!("E2E Producto {i}");
        let barcode = format!("E2E{:08}", i);
        let sku = format!("SKU-E2E-{i}");
        let price = 100.0 + (i as f64 % 50.0);
        let cost = price * 0.6;
        let r = conn.execute(
            "INSERT INTO products (name, barcode, sku, price, cost, stock, min_stock, unit, active)
             VALUES (?1, ?2, ?3, ?4, ?5, 10, 2, 'unidad', 1)",
            params![name, barcode, sku, price, cost],
        );
        if r.is_ok() {
            inserted += 1;
        }
    }
    Ok(inserted)
}

#[tauri::command]
pub fn e2e_bulk_update_products(count: u32) -> Result<u32, String> {
    e2e_enabled()?;
    let conn = open_exclusive()?;
    let n = conn
        .execute(
            "UPDATE products SET price = price + 1, updated_at = datetime('now','localtime')
             WHERE id IN (
               SELECT id FROM products WHERE name LIKE 'E2E Producto%'
               ORDER BY id LIMIT ?1
             )",
            params![count],
        )
        .map_err(|e| e.to_string())?;
    Ok(n as u32)
}

#[tauri::command]
pub fn e2e_bulk_deactivate_products(count: u32) -> Result<u32, String> {
    e2e_enabled()?;
    let conn = open_exclusive()?;
    let n = conn
        .execute(
            "UPDATE products SET active = 0, updated_at = datetime('now','localtime')
             WHERE id IN (
               SELECT id FROM products WHERE name LIKE 'E2E Producto%' AND active = 1
               ORDER BY id LIMIT ?1
             )",
            params![count],
        )
        .map_err(|e| e.to_string())?;
    Ok(n as u32)
}

#[tauri::command]
pub fn e2e_seed_sales(count: u32) -> Result<u32, String> {
    e2e_enabled()?;
    let conn = open_exclusive()?;
    let user_id: i64 = conn
        .query_row("SELECT id FROM users ORDER BY id LIMIT 1", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let session_id: i64 = match conn.query_row(
        "SELECT id FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1",
        [],
        |r| r.get::<_, i64>(0),
    ) {
        Ok(id) => id,
        Err(_) => {
            conn.execute(
                "INSERT INTO cash_sessions (user_id, status) VALUES (?1, 'open')",
                params![user_id],
            )
            .map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        }
    };
    let (pid, pname, price): (i64, String, f64) = conn
        .query_row(
            "SELECT id, name, price FROM products WHERE active = 1 LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let mut inserted = 0u32;
    for _ in 0..count {
        conn.execute(
            "INSERT INTO sales (subtotal, discount_pct, total, payment_method, paid, change_due, user_id, cash_session_id)
             VALUES (?1, 0, ?1, 'efectivo', ?1, 0, ?2, ?3)",
            params![price, user_id, session_id],
        )
        .map_err(|e| e.to_string())?;
        let sale_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO sale_items (sale_id, product_id, name, qty, unit_price, discount_pct, line_total, stock_qty)
             VALUES (?1, ?2, ?3, 1, ?4, 0, ?4, 1)",
            params![sale_id, pid, pname, price],
        )
        .map_err(|e| e.to_string())?;
        inserted += 1;
    }
    Ok(inserted)
}

#[tauri::command]
pub fn e2e_mark_catalog_setup_done() -> Result<(), String> {
    e2e_enabled()?;
    let conn = open_exclusive()?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('catalog_setup_answered', '1')
         ON CONFLICT(key) DO UPDATE SET value = '1'",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
