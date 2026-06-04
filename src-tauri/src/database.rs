use crate::db_path::get_db_path;
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use serde::Serialize;

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

pub fn open_exclusive() -> Result<Connection, String> {
    let path = get_db_path()?;
    let conn = Connection::open(&path).map_err(|e| format_db_err(&e.to_string()))?;
    conn.busy_timeout(Duration::from_secs(90))
        .map_err(|e| e.to_string())?;
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    Ok(conn)
}

pub fn check_database_health() -> Result<DatabaseHealth, String> {
    let path = get_db_path()?;
    if !path.exists() {
        return Ok(DatabaseHealth {
            ok: true,
            message: "Base de datos nueva (aún no creada).".into(),
        });
    }
    let conn = open_exclusive()?;
    integrity_message(&conn)
}

fn integrity_message(conn: &Connection) -> Result<DatabaseHealth, String> {
    let row: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| format_db_err(&e.to_string()))?;
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
        return Err(
            "La copia .db.bak también está dañada. Necesitás un respaldo anterior.".into(),
        );
    }
    remove_wal_sidecars(&path);
    fs::copy(&backup, &path).map_err(|e| e.to_string())?;
    let conn = open_exclusive()?;
    let health = integrity_message(&conn)?;
    if !health.ok {
        return Err(health.message);
    }
    let _ = crate::product_search::rebuild_products_fts(&conn);
    Ok(format!(
        "Base restaurada desde la copia de seguridad.\n{}\n\nCerrá y volvé a abrir la app.",
        backup.display()
    ))
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
                backup.parent().map(|p| p.display().to_string()).unwrap_or_default()
            ));
        }
    }

    let conn = open_exclusive()?;
    let health = integrity_message(&conn)?;
    if !health.ok {
        return Err(format!(
            "No se pudo reparar: {}. Probá «Restaurar desde copia».",
            health.message
        ));
    }

    conn.execute_batch(
        "PRAGMA wal_checkpoint(TRUNCATE);
         VACUUM;
         REINDEX;",
    )
    .map_err(|e| format_db_err(&e.to_string()))?;

    let _ = crate::product_search::rebuild_products_fts(&conn);

    Ok(format!(
        "Reparación terminada. Copia: {}\n\nCerrá y volvé a abrir la app.",
        backup.display()
    ))
}

pub fn format_db_err(raw: &str) -> String {
    if raw.contains("malformed") || raw.contains("corrupt") {
        "database disk image is malformed".into()
    } else {
        raw.to_string()
    }
}

pub fn is_corruption_error(msg: &str) -> bool {
    let m = msg.to_lowercase();
    m.contains("malformed") || m.contains("corrupt") || m.contains("disk image")
}
