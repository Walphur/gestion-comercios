use crate::backup::{backup_database, read_setting_backup_path};
use crate::db_path::get_db_path;
use crate::import_products::{import_products_csv, ImportProductsResult};
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

    let expected: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total), 0) FROM sales
             WHERE cash_session_id = ?1 AND voided = 0 AND payment_method = 'efectivo'",
            [session_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

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
    conn.execute(
        "INSERT INTO cash_sessions (user_id, status) VALUES (?1, 'open')",
        [user_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
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
    import_products_csv(&file_path, update_existing)
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
