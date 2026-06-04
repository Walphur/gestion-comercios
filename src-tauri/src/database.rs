use crate::db_path::get_db_path;
use rusqlite::Connection;
use std::fs;
use serde::Serialize;

#[derive(Serialize)]
pub struct DatabaseHealth {
    pub ok: bool,
    pub message: String,
}

pub fn check_database_health() -> Result<DatabaseHealth, String> {
    let path = get_db_path()?;
    if !path.exists() {
        return Ok(DatabaseHealth {
            ok: true,
            message: "Base de datos nueva (aún no creada).".into(),
        });
    }
    let conn = Connection::open(&path).map_err(|e| format_db_err(&e.to_string()))?;
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

/// Copia de seguridad, VACUUM y reindexación FTS. No recupera archivos muy dañados.
pub fn repair_database() -> Result<String, String> {
    let path = get_db_path()?;
    if !path.exists() {
        return Ok("No hay base de datos que reparar.".into());
    }

    let backup = path.with_extension("db.bak");
    fs::copy(&path, &backup).map_err(|e| e.to_string())?;

    let conn = Connection::open(&path).map_err(|e| format_db_err(&e.to_string()))?;
    let check: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| format_db_err(&e.to_string()))?;

    if !check.eq_ignore_ascii_case("ok") {
        return Err(format!(
            "La base está dañada y no se pudo reparar automáticamente ({check}). \
             Hay una copia en {}. Contactá soporte o restaurá ese archivo como gestion.db.",
            backup.display()
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
        "Reparación terminada. Copia de seguridad: {}",
        backup.display()
    ))
}

fn format_db_err(raw: &str) -> String {
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
