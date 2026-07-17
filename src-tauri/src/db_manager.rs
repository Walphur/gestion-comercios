use crate::db_path::get_db_path;
use rusqlite::{Connection, Transaction};
use std::sync::Mutex;
use std::time::Duration;

static DB_WRITE_LOCK: Mutex<()> = Mutex::new(());

/// Acceso serializado a SQLite: una escritura a la vez, transacciones con rollback automático.
pub struct DbManager;

impl DbManager {
    pub fn lock_write() -> std::sync::MutexGuard<'static, ()> {
        DB_WRITE_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn open() -> Result<Connection, String> {
        let path = get_db_path()?;
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        configure_connection(&conn)?;
        Ok(conn)
    }

    pub fn with_connection<F, T>(f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Connection) -> Result<T, String>,
    {
        let _guard = Self::lock_write();
        let mut conn = Self::open()?;
        f(&mut conn)
    }

    pub fn with_transaction<F, T>(f: F) -> Result<T, String>
    where
        F: FnOnce(&Transaction<'_>) -> Result<T, String>,
    {
        let _guard = Self::lock_write();
        let mut conn = Self::open()?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        match f(&tx) {
            Ok(value) => {
                tx.commit().map_err(|e| e.to_string())?;
                Ok(value)
            }
            Err(err) => Err(err),
        }
    }
}

fn configure_connection(conn: &Connection) -> Result<(), String> {
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA wal_autocheckpoint = 1000;",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
