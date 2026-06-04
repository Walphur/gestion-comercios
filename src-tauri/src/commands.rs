use crate::backup::{backup_database, read_setting_backup_path};
use crate::db_path::get_db_path;
use crate::catalog_setup::{
    apply_catalog_choice, count_supermarket_products, list_supermarket_categories,
    read_catalog_import_status, read_catalog_wizard_state, remove_supermarket_catalog,
    CatalogImportStatus, CatalogWizardState, SupermarketCategory,
};
use crate::import_products::{import_products_csv, ImportCsvOptions, ImportProductsResult};
use crate::sync_worker::{enqueue_fiscal_invoice, get_sync_status};
use tauri_plugin_dialog::DialogExt;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct SyncStatusDto {
    pub online: bool,
    pub pending_count: u32,
    pub worker_active: bool,
    pub mode_label: String,
}

#[tauri::command]
pub fn get_connection_status() -> SyncStatusDto {
    let s = get_sync_status();
    let mode_label = if s.online {
        if s.pending_count > 0 {
            "Sincronizando Facturas (Internet Conectado)".to_string()
        } else {
            "Internet Conectado".to_string()
        }
    } else if s.pending_count > 0 {
        "Modo Local Activo (Facturas Pendientes)".to_string()
    } else {
        "Modo Local Activo (Internet Desconectado)".to_string()
    };

    SyncStatusDto {
        online: s.online,
        pending_count: s.pending_count,
        worker_active: s.worker_active,
        mode_label,
    }
}

#[tauri::command]
pub fn queue_fiscal_invoice(sale_id: i64) -> Result<(), String> {
    enqueue_fiscal_invoice(sale_id)
}

#[tauri::command]
pub fn run_backup_now(custom_path: Option<String>) -> Result<String, String> {
    let db_path = get_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let dest = custom_path
        .map(PathBuf::from)
        .or_else(|| read_setting_backup_path(&conn))
        .unwrap_or_else(|| {
            db_path
                .parent()
                .map(|p| p.join("backups"))
                .unwrap_or_else(|| PathBuf::from("."))
        });

    let zip = backup_database(&db_path, &dest)?;
    Ok(zip.to_string_lossy().to_string())
}

fn insert_audit(
    conn: &Connection,
    user_id: i64,
    action: &str,
    entity_type: Option<&str>,
    entity_id: Option<i64>,
    details: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO action_log (user_id, action, entity_type, entity_id, details) VALUES (?1,?2,?3,?4,?5)",
        params![user_id, action, entity_type, entity_id, details],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn log_audit_action(
    user_id: i64,
    action: String,
    entity_type: Option<String>,
    entity_id: Option<i64>,
    details: Option<String>,
) -> Result<(), String> {
    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    insert_audit(
        &conn,
        user_id,
        &action,
        entity_type.as_deref(),
        entity_id,
        details.as_deref(),
    )?;
    Ok(())
}

#[derive(Serialize)]
pub struct BlindCloseResult {
    pub session_id: i64,
    pub expected_cash: f64,
    pub declared_cash: f64,
    pub cash_difference: f64,
    pub backup_path: Option<String>,
}

/// Cierre de caja con arqueo ciego: el cajero solo ingresa lo que contó.
#[tauri::command]
pub fn close_cash_session_blind(
    session_id: i64,
    declared_cash: f64,
    user_id: i64,
) -> Result<BlindCloseResult, String> {
    let db_path = get_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let sales_cash: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total), 0) FROM sales
             WHERE cash_session_id = ?1 AND voided = 0 AND payment_method = 'efectivo'",
            [session_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let movements_net: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0)
             FROM cash_movements WHERE cash_session_id = ?1",
            [session_id],
            |r| r.get(0),
        )
        .unwrap_or(0.0);

    let expected = sales_cash + movements_net;
    let diff = declared_cash - expected;

    conn.execute(
        "UPDATE cash_sessions SET status = 'closed', closed_at = datetime('now','localtime'),
         expected_cash = ?2, declared_cash = ?3, cash_difference = ?4 WHERE id = ?1",
        params![session_id, expected, declared_cash, diff],
    )
    .map_err(|e| e.to_string())?;

    insert_audit(
        &conn,
        user_id,
        "cash_session_close_blind",
        Some("cash_session"),
        Some(session_id),
        Some(&format!(
            "declared={declared_cash}, expected_hidden_until_admin=true"
        )),
    )?;

    let backup_path = run_backup_internal(&conn, &db_path).ok();

    Ok(BlindCloseResult {
        session_id,
        expected_cash: expected,
        declared_cash,
        cash_difference: diff,
        backup_path,
    })
}

