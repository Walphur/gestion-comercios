use rusqlite::Connection;
use serde::Serialize;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[derive(Debug, Clone, Serialize)]
pub struct BackupResult {
    pub local_path: String,
    pub cloud_path: Option<String>,
}

/// Volcado completo de SQLite a ZIP con fecha (para cierre de caja o manual).
pub fn backup_database(db_path: &Path, dest_dir: &Path) -> Result<PathBuf, String> {
    if !db_path.exists() {
        return Err(format!("No existe la base de datos: {}", db_path.display()));
    }

    fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    let stamp = local_timestamp();
    let zip_name = format!("gestion_backup_{stamp}.zip");
    let zip_path = dest_dir.join(&zip_name);

    let mut zip =
        ZipWriter::new(File::create(&zip_path).map_err(|e| format!("No se pudo crear ZIP: {e}"))?);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut db_file = File::open(db_path).map_err(|e| format!("No se pudo abrir DB: {e}"))?;
    let mut buffer = Vec::new();
    db_file
        .read_to_end(&mut buffer)
        .map_err(|e| e.to_string())?;

    zip.start_file("gestion.db", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&buffer).map_err(|e| e.to_string())?;

    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{}", db_path.display(), suffix));
        if sidecar.exists() {
            let name = format!("gestion.db{suffix}");
            let mut f = File::open(&sidecar).map_err(|e| e.to_string())?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            zip.start_file(&name, options).map_err(|e| e.to_string())?;
            zip.write_all(&buf).map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(zip_path)
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
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");

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
