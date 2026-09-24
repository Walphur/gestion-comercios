use crate::export_customers::write_customers_csv;
use crate::export_products::write_products_csv;
use crate::export_sales::write_sales_csv;
use crate::settings_util::write_setting;
use rusqlite::{backup::Backup, Connection};
use serde::Serialize;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

/// Días de ventas a exportar en el respaldo automático (recuperación ante desastre).
const BACKUP_SALES_DAYS: i32 = 90;

const BACKUP_SUBDIRS: &[&str] = &["caja", "clientes", "productos", "ventas"];

#[derive(Debug, Clone, Serialize)]
pub struct BackupResult {
    pub local_path: String,
    pub cloud_path: Option<String>,
}

/// Carpeta raíz durable por defecto (fuera del AppData).
pub fn default_backup_root() -> PathBuf {
    #[cfg(windows)]
    {
        PathBuf::from(r"C:\WalQo\backup")
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."))
            .join("WalQo")
            .join("backup")
    }
}

/// Resuelve la raíz: setting `backup_path` si está, si no `C:\WalQo\backup`.
pub fn resolve_backup_root(conn: &Connection) -> PathBuf {
    read_setting_backup_path(conn).unwrap_or_else(default_backup_root)
}

/// Crea `caja`, `clientes`, `productos`, `ventas` bajo la raíz.
pub fn ensure_backup_layout(root: &Path) -> Result<(), String> {
    for sub in BACKUP_SUBDIRS {
        fs::create_dir_all(root.join(sub)).map_err(|e| {
            format!(
                "No se pudo crear la carpeta de backup {}: {e}",
                root.join(sub).display()
            )
        })?;
    }
    Ok(())
}

/// Asegura la carpeta durable, crea subcarpetas y persiste el default en settings si faltaba.
pub fn ensure_durable_backup_root(conn: &Connection) -> Result<PathBuf, String> {
    let root = resolve_backup_root(conn);
    ensure_backup_layout(&root)?;
    if read_setting_backup_path(conn).is_none() {
        let _ = write_setting(conn, "backup_path", &root.to_string_lossy());
    }
    Ok(root)
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
#[allow(dead_code)]
pub fn backup_database_to_zip(db_path: &Path, dest_dir: &Path) -> Result<PathBuf, String> {
    backup_database(db_path, dest_dir)
}

/// Copia un archivo a una carpeta (Google Drive / OneDrive / Dropbox en PC).
pub fn mirror_file_to_dir(src: &Path, dest_dir: &Path) -> Result<PathBuf, String> {
    if !src.exists() {
        return Err("No existe el archivo para copiar.".into());
    }
    fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;
    let file_name = src
        .file_name()
        .ok_or_else(|| "Nombre de archivo inválido.".to_string())?;
    let dest = dest_dir.join(file_name);
    fs::copy(src, &dest).map_err(|e| format!("No se pudo copiar a la nube: {e}"))?;
    Ok(dest)
}

/// Copia el ZIP a una carpeta sincronizada (Google Drive, OneDrive, Dropbox en PC).
pub fn mirror_backup_to_cloud(zip_path: &Path, cloud_dir: &Path) -> Result<PathBuf, String> {
    mirror_file_to_dir(zip_path, cloud_dir)
}

/// Exporta CSV de productos, clientes y ventas (últimos 90 días) a las subcarpetas.
fn export_disaster_csvs(conn: &Connection, root: &Path, stamp: &str) -> Result<Vec<PathBuf>, String> {
    ensure_backup_layout(root)?;
    let mut paths = Vec::new();

    let products = root
        .join("productos")
        .join(format!("productos_{stamp}.csv"));
    write_products_csv(conn, &products)?;
    paths.push(products);

    let customers = root
        .join("clientes")
        .join(format!("clientes_{stamp}.csv"));
    write_customers_csv(conn, &customers)?;
    paths.push(customers);

    let sales = root
        .join("ventas")
        .join(format!("ventas_{stamp}.csv"));
    write_sales_csv(conn, &sales, BACKUP_SALES_DAYS)?;
    paths.push(sales);

    Ok(paths)
}

fn mirror_paths_to_cloud(paths: &[PathBuf], cloud_root: &Path) -> Option<String> {
    if let Err(e) = ensure_backup_layout(cloud_root) {
        eprintln!("[backup] no se pudo crear layout en nube: {e}");
        return None;
    }
    let mut last_ok: Option<String> = None;
    for src in paths {
        // Mantener la misma subcarpeta relativa (caja/productos/…)
        let sub = src
            .parent()
            .and_then(|p| p.file_name())
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "caja".into());
        let dest_dir = cloud_root.join(&sub);
        match mirror_file_to_dir(src, &dest_dir) {
            Ok(p) => last_ok = Some(p.to_string_lossy().to_string()),
            Err(e) => eprintln!("[backup] mirror falló {}: {e}", src.display()),
        }
    }
    last_ok
}

pub fn run_backup_with_cloud(
    conn: &Connection,
    db_path: &Path,
    custom_dest: Option<PathBuf>,
) -> Result<BackupResult, String> {
    // Checkpoint opcional acelera el backup; no es obligatorio para consistencia del API.
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");

    let root = if let Some(custom) = custom_dest {
        ensure_backup_layout(&custom)?;
        custom
    } else {
        ensure_durable_backup_root(conn)?
    };

    let caja_dir = root.join("caja");
    let zip = backup_database(db_path, &caja_dir)?;
    let stamp = zip
        .file_stem()
        .and_then(|s| s.to_str())
        .and_then(|s| s.strip_prefix("gestion_backup_"))
        .map(|s| s.to_string())
        .unwrap_or_else(local_timestamp);

    let local_path = zip.to_string_lossy().to_string();

    // CSV de recuperación — no abortar el ZIP si fallan (log + continuar)
    let mut all_paths = vec![zip.clone()];
    match export_disaster_csvs(conn, &root, &stamp) {
        Ok(csvs) => all_paths.extend(csvs),
        Err(e) => eprintln!("[backup] export CSV falló: {e}"),
    }

    let cloud_path = read_setting_cloud_backup_path(conn).and_then(|cloud_root| {
        // Preferir layout con subcarpetas; si falla, al menos copiar ZIP a la raíz nube
        mirror_paths_to_cloud(&all_paths, &cloud_root).or_else(|| {
            mirror_backup_to_cloud(&zip, &cloud_root)
                .ok()
                .map(|p| p.to_string_lossy().to_string())
        })
    });

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

    #[test]
    fn default_root_creates_layout() {
        let dir = std::env::temp_dir().join(format!(
            "gc_layout_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        ensure_backup_layout(&dir).unwrap();
        for sub in BACKUP_SUBDIRS {
            assert!(dir.join(sub).is_dir());
        }
        let _ = fs::remove_dir_all(&dir);
    }
}
