use crate::db_path::get_db_path;
use crate::import_products::import_products_csv;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct CatalogImportStatus {
    pub importing: bool,
    pub done: bool,
    pub message: String,
}

pub fn bundled_supermarket_csv_path(app: &AppHandle) -> Option<String> {
    let path = app
        .path()
        .resolve("productos_supermercado.csv", tauri::path::BaseDirectory::Resource)
        .ok()?;
    if path.exists() {
        Some(path.to_string_lossy().into_owned())
    } else {
        None
    }
}

const DEMO_BARCODES: &[&str] = &[
    "7790895000011",
    "7790895000028",
    "7798065000015",
    "7799312000010",
    "7790315980012",
    "7790315980029",
    "7790733001024",
    "7790748000010",
    "7798154000011",
    "7798154000028",
    "7798154000035",
    "7791132000015",
    "7791132000022",
    "7791132000039",
    "7790741000010",
    "7790741000027",
    "7790741000034",
    "7790315000018",
    "7790315000025",
    "7790001999999",
];

fn purge_demo_products(conn: &Connection) -> Result<(), String> {
    for barcode in DEMO_BARCODES {
        conn.execute(
            "UPDATE products SET active = 0 WHERE barcode = ?1 AND active = 1",
            [barcode],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn needs_catalog_import(conn: &Connection) -> Result<bool, String> {
    let done: String = conn
        .query_row(
            "SELECT COALESCE(value, '') FROM settings WHERE key = 'catalog_import_done'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| String::new());
    if done == "1" {
        return Ok(false);
    }

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM products WHERE active = 1", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count < 50)
}

pub fn read_catalog_import_status() -> Result<CatalogImportStatus, String> {
    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    let importing: String = conn
        .query_row(
            "SELECT COALESCE(value, '') FROM settings WHERE key = 'catalog_importing'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| String::new());
    let done: String = conn
        .query_row(
            "SELECT COALESCE(value, '') FROM settings WHERE key = 'catalog_import_done'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| String::new());
    let message: String = conn
        .query_row(
            "SELECT COALESCE(value, '') FROM settings WHERE key = 'catalog_import_summary'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| String::new());

    let msg = if importing == "1" {
        "Cargando catálogo de productos por primera vez. Puede tardar 15-25 minutos.".to_string()
    } else if done == "1" && !message.is_empty() {
        message
    } else if done == "1" {
        "Catálogo listo.".to_string()
    } else {
        String::new()
    };

    Ok(CatalogImportStatus {
        importing: importing == "1",
        done: done == "1",
        message: msg,
    })
}

/// Primera ejecución con CSV empaquetado: importa en segundo plano.
pub fn spawn_bundled_catalog_import(_app: AppHandle, csv_path: String) {
    std::thread::spawn(move || {
        if let Err(e) = run_bundled_import(&csv_path) {
            eprintln!("Error importando catálogo empaquetado: {e}");
            if let Ok(conn) = Connection::open(get_db_path().unwrap_or_default()) {
                let _ = set_setting(&conn, "catalog_importing", "0");
                let _ = set_setting(
                    &conn,
                    "catalog_import_summary",
                    &format!("Error: {e}"),
                );
            }
        }
    });
}

fn run_bundled_import(csv_path: &str) -> Result<(), String> {
    if !Path::new(csv_path).exists() {
        return Err("CSV empaquetado no encontrado.".into());
    }

    let db_path = get_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    if !needs_catalog_import(&conn)? {
        return Ok(());
    }

    set_setting(&conn, "catalog_importing", "1")?;
    set_setting(
        &conn,
        "catalog_import_summary",
        "Importando productos_supermercado.csv…",
    )?;

    let result = import_products_csv(csv_path, false)?;
    purge_demo_products(&conn)?;
    let _ = crate::product_search::rebuild_products_fts(&conn);

    set_setting(&conn, "catalog_importing", "0")?;
    set_setting(&conn, "catalog_import_done", "1")?;
    set_setting(
        &conn,
        "catalog_import_summary",
        &format!(
            "Catálogo cargado: {} productos nuevos, {} omitidos.",
            result.inserted, result.skipped
        ),
    )?;

    Ok(())
}

pub fn try_start_bundled_import(app: &AppHandle) {
    let Some(csv_path) = bundled_supermarket_csv_path(app) else {
        return;
    };
    let Ok(conn) = Connection::open(get_db_path().unwrap_or_default()) else {
        return;
    };
    if needs_catalog_import(&conn).unwrap_or(false) {
        spawn_bundled_catalog_import(app.clone(), csv_path);
    }
}