fn run_backup_internal(conn: &Connection, db_path: &std::path::Path) -> Result<String, String> {
    let dest = read_setting_backup_path(conn).unwrap_or_else(|| {
        db_path
            .parent()
            .map(|p| p.join("backups"))
            .unwrap_or_else(|| PathBuf::from("."))
    });
    let zip = backup_database(db_path, &dest)?;
    Ok(zip.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_cash_session(user_id: i64) -> Result<i64, String> {
    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();
    if let Some(id) = existing {
        return Ok(id);
    }
    conn.execute(
        "INSERT INTO cash_sessions (user_id, status) VALUES (?1, 'open')",
        [user_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn pick_export_products_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .set_file_name("productos_export.csv")
        .add_filter("CSV", &["csv"])
        .blocking_save_file();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub fn pick_products_csv_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("CSV de productos", &["csv"])
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub fn import_products_from_csv(
    file_path: String,
    update_existing: bool,
) -> Result<ImportProductsResult, String> {
    import_products_csv(
        &file_path,
        ImportCsvOptions {
            update_existing,
            categories_filter: None,
            catalog_source: None,
        },
    )
}

/// Importa el CSV grande del proyecto (ean, nombre, marca, cat1-cat3).
#[tauri::command]
pub fn import_supermarket_catalog(
    update_existing: bool,
    categories: Option<Vec<String>>,
) -> Result<ImportProductsResult, String> {
    let path = crate::catalog_setup::find_supermarket_csv_on_disk()
        .ok_or_else(|| {
            "No se encontró productos_supermercado.csv. Copialo a la carpeta del proyecto o definí GESTION_SUPERMARKET_CSV.".to_string()
        })?;
    let filter = categories.map(|cats| {
        cats.iter()
            .map(|c| c.trim().to_lowercase())
            .filter(|c| !c.is_empty())
            .collect::<std::collections::HashSet<_>>()
    });
    import_products_csv(
        &path,
        ImportCsvOptions {
            update_existing,
            categories_filter: filter,
            catalog_source: Some("supermarket".into()),
        },
    )
}

#[tauri::command]
pub fn get_catalog_import_status() -> Result<CatalogImportStatus, String> {
    read_catalog_import_status()
}

#[tauri::command]
pub fn get_catalog_wizard_state(app: tauri::AppHandle) -> Result<CatalogWizardState, String> {
    read_catalog_wizard_state(&app)
}

#[tauri::command]
pub fn list_supermarket_categories_cmd(app: tauri::AppHandle) -> Result<Vec<SupermarketCategory>, String> {
    list_supermarket_categories(&app)
}

#[tauri::command]
pub fn apply_catalog_setup_choice(
    app: tauri::AppHandle,
    mode: String,
    categories: Vec<String>,
) -> Result<(), String> {
    apply_catalog_choice(app, mode, categories)
}

#[tauri::command]
pub fn remove_supermarket_catalog_cmd(include_legacy: bool) -> Result<u32, String> {
    remove_supermarket_catalog(include_legacy)
}

#[tauri::command]
pub fn count_supermarket_products_cmd() -> Result<u32, String> {
    count_supermarket_products()
}

#[tauri::command]
pub fn verify_user_pin(username: String, pin: String) -> Result<serde_json::Value, String> {
    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, username, display_name, role FROM users WHERE username = ?1 AND pin = ?2 AND active = 1",
        params![username, pin],
        |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "username": r.get::<_, String>(1)?,
                "display_name": r.get::<_, String>(2)?,
                "role": r.get::<_, String>(3)?,
            }))
        },
    )
    .map_err(|_| "Usuario o PIN incorrecto".to_string())
}
