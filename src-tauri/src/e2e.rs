//! Comandos solo para pruebas E2E / modo QA (GESTION_E2E=1).

use crate::database::open_exclusive;
use crate::db_path::get_db_path;
use crate::product_search::rebuild_products_fts_safe;
use rusqlite::{params, Connection};
use std::fs;
use std::path::{Path, PathBuf};

fn e2e_enabled() -> Result<(), String> {
    if std::env::var("GESTION_E2E").ok().as_deref() == Some("1") {
        Ok(())
    } else {
        Err("Comando E2E no disponible".to_string())
    }
}

fn template_path(db: &Path) -> PathBuf {
    db.parent()
        .map(|d| d.join("gestion.db.qa-baseline"))
        .unwrap_or_else(|| PathBuf::from("gestion.db.qa-baseline"))
}

fn wal_sidecar_paths(db: &Path) -> Vec<PathBuf> {
    let base = db.to_string_lossy();
    vec![
        PathBuf::from(format!("{base}-wal")),
        PathBuf::from(format!("{base}-shm")),
    ]
}

fn remove_wal_sidecars(db: &Path) {
    for p in wal_sidecar_paths(db) {
        let _ = fs::remove_file(p);
    }
}

fn table_exists(conn: &rusqlite::Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
        [name],
        |_| Ok(()),
    )
    .is_ok()
}

fn setting_is(conn: &rusqlite::Connection, key: &str, expected: &str) -> bool {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1 LIMIT 1",
        [key],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .map(|v| v == expected)
    .unwrap_or(false)
}

fn migration_version(conn: &rusqlite::Connection) -> i64 {
    conn.query_row("SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations", [], |r| {
        r.get(0)
    })
    .unwrap_or(0)
}

/// Plantilla usable: schema migrado + onboarding/wizard ya respondidos (sidebar visible).
fn baseline_template_ready(conn: &rusqlite::Connection) -> bool {
    table_exists(conn, "sale_items")
        && table_exists(conn, "sales")
        && table_exists(conn, "users")
        && table_exists(conn, "settings")
        && setting_is(conn, "catalog_setup_answered", "1")
        && setting_is(conn, "first_run_setup_done", "1")
}

