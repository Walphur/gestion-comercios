use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

/// Volcado completo de SQLite a ZIP con fecha (para cierre de caja o manual).
pub fn backup_database(db_path: &Path, dest_dir: &Path) -> Result<PathBuf, String> {
    if !db_path.exists() {
        return Err(format!("No existe la base de datos: {}", db_path.display()));
    }

    fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    let stamp = local_timestamp();
    let zip_name = format!("gestion_backup_{stamp}.zip");
    let zip_path = dest_dir.join(&zip_name);

    let mut zip = ZipWriter::new(
        File::create(&zip_path).map_err(|e| format!("No se pudo crear ZIP: {e}"))?,
    );
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut db_file =
        File::open(db_path).map_err(|e| format!("No se pudo abrir DB: {e}"))?;
    let mut buffer = Vec::new();
    db_file
        .read_to_end(&mut buffer)
        .map_err(|e| e.to_string())?;

    zip.start_file("gestion.db", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&buffer).map_err(|e| e.to_string())?;

    // WAL y SHM si existen (consistencia en caliente: idealmente checkpoint antes)
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

fn local_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    // YYYYMMDD_HHMMSS aproximado vía descomposición simple
    let days = secs / 86400;
    let day_secs = secs % 86400;
    let h = day_secs / 3600;
    let m = (day_secs % 3600) / 60;
    let s = day_secs % 60;
    // Epoch 1970 -> año aproximado para nombre de archivo
    let year = 1970 + (days / 365);
    let month = ((days % 365) / 30) + 1;
    let day = (days % 30) + 1;
    format!(
        "{year:04}{month:02}{day:02}_{h:02}{m:02}{s:02}"
    )
}

pub fn read_setting_backup_path(conn: &rusqlite::Connection) -> Option<PathBuf> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'backup_path'",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .filter(|s| !s.trim().is_empty())
    .map(PathBuf::from)
}
