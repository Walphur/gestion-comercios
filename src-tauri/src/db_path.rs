use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

static DB_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn init_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("gestion.db");
    *DB_PATH.lock().unwrap() = Some(path.clone());
    Ok(path)
}

pub fn get_db_path() -> Result<PathBuf, String> {
    DB_PATH
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Ruta de base de datos no inicializada".to_string())
}

pub fn get_app_data_dir() -> Result<PathBuf, String> {
    get_db_path().map(|p| {
        p.parent()
            .map(|d| d.to_path_buf())
            .unwrap_or(p)
    })
}

pub fn get_catalog_csv_dest() -> Result<PathBuf, String> {
    Ok(get_app_data_dir()?.join("catalog").join("productos_supermercado.csv"))
}