fn normalize_baseline_data(conn: &rusqlite::Connection) -> Result<(), String> {
    if !table_exists(conn, "sale_items") || !table_exists(conn, "sales") || !table_exists(conn, "users") {
        return Err(
            "schema incompleto: abrí la app (migraciones JS) antes de crear la plantilla QA".into(),
        );
    }
    conn.execute_batch(
        "PRAGMA foreign_keys = OFF;
         DELETE FROM sale_items;
         DELETE FROM sales;
         DELETE FROM cash_movements;
         DELETE FROM cash_sessions;
         DELETE FROM stock_movements;
         DELETE FROM product_batches;
         DELETE FROM kit_items;
         DELETE FROM product_kits;
         DELETE FROM product_barcodes;
         DELETE FROM product_variants;
         DELETE FROM products;
         DELETE FROM quote_items;
         DELETE FROM quotes;
         DELETE FROM delivery_note_items;
         DELETE FROM delivery_notes;
         DELETE FROM service_order_items;
         DELETE FROM service_orders;
         DELETE FROM appointments;
         INSERT OR REPLACE INTO settings (key, value) VALUES ('qa_ledger_purge', '1');
         DELETE FROM customer_payments;
         DELETE FROM customer_balance_movements;
         DELETE FROM settings WHERE key = 'qa_ledger_purge';
         DELETE FROM vehicles;
         DELETE FROM customers;
         DELETE FROM action_log;
         DELETE FROM fiscal_documents;
         DELETE FROM sync_queue;
         DELETE FROM sync_export_queue;
         DELETE FROM sync_import_log;
         DELETE FROM categories;
         DELETE FROM brands;
         DELETE FROM suppliers;
         UPDATE users SET pin = '1234', active = 1, display_name = 'Administrador' WHERE username = 'admin';
         UPDATE users SET pin = '0000', active = 1, display_name = 'Cajero' WHERE username = 'cajero';
         INSERT OR IGNORE INTO users (id, username, display_name, role, pin) VALUES
           (1, 'admin', 'Administrador', 'admin', '1234'),
           (2, 'cajero', 'Cajero', 'cashier', '0000');
         INSERT OR REPLACE INTO settings (key, value) VALUES ('catalog_setup_answered', '1');
         INSERT OR REPLACE INTO settings (key, value) VALUES ('first_run_setup_done', '1');
         INSERT OR REPLACE INTO settings (key, value) VALUES ('business_name', 'E2E Comercio');
         INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_pin', '1234');
         INSERT OR REPLACE INTO settings (key, value) VALUES ('current_user_id', '');
         PRAGMA foreign_keys = ON;",
    )
    .map_err(|e| e.to_string())?;
    rebuild_products_fts_safe(conn)?;
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Crea o actualiza la plantilla de BD limpia (una vez por instalación QA).
#[tauri::command]
pub fn e2e_ensure_baseline_template() -> Result<String, String> {
    e2e_enabled()?;
    let db_path = get_db_path()?;
    let template = template_path(&db_path);

    if template.exists() {
        let live_version = Connection::open(&db_path)
            .map(|c| migration_version(&c))
            .unwrap_or(0);
        let tmpl_ok = Connection::open(&template)
            .ok()
            .map(|c| baseline_template_ready(&c) && migration_version(&c) >= live_version)
            .unwrap_or(false);
        if tmpl_ok {
            return Ok(format!("baseline exists: {}", template.display()));
        }
        let _ = fs::remove_file(&template);
    }

    let conn = open_exclusive()?;
    normalize_baseline_data(&conn)?;
    drop(conn);

    remove_wal_sidecars(&db_path);
    fs::copy(&db_path, &template).map_err(|e| e.to_string())?;
    Ok(format!("baseline created: {}", template.display()))
}

/// Restaura la BD desde la plantilla QA. El frontend debe cerrar @tauri-apps/plugin-sql antes.
#[tauri::command]
pub fn e2e_reset_environment() -> Result<(), String> {
    e2e_enabled()?;
    let db_path = get_db_path()?;
    let template = template_path(&db_path);

    if !template.exists() {
        e2e_ensure_baseline_template()?;
    }

    remove_wal_sidecars(&db_path);
    fs::copy(&template, &db_path).map_err(|e| e.to_string())?;
    remove_wal_sidecars(&db_path);

    let conn = open_exclusive()?;
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if integrity != "ok" {
        return Err(format!("integrity_check tras reset: {integrity}"));
    }
    Ok(())
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
        .query_row("SELECT COUNT(*) FROM products WHERE active = 1", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);
    let sale_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sales WHERE COALESCE(voided, 0) = 0",
            [],
            |r| r.get(0),
        )
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
    rebuild_products_fts_safe(&conn)?;
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

/// Cambia el billing del bypass E2E (no afecta producción).
#[tauri::command]
pub fn e2e_set_billing(billing: String) -> Result<String, String> {
    e2e_enabled()?;
    crate::license::e2e_set_billing_override(&billing)?;
    Ok(billing)
}

#[tauri::command]
pub fn e2e_clear_billing() -> Result<(), String> {
    e2e_enabled()?;
    crate::license::e2e_clear_billing_override();
    Ok(())
}

fn upsert_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_setting_value(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1 LIMIT 1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => Ok(Some(row.get::<_, String>(0).map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

/// Plantilla de subtipo gastro — debe coincidir con `src/config/gastroSubtypes.ts`.
/// Self-test: `scripts/run-gastro-subtype-selftest.ts` (matriz EXPECTED + pickup/delivery).
struct GastroPresetFlags {
    tables: bool,
    kitchen: bool,
    waiter_phones: bool,
    fulfillment: bool,
    menu_pickup: bool,
    menu_delivery: bool,
}

fn gastro_preset_for(subtype: &str) -> Result<GastroPresetFlags, String> {
    // Campos alineados 1:1 con GASTRO_SUBTYPES[id].preset
    match subtype {
        "restaurante" => Ok(GastroPresetFlags {
            tables: true,
            kitchen: true,
            waiter_phones: true,
            fulfillment: true,
            menu_pickup: true,
            menu_delivery: true,
        }),
        "rotiseria" => Ok(GastroPresetFlags {
            tables: false,
            kitchen: true,
            waiter_phones: false,
            fulfillment: true,
            menu_pickup: true,
            menu_delivery: true,
        }),
        "pizzeria" => Ok(GastroPresetFlags {
            tables: false,
            kitchen: true,
            waiter_phones: false,
            fulfillment: true,
            menu_pickup: true,
            menu_delivery: true,
        }),
        "cafeteria" => Ok(GastroPresetFlags {
            tables: false,
            kitchen: true,
            waiter_phones: false,
            fulfillment: true,
            menu_pickup: true,
            menu_delivery: false,
        }),
        "bar" => Ok(GastroPresetFlags {
            tables: true,
            kitchen: true,
            waiter_phones: true,
            fulfillment: true,
            menu_pickup: false,
            menu_delivery: false,
        }),
        "comida_rapida" => Ok(GastroPresetFlags {
            tables: false,
            kitchen: true,
            waiter_phones: false,
            fulfillment: true,
            menu_pickup: true,
            menu_delivery: true,
        }),
        "delivery" => Ok(GastroPresetFlags {
            tables: false,
            kitchen: true,
            waiter_phones: false,
            fulfillment: true,
            menu_pickup: true,
            menu_delivery: true,
        }),
        "otro" => Ok(GastroPresetFlags {
            tables: true,
            kitchen: true,
            waiter_phones: true,
            fulfillment: true,
            menu_pickup: true,
            menu_delivery: true,
        }),
        _ => Err(format!("Subtipo gastro E2E desconocido: {subtype}")),
    }
}

fn apply_gastro_preset_sql(
    conn: &Connection,
    subtype: &str,
    force: bool,
) -> Result<bool, String> {
    let flags = gastro_preset_for(subtype)?;
    let already = get_setting_value(conn, "gastro_preset_applied")?.as_deref() == Some("1");
    if already && !force {
        upsert_setting(conn, "gastro_subtype", subtype)?;
        return Ok(false);
    }
    upsert_setting(conn, "gastro_subtype", subtype)?;
    upsert_setting(conn, "tables_enabled", if flags.tables { "1" } else { "0" })?;
    upsert_setting(conn, "kitchen_enabled", if flags.kitchen { "1" } else { "0" })?;
    upsert_setting(
        conn,
        "waiter_phones_enabled",
        if flags.waiter_phones { "1" } else { "0" },
    )?;
    upsert_setting(
        conn,
        "pos_fulfillment_enabled",
        if flags.fulfillment { "1" } else { "0" },
    )?;
    upsert_setting(
        conn,
        "menu_portal_pickup",
        if flags.menu_pickup { "1" } else { "0" },
    )?;
    upsert_setting(
        conn,
        "menu_portal_delivery",
        if flags.menu_delivery { "1" } else { "0" },
    )?;
    upsert_setting(conn, "gastro_preset_applied", "1")?;
    Ok(true)
}

/// Activa rubro gastronomía en la BD de QA (bypass de WEB_ONLY solo vía SQL E2E).
/// No cambia la regla comercial: `setRubro` en UI sigue bloqueado en Desktop.
#[tauri::command]
pub fn e2e_seed_gastronomia(subtype: String) -> Result<serde_json::Value, String> {
    e2e_enabled()?;
    let conn = open_exclusive()?;
    let subtype = if subtype.trim().is_empty() {
        "restaurante".to_string()
    } else {
        subtype.trim().to_string()
    };
    upsert_setting(&conn, "rubro", "gastronomia")?;
    upsert_setting(&conn, "catalog_setup_answered", "1")?;
    // Primera plantilla siempre force para dejar estado conocido.
    let applied = apply_gastro_preset_sql(&conn, &subtype, true)?;

    if table_exists(&conn, "dining_tables") {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM dining_tables WHERE active = 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if count == 0 {
            for n in 1..=3 {
                conn.execute(
                    "INSERT INTO dining_tables (number, name, zone, sort_order, active)
                     VALUES (?1, ?2, ?3, ?1, 1)",
                    params![n, format!("Mesa {n}"), if n <= 2 { "Salón" } else { "Terraza" }],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    if table_exists(&conn, "kitchen_stations") {
        let stations: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM kitchen_stations WHERE active = 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if stations == 0 {
            for name in ["Cocina", "Barra"] {
                let _ = conn.execute(
                    "INSERT INTO kitchen_stations (name, sort_order, active) VALUES (?1, 0, 1)",
                    params![name],
                );
            }
        }
    }

    // Producto gastro + insumo con receta on_demand (descuento de ingredientes al vender).
    let barcode = "E2EGASTRO01";
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM products WHERE barcode = ?1",
            params![barcode],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if exists == 0 {
        conn.execute(
            "INSERT INTO products (name, barcode, sku, price, cost, stock, min_stock, unit, active, track_stock, product_kind, prepare_mode, show_on_menu)
             VALUES ('E2E Café', ?1, 'SKU-E2E-GASTRO', 1500, 400, 0, 0, 'unidad', 1, 0, 'prepared', 'on_demand', 1)",
            params![barcode],
        )
        .map_err(|e| e.to_string())?;
        let cafe_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO products (name, barcode, sku, price, cost, stock, min_stock, unit, active, track_stock, product_kind)
             VALUES ('E2E Café grano', 'E2EGASTROING', 'SKU-E2E-ING', 0, 50, 100, 10, 'g', 1, 1, 'ingredient')",
            [],
        )
        .map_err(|e| e.to_string())?;
        let ing_id = conn.last_insert_rowid();
        if table_exists(&conn, "product_recipes") {
            conn.execute(
                "INSERT INTO product_recipes (product_id, yield_qty, notes) VALUES (?1, 1, 'E2E')",
                params![cafe_id],
            )
            .map_err(|e| e.to_string())?;
            let recipe_id = conn.last_insert_rowid();
            conn.execute(
                "INSERT INTO recipe_items (recipe_id, ingredient_product_id, qty) VALUES (?1, ?2, 18)",
                params![recipe_id, ing_id],
            )
            .map_err(|e| e.to_string())?;
        }
        // Menú del día con schedule de prueba (persistencia; runtime no filtra aún).
        conn.execute(
            "INSERT INTO products (name, barcode, sku, price, cost, stock, min_stock, unit, active, track_stock, product_kind, prepare_mode, is_daily_menu, menu_schedule, show_on_menu)
             VALUES ('E2E Menú día', 'E2EGASTROMENU', 'SKU-E2E-MENU', 5000, 2000, 0, 0, 'unidad', 1, 0, 'prepared', 'on_demand', 1,
                     '{\"days\":[1,2,3,4,5],\"from\":\"11:00\",\"to\":\"15:00\"}', 1)",
            [],
        )
        .map_err(|e| e.to_string())?;
        rebuild_products_fts_safe(&conn)?;
    }

    Ok(serde_json::json!({
        "subtype": subtype,
        "presetApplied": applied,
        "barcode": barcode,
    }))
}

/// Reaplica plantilla gastro (respeta `gastro_preset_applied` salvo force).
#[tauri::command]
pub fn e2e_apply_gastro_preset(subtype: String, force: bool) -> Result<serde_json::Value, String> {
    e2e_enabled()?;
    let conn = open_exclusive()?;
    let applied = apply_gastro_preset_sql(&conn, subtype.trim(), force)?;
    Ok(serde_json::json!({ "applied": applied, "subtype": subtype.trim() }))
}

#[tauri::command]
pub fn e2e_get_setting(key: String) -> Result<Option<String>, String> {
    e2e_enabled()?;
    let conn = open_exclusive()?;
    get_setting_value(&conn, &key)
}

#[tauri::command]
pub fn e2e_set_setting(key: String, value: String) -> Result<(), String> {
    e2e_enabled()?;
    let conn = open_exclusive()?;
    upsert_setting(&conn, &key, &value)
}

#[tauri::command]
pub fn e2e_product_stock_by_barcode(barcode: String) -> Result<Option<f64>, String> {
    e2e_enabled()?;
    let conn = open_exclusive()?;
    let mut stmt = conn
        .prepare("SELECT stock FROM products WHERE barcode = ?1 LIMIT 1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![barcode]).map_err(|e| e.to_string())?;
    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => Ok(Some(row.get::<_, f64>(0).map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn e2e_product_field_by_barcode(
    barcode: String,
    field: String,
) -> Result<Option<String>, String> {
    e2e_enabled()?;
    let allowed = [
        "menu_schedule",
        "product_kind",
        "prepare_mode",
        "name",
        "is_daily_menu",
        "track_stock",
        "stock",
    ];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Campo E2E no permitido: {field}"));
    }
    let conn = open_exclusive()?;
    let sql = format!("SELECT CAST({field} AS TEXT) FROM products WHERE barcode = ?1 LIMIT 1");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![barcode]).map_err(|e| e.to_string())?;
    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => Ok(row.get::<_, Option<String>>(0).map_err(|e| e.to_string())?),
        None => Ok(None),
    }
}
