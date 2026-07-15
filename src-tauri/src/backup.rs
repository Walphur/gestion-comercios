use rusqlite::{backup::Backup, Connection};
use serde::Serialize;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[derive(Debug, Clone, Serialize)]
pub struct BackupResult {
    pub local_path: String,
    pub cloud_path: Option<String>,
}

/// Backup consistente vía SQLite Online Backup API (seguro con escrituras concurrentes).
/// Produce un archivo SQLite autónomo (sin WAL/SHM) y lo empaqueta en ZIP.
pub fn backup_database(db_path: &Path, dest_dir: &Path) -> Result<PathBuf, String> {
    if !db_path.exists() {
        return Err(format!("No existe la base de datos: {}", db_path.display()));
    }

    fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    let stamp = local_timestamp();
    let zip_name = format!("gestion_backup_{stamp}.zip");
    let zip_path = dest_dir.join(&zip_name);
    let tmp_db = dest_dir.join(format!("gestion_backup_{stamp}.db.tmp"));

    consistent_sqlite_backup(db_path, &tmp_db)?;

    let mut zip =
        ZipWriter::new(File::create(&zip_path).map_err(|e| format!("No se pudo crear ZIP: {e}"))?);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut db_file = File::open(&tmp_db).map_err(|e| format!("No se pudo abrir backup temp: {e}"))?;
    let mut buffer = Vec::new();
    db_file
        .read_to_end(&mut buffer)
        .map_err(|e| e.to_string())?;

    zip.start_file("gestion.db", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&buffer).map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;

    let _ = fs::remove_file(&tmp_db);
    Ok(zip_path)
}

/// Copia página a página con la Online Backup API oficial de SQLite.
pub fn consistent_sqlite_backup(src_path: &Path, dest_path: &Path) -> Result<(), String> {
    if dest_path.exists() {
        fs::remove_file(dest_path).map_err(|e| e.to_string())?;
    }
    let src = Connection::open(src_path).map_err(|e| e.to_string())?;
    // Lectura consistente aunque haya writers; el API pausa y reintenta páginas sucias.
    let _ = src.execute_batch("PRAGMA busy_timeout = 30000;");
    let mut dest = Connection::open(dest_path).map_err(|e| e.to_string())?;
    {
        let bak = Backup::new(&src, &mut dest).map_err(|e| e.to_string())?;
        bak.run_to_completion(64, Duration::from_millis(10), None)
            .map_err(|e| e.to_string())?;
    }
    drop(dest);
    let check = Connection::open(dest_path).map_err(|e| e.to_string())?;
    let row: String = check
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if !row.eq_ignore_ascii_case("ok") {
        let _ = fs::remove_file(dest_path);
        return Err(format!("Backup inconsistente: {row}"));
    }
    Ok(())
}

/// Volcado completo de SQLite a ZIP con fecha (para cierre de caja o manual).
/// Usa Online Backup API (no copia cruda del archivo ni WAL/SHM).
#[allow(dead_code)]
pub fn backup_database_to_zip(db_path: &Path, dest_dir: &Path) -> Result<PathBuf, String> {
    backup_database(db_path, dest_dir)
}

/// Copia el ZIP a una carpeta sincronizada (Google Drive, OneDrive, Dropbox en PC).
pub fn mirror_backup_to_cloud(zip_path: &Path, cloud_dir: &Path) -> Result<PathBuf, String> {
    if !zip_path.exists() {
        return Err("No existe el archivo de backup para copiar.".into());
    }
    fs::create_dir_all(cloud_dir).map_err(|e| e.to_string())?;
    let file_name = zip_path
        .file_name()
        .ok_or_else(|| "Nombre de backup inválido.".to_string())?;
    let dest = cloud_dir.join(file_name);
    fs::copy(zip_path, &dest).map_err(|e| format!("No se pudo copiar a la nube: {e}"))?;
    Ok(dest)
}

pub fn run_backup_with_cloud(
    conn: &Connection,
    db_path: &Path,
    custom_dest: Option<PathBuf>,
) -> Result<BackupResult, String> {
    // Checkpoint opcional acelera el backup; no es obligatorio para consistencia del API.
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");

    let dest = custom_dest
        .or_else(|| read_setting_backup_path(conn))
        .unwrap_or_else(|| {
            db_path
                .parent()
                .map(|p| p.join("backups"))
                .unwrap_or_else(|| PathBuf::from("."))
        });

    let zip = backup_database(db_path, &dest)?;
    let local_path = zip.to_string_lossy().to_string();

    let cloud_path = read_setting_cloud_backup_path(conn)
        .and_then(|dir| mirror_backup_to_cloud(&zip, &dir).ok())
        .map(|p| p.to_string_lossy().to_string());

    Ok(BackupResult {
        local_path,
        cloud_path,
    })
}

fn local_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let days = secs / 86400;
    let day_secs = secs % 86400;
    let h = day_secs / 3600;
    let m = (day_secs % 3600) / 60;
    let s = day_secs % 60;
    let year = 1970 + (days / 365);
    let month = ((days % 365) / 30) + 1;
    let day = (days % 30) + 1;
    format!("{year:04}{month:02}{day:02}_{h:02}{m:02}{s:02}")
}

pub fn read_setting_backup_path(conn: &Connection) -> Option<PathBuf> {
    read_setting_path(conn, "backup_path")
}

pub fn read_setting_cloud_backup_path(conn: &Connection) -> Option<PathBuf> {
    read_setting_path(conn, "cloud_backup_path")
}

fn read_setting_path(conn: &Connection, key: &str) -> Option<PathBuf> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
        r.get::<_, String>(0)
    })
    .ok()
    .filter(|s| !s.trim().is_empty())
    .map(PathBuf::from)
}

pub fn format_backup_summary(result: &BackupResult) -> String {
    match &result.cloud_path {
        Some(cloud) => format!(
            "Backup local: {}\nCopia en nube: {}",
            result.local_path, cloud
        ),
        None => format!("Backup local: {}", result.local_path),
    }
}

#[cfg(test)]
mod backup_tests {
    use super::*;

    #[test]
    fn online_backup_is_integrity_ok_with_wal_writes() {
        let dir = std::env::temp_dir().join(format!(
            "gc_bak_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let src = dir.join("live.db");
        {
            let conn = Connection::open(&src).unwrap();
            conn.execute_batch(
                "PRAGMA journal_mode=WAL;
                 CREATE TABLE sales(id INTEGER PRIMARY KEY, total REAL);
                 INSERT INTO sales(total) VALUES (10), (20), (30);",
            )
            .unwrap();
            // Escritura "caliente" concurrente-ish: más inserts antes del backup.
            for i in 0..50 {
                conn.execute("INSERT INTO sales(total) VALUES (?1)", [i as f64])
                    .unwrap();
            }
        }
        let dest = dir.join("snap.db");
        consistent_sqlite_backup(&src, &dest).unwrap();
        let snap = Connection::open(&dest).unwrap();
        let n: i64 = snap
            .query_row("SELECT COUNT(*) FROM sales", [], |r| r.get(0))
            .unwrap();
        assert!(n >= 53);
        let ok: String = snap
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .unwrap();
        assert_eq!(ok.to_lowercase(), "ok");
        let _ = fs::remove_dir_all(&dir);
    }
}
