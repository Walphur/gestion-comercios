use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

fn product_images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("product_images");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn normalize_ext(src: &Path) -> Result<String, String> {
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let allowed = ["png", "jpg", "jpeg", "webp", "gif"];
    if !allowed.contains(&ext.as_str()) {
        return Err("Formato no soportado. Usá PNG, JPG o WebP.".into());
    }
    Ok(ext)
}

fn remove_existing_for_product(dir: &Path, product_id: i64) {
    for ext in ["png", "jpg", "jpeg", "webp", "gif"] {
        let p = dir.join(format!("{product_id}.{ext}"));
        if p.exists() {
            let _ = fs::remove_file(p);
        }
    }
}

#[tauri::command]
pub fn pick_product_image(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("Imagen", &["png", "jpg", "jpeg", "webp", "gif"])
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

/// Copia la imagen a app_data/product_images/{id}.{ext} y devuelve el nombre relativo.
#[tauri::command]
pub fn save_product_image(
    app: tauri::AppHandle,
    product_id: i64,
    source_path: String,
) -> Result<String, String> {
    if product_id <= 0 {
        return Err("Producto inválido.".into());
    }
    let src = Path::new(&source_path);
    if !src.exists() {
        return Err("No se encontró la imagen.".into());
    }
    let ext = normalize_ext(src)?;
    let dir = product_images_dir(&app)?;
    remove_existing_for_product(&dir, product_id);
    let file_name = format!("{product_id}.{ext}");
    let dest = dir.join(&file_name);
    fs::copy(src, &dest).map_err(|e| e.to_string())?;
    Ok(file_name)
}

#[tauri::command]
pub fn get_product_image_abs_path(
    app: tauri::AppHandle,
    image_path: String,
) -> Result<Option<String>, String> {
    let name = image_path.trim();
    if name.is_empty() {
        return Ok(None);
    }
    // Solo nombre de archivo, sin subcarpetas (evita path traversal).
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("Ruta de imagen inválida.".into());
    }
    let dir = product_images_dir(&app)?;
    let abs = dir.join(name);
    if abs.exists() {
        Ok(Some(abs.to_string_lossy().into_owned()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn remove_product_image(app: tauri::AppHandle, product_id: i64) -> Result<(), String> {
    let dir = product_images_dir(&app)?;
    remove_existing_for_product(&dir, product_id);
    Ok(())
}
