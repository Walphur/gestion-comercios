use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

fn branding_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("branding");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn find_logo(dir: &Path) -> Option<PathBuf> {
    for ext in ["png", "jpg", "jpeg", "webp", "gif"] {
        let p = dir.join(format!("business_logo.{ext}"));
        if p.exists() {
            return Some(p);
        }
    }
    None
}

#[tauri::command]
pub fn pick_business_logo(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("Imagen", &["png", "jpg", "jpeg", "webp", "gif"])
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub fn save_business_logo(app: tauri::AppHandle, source_path: String) -> Result<String, String> {
    let src = Path::new(&source_path);
    if !src.exists() {
        return Err("No se encontró la imagen.".into());
    }
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let allowed = ["png", "jpg", "jpeg", "webp", "gif"];
    if !allowed.contains(&ext.as_str()) {
        return Err("Formato no soportado. Usá PNG, JPG o WebP.".into());
    }

    let dir = branding_dir(&app)?;
    for old in ["png", "jpg", "jpeg", "webp", "gif"] {
        let p = dir.join(format!("business_logo.{old}"));
        if p.exists() {
            let _ = fs::remove_file(p);
        }
    }

    let dest = dir.join(format!("business_logo.{ext}"));
    fs::copy(src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn get_business_logo_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = branding_dir(&app)?;
    Ok(find_logo(&dir).map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn remove_business_logo(app: tauri::AppHandle) -> Result<(), String> {
    let dir = branding_dir(&app)?;
    if let Some(p) = find_logo(&dir) {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}
