//! Aplica la migración 79 (CHECK de rol `plus`) fuera de la transacción de sqlx.
//! sqlx envuelve cada migración en un BEGIN y ahí `PRAGMA foreign_keys=OFF` no hace efecto,
//! así que DROP TABLE users falla y el arranque no puede abrir la base → login sin empleados.

use crate::db_manager::DbManager;
use rusqlite::params;
use sha2::{Digest, Sha384};

const VERSION: i64 = 79;
const DESCRIPTION: &str = "user_role_plus";
const SQL: &str = include_str!("../migrations/0079_user_role_plus.sql");

fn checksum(sql: &str) -> Vec<u8> {
    Sha384::digest(sql.as_bytes()).to_vec()
}

fn already_applied(conn: &rusqlite::Connection) -> Result<bool, String> {
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='_sqlx_migrations'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if exists == 0 {
        return Ok(false);
    }
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM _sqlx_migrations WHERE version = ?1 AND success = 1",
            params![VERSION],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

fn role_check_allows_plus(conn: &rusqlite::Connection) -> Result<bool, String> {
    let sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(sql.contains("'plus'"))
}

/// Debe correrse antes del primer `Database.load` del plugin SQL.
pub fn ensure_user_role_plus_migration() -> Result<(), String> {
    DbManager::with_connection(|conn| {
        if already_applied(conn)? {
            return Ok(());
        }
        if role_check_allows_plus(conn)? {
            // Ya tiene plus (p.ej. base nueva) pero falta el registro de sqlx.
            mark_applied(conn)?;
            return Ok(());
        }

        conn.execute_batch("PRAGMA foreign_keys = OFF;")
            .map_err(|e| e.to_string())?;
        let apply = conn.execute_batch(SQL);
        let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
        apply.map_err(|e| format!("migración {VERSION} (Cajero Plus): {e}"))?;

        if !role_check_allows_plus(conn)? {
            return Err(
                "migración 79: el CHECK de users no admitió 'plus' después de aplicar".into(),
            );
        }
        mark_applied(conn)?;
        Ok(())
    })
}

fn mark_applied(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
);
        "#,
    )
    .map_err(|e| e.to_string())?;

    let sum = checksum(SQL);
    conn.execute(
        r#"
INSERT OR REPLACE INTO _sqlx_migrations (version, description, success, checksum, execution_time)
VALUES (?1, ?2, 1, ?3, 0)
        "#,
        params![VERSION, DESCRIPTION, sum],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
