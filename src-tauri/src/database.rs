use crate::db_manager::DbManager;
use crate::db_path::get_db_path;
use rusqlite::Connection;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct DatabaseHealth {
    pub ok: bool,
    pub message: String,
}

fn backup_path(db: &Path) -> PathBuf {
    db.with_extension("db.bak")
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

/// Abre SQLite con pragmas seguros. El acceso exclusivo lo garantiza DbManager.
pub fn open_exclusive() -> Result<Connection, String> {
    DbManager::open()
}

pub fn check_database_health() -> Result<DatabaseHealth, String> {
    DbManager::with_connection(|conn| integrity_message(conn))
}

fn integrity_message(conn: &Connection) -> Result<DatabaseHealth, String> {
    let row: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let ok = row.eq_ignore_ascii_case("ok");
    Ok(DatabaseHealth {
        ok,
        message: if ok {
            "La base de datos está en buen estado.".into()
        } else {
            format!("Integridad: {row}")
        },
    })
}

fn verify_file_integrity(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let row: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(row.eq_ignore_ascii_case("ok"))
}

/// Restaura gestion.db desde gestion.db.bak (cierra archivos WAL).
pub fn restore_database_from_backup() -> Result<String, String> {
    let path = get_db_path()?;
    let backup = backup_path(&path);
    if !backup.exists() {
        return Err(format!(
            "No hay copia de seguridad en {}. Usá «Reparar» o contactá soporte.",
            backup.display()
        ));
    }
    if !verify_file_integrity(&backup)? {
        return Err("La copia .db.bak también está dañada. Necesitás un respaldo anterior.".into());
    }
    remove_wal_sidecars(&path);
    fs::copy(&backup, &path).map_err(|e| e.to_string())?;
    DbManager::with_connection(|conn| {
        let health = integrity_message(conn)?;
        if !health.ok {
            return Err(health.message);
        }
        let _ = crate::product_search::rebuild_products_fts_safe(conn);
        Ok(format!(
            "Base restaurada desde la copia de seguridad.\n{}\n\nCerrá y volvé a abrir la app.",
            backup.display()
        ))
    })
}

/// Copia de seguridad, restauración si hace falta, VACUUM y FTS.
pub fn repair_database() -> Result<String, String> {
    let path = get_db_path()?;
    if !path.exists() {
        return Ok("No hay base de datos que reparar.".into());
    }

    let backup = backup_path(&path);
    if path.exists() {
        let _ = fs::copy(&path, &backup);
    }

    remove_wal_sidecars(&path);

    if !verify_file_integrity(&path)? {
        if verify_file_integrity(&backup)? {
            fs::copy(&backup, &path).map_err(|e| e.to_string())?;
            remove_wal_sidecars(&path);
        } else {
            return Err(format!(
                "La base está dañada y la copia .bak no sirve. Buscá un respaldo en:\n{}",
                backup
                    .parent()
                    .map(|p| p.display().to_string())
                    .unwrap_or_default()
            ));
        }
    }

    DbManager::with_connection(|conn| {
        let health = integrity_message(conn)?;
        if !health.ok {
            return Err(format!(
                "No se pudo reparar: {}. Probá «Restaurar desde copia».",
                health.message
            ));
        }

        conn.execute_batch("VACUUM; REINDEX;")
            .map_err(|e| e.to_string())?;

        let _ = crate::product_search::rebuild_products_fts_safe(conn);

        Ok(format!(
            "Reparación terminada. Copia: {}\n\nCerrá y volvé a abrir la app.",
            backup.display()
        ))
    })
}

pub fn is_corruption_error(msg: &str) -> bool {
    let m = msg.to_lowercase();
    m.contains("malformed") || m.contains("corrupt") || m.contains("disk image")
}

const PRODUCT_DELETE_ERROR: &str = "No fue posible eliminar el producto. Intentá nuevamente.";

pub fn map_product_delete_error(err: String) -> String {
    if is_corruption_error(&err) {
        eprintln!("[db] delete failed (corruption prevented rollback path): {err}");
    } else {
        eprintln!("[db] delete failed: {err}");
    }
    PRODUCT_DELETE_ERROR.into()
}
