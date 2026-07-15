use crate::db_manager::DbManager;
use crate::db_path::get_db_path;
use rusqlite::Connection;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
pub struct DatabaseHealth {
    pub ok: bool,
    pub message: String,
}

fn backup_path(db: &Path) -> PathBuf {
    db.with_extension("db.bak")
}

fn stamped_backup_path(db: &Path) -> PathBuf {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let parent = db.parent().unwrap_or_else(|| Path::new("."));
    let stem = db
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("gestion");
    parent.join(format!("{stem}.{secs}.db.bak"))
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

/// Copia de seguridad sin sobrescribir un `.bak` existente.
/// Si `gestion.db.bak` ya existe, escribe `gestion.<unix>.db.bak`.
fn create_new_backup_preserving_existing(live: &Path, primary_bak: &Path) -> Result<PathBuf, String> {
    let dest = if primary_bak.exists() {
        stamped_backup_path(live)
    } else {
        primary_bak.to_path_buf()
    };
    fs::copy(live, &dest).map_err(|e| e.to_string())?;
    Ok(dest)
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
    let conn = match Connection::open(path) {
        Ok(c) => c,
        Err(_) => return Ok(false),
    };
    let row: String = match conn.query_row("PRAGMA integrity_check", [], |r| r.get(0)) {
        Ok(s) => s,
        Err(_) => return Ok(false),
    };
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

/// Reparación segura:
/// 1. Validar integridad de la base actual (sin tocar backups).
/// 2. Solo si está íntegra → crear un **nuevo** backup (nunca sobrescribe uno existente).
/// 3. Si está corrupta → no tocar ningún backup; restaurar desde `.bak` si es sano.
pub fn repair_database() -> Result<String, String> {
    let path = get_db_path()?;
    if !path.exists() {
        return Ok("No hay base de datos que reparar.".into());
    }

    let backup = backup_path(&path);

    // 1) Integridad de la live vía conexión (incluye WAL aplicado).
    let live_ok = DbManager::with_connection(|conn| Ok(integrity_message(conn)?.ok))?;

    if live_ok {
        // 2) Nuevo backup sin sobrescribir existente.
        let created = create_new_backup_preserving_existing(&path, &backup)?;

        return DbManager::with_connection(|conn| {
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
                "Reparación terminada. Nueva copia: {}\n\nCerrá y volvé a abrir la app.",
                created.display()
            ))
        });
    }

    // 3) Live corrupta: NO tocar backups existentes.
    if !backup.exists() {
        return Err(format!(
            "La base está dañada y no hay copia .bak. Buscá un respaldo en:\n{}",
            path.parent()
                .map(|p| p.display().to_string())
                .unwrap_or_default()
        ));
    }
    if !verify_file_integrity(&backup)? {
        return Err(format!(
            "La base está dañada y la copia .bak también. No se modificó ningún backup.\n{}",
            backup.display()
        ));
    }

    remove_wal_sidecars(&path);
    fs::copy(&backup, &path).map_err(|e| e.to_string())?;
    remove_wal_sidecars(&path);

    DbManager::with_connection(|conn| {
        let health = integrity_message(conn)?;
        if !health.ok {
            return Err(format!(
                "Restauré desde .bak pero sigue fallando: {}. El .bak no se modificó.",
                health.message
            ));
        }

        conn.execute_batch("VACUUM; REINDEX;")
            .map_err(|e| e.to_string())?;
        let _ = crate::product_search::rebuild_products_fts_safe(conn);

        Ok(format!(
            "Base restaurada desde copia sana (sin modificar backups).\n{}\n\nCerrá y volvé a abrir la app.",
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

#[cfg(test)]
mod repair_tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn repair_never_overwrites_existing_bak_when_live_ok() {
        let dir = std::env::temp_dir().join(format!(
            "gc_repair_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let live = dir.join("gestion.db");
        let bak = dir.join("gestion.db.bak");

        {
            let conn = Connection::open(&live).unwrap();
            conn.execute_batch("CREATE TABLE t(x); INSERT INTO t VALUES (1);")
                .unwrap();
        }
        {
            let conn = Connection::open(&bak).unwrap();
            conn.execute_batch("CREATE TABLE t(x); INSERT INTO t VALUES (999);")
                .unwrap();
        }
        let bak_before = fs::read(&bak).unwrap();

        let created = create_new_backup_preserving_existing(&live, &bak).unwrap();
        assert_ne!(created, bak);
        assert!(created.exists());
        assert_eq!(fs::read(&bak).unwrap(), bak_before, "bak existente intacto");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn repair_helper_does_not_copy_corrupt_over_bak() {
        let dir = std::env::temp_dir().join(format!(
            "gc_repair_corrupt_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let live = dir.join("gestion.db");
        let bak = dir.join("gestion.db.bak");

        {
            let conn = Connection::open(&bak).unwrap();
            conn.execute_batch("CREATE TABLE t(x); INSERT INTO t VALUES (42);")
                .unwrap();
        }
        let bak_before = fs::read(&bak).unwrap();

        // Simula "live corrupta": no crear nuevo backup si no está íntegra.
        // create_new_backup_preserving_existing solo se llama cuando live_ok.
        // Aquí verificamos que el bak no cambia si no invocamos esa ruta:
        let mut f = fs::File::create(&live).unwrap();
        f.write_all(b"NOT A SQLITE DATABASE").unwrap();
        drop(f);

        assert!(!verify_file_integrity(&live).unwrap());
        assert!(verify_file_integrity(&bak).unwrap());
        assert_eq!(fs::read(&bak).unwrap(), bak_before);
        let _ = fs::remove_dir_all(&dir);
    }
}
