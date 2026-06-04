use crate::database::open_exclusive;
use crate::db_maintenance::remove_supermarket_catalog_safe;
use crate::db_path::{get_app_data_dir, get_catalog_csv_dest, get_db_path};
use crate::import_products::{import_products_csv, list_csv_primary_categories, ImportCsvOptions};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct CatalogImportStatus {
    pub importing: bool,
    pub done: bool,
    pub message: String,
}

#[derive(Serialize)]
pub struct SupermarketCategory {
    pub name: String,
    pub count: u32,
}

#[derive(Serialize)]
pub struct CatalogWizardState {
    pub needed: bool,
    pub csv_available: bool,
    pub catalog_ready: bool,
    pub bundled: bool,
}

#[derive(serde::Deserialize)]
struct IndexCategory {
    name: String,
    count: u32,
}

const BUNDLED_INDEX_PATHS: &[&str] = &[
    "catalog/categories_index.json",
    "categories_index.json",
];

const DEMO_BARCODES: &[&str] = &[
    "7790895000011", "7790895000028", "7798065000015", "7799312000010", "7790315980012",
    "7790315980029", "7790733001024", "7790748000010", "7798154000011", "7798154000028",
    "7798154000035", "7791132000015", "7791132000022", "7791132000039", "7790741000010",
    "7790741000027", "7790741000034", "7790315000018", "7790315000025", "7790001999999",
];

const BUNDLED_CSV_RESOURCE_PATHS: &[&str] = &[
    "catalog/productos_supermercado.csv",
    "productos_supermercado.csv",
];

pub fn bundled_supermarket_csv_path(app: &AppHandle) -> Option<String> {
    for rel in BUNDLED_CSV_RESOURCE_PATHS {
        if let Ok(path) = app.path().resolve(rel, tauri::path::BaseDirectory::Resource) {
            if path.exists() && csv_file_usable(&path) {
                return Some(path.to_string_lossy().into_owned());
            }
        }
    }
    None
}

fn csv_file_usable(path: &Path) -> bool {
    path.metadata()
        .map(|m| m.len() > 1_000_000)
        .unwrap_or(false)
}

/// Copia el CSV del instalador a AppData (lectura estable; la carpeta del .exe no se toca).
pub fn ensure_catalog_csv_copied(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = ensure_catalog_csv_copied_sync(&app) {
            eprintln!("Catálogo CSV: {e}");
        }
    });
}

fn ensure_catalog_csv_copied_sync(app: &AppHandle) -> Result<(), String> {
    let dest = get_catalog_csv_dest()?;
    if csv_file_usable(&dest) {
        return Ok(());
    }
    let Some(src) = bundled_supermarket_csv_path(app) else {
        return Ok(());
    };
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    eprintln!(
        "Catálogo copiado a {}",
        dest.to_string_lossy()
    );
    Ok(())
}

pub fn find_supermarket_csv_on_disk() -> Option<String> {
    if let Ok(custom) = std::env::var("GESTION_SUPERMARKET_CSV") {
        let p = std::path::PathBuf::from(&custom);
        if p.exists() {
            return Some(p.to_string_lossy().into_owned());
        }
    }
    let mut roots: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.to_path_buf());
        }
    }
    for mut dir in roots {
        for _ in 0..8 {
            let candidate = dir.join("productos_supermercado.csv");
            if candidate.exists() {
                return Some(candidate.to_string_lossy().into_owned());
            }
            if !dir.pop() {
                break;
            }
        }
    }
    None
}

pub fn resolve_supermarket_csv_path(app: &AppHandle) -> Option<String> {
    resolve_supermarket_csv_path_with_override(app, None)
}

pub fn resolve_supermarket_csv_path_with_override(
    app: &AppHandle,
    override_path: Option<String>,
) -> Option<String> {
    if let Some(p) = override_path {
        let path = Path::new(&p);
        if path.exists() {
            return Some(p);
        }
    }
    if let Ok(dest) = get_catalog_csv_dest() {
        if csv_file_usable(&dest) {
            return Some(dest.to_string_lossy().into_owned());
        }
    }
    if let Ok(db_path) = get_db_path() {
        if let Ok(conn) = Connection::open(&db_path) {
            let saved = get_setting(&conn, "supermarket_csv_path");
            if !saved.is_empty() && Path::new(&saved).exists() {
                return Some(saved);
            }
        }
    }
    bundled_supermarket_csv_path(app).or_else(find_supermarket_csv_on_disk)
}

pub fn save_supermarket_csv_path(path: &str) -> Result<(), String> {
    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    set_setting(&conn, "supermarket_csv_path", path)
}

fn bundled_categories_index(app: &AppHandle) -> Option<Vec<SupermarketCategory>> {
    for rel in BUNDLED_INDEX_PATHS {
        if let Ok(path) = app.path().resolve(rel, tauri::path::BaseDirectory::Resource) {
            if let Ok(data) = std::fs::read_to_string(&path) {
                if let Ok(rows) = serde_json::from_str::<Vec<IndexCategory>>(&data) {
                    if !rows.is_empty() {
                        return Some(
                            rows.into_iter()
                                .map(|r| SupermarketCategory {
                                    name: r.name,
                                    count: r.count,
                                })
                                .collect(),
                        );
                    }
                }
            }
        }
    }
    None
}

fn list_db_supermarket_categories(conn: &Connection) -> Result<Vec<SupermarketCategory>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT COALESCE(c.name, 'Sin categoría') AS name, COUNT(*) AS cnt
             FROM products p
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.active = 1 AND p.catalog_source = 'supermarket'
             GROUP BY COALESCE(c.name, 'Sin categoría')
             ORDER BY name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(SupermarketCategory {
                name: r.get(0)?,
                count: r.get::<_, i64>(1)? as u32,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn get_setting(conn: &Connection, key: &str) -> String {
    conn.query_row(
        "SELECT COALESCE(value, '') FROM settings WHERE key = ?1",
        [key],
        |r| r.get(0),
    )
    .unwrap_or_else(|_| String::new())
}

fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Lista SQL para excluir ejemplos del conteo «legacy» del catálogo masivo.
pub fn demo_barcodes_sql_in() -> String {
    DEMO_BARCODES
        .iter()
        .map(|b| format!("'{b}'"))
        .collect::<Vec<_>>()
        .join(",")
}

fn purge_demo_products(conn: &Connection) -> Result<u32, String> {
    let mut removed = 0u32;
    for barcode in DEMO_BARCODES {
        let n = conn
            .execute(
                "UPDATE products SET active = 0, updated_at = datetime('now','localtime')
                 WHERE barcode = ?1 AND active = 1",
                [barcode],
            )
            .map_err(|e| e.to_string())? as u32;
        removed += n;
    }
    if removed > 0 {
        let list = demo_barcodes_sql_in();
        let _ = conn.execute(
            &format!(
                "DELETE FROM products_fts WHERE rowid IN (
                   SELECT id FROM products WHERE active = 0 AND barcode IN ({list})
                 )"
            ),
            [],
        );
    }
    Ok(removed)
}

/// Quita los ~20 productos de ejemplo (sin rebuild FTS completo).
pub fn remove_demo_catalog_products() -> Result<u32, String> {
    let conn = open_exclusive()?;
    let removed = purge_demo_products(&conn)?;
    Ok(removed)
}

pub fn catalog_csv_ready(app: &AppHandle) -> bool {
    if let Ok(dest) = get_catalog_csv_dest() {
        if csv_file_usable(&dest) {
            return true;
        }
    }
    bundled_supermarket_csv_path(app).is_some()
}

pub fn read_catalog_wizard_state(app: &AppHandle) -> Result<CatalogWizardState, String> {
    let bundled = bundled_supermarket_csv_path(app).is_some();
    let ready = catalog_csv_ready(app);
    let csv_available = ready
        || bundled
        || find_supermarket_csv_on_disk().is_some()
        || bundled_categories_index(app).is_some();
    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    let answered = get_setting(&conn, "catalog_setup_answered") == "1";
    // Primera vez: elegir vacío, ejemplos o catálogo super (si está el módulo).
    let needed = !answered;
    Ok(CatalogWizardState {
        needed,
        csv_available,
        catalog_ready: ready,
        bundled,
    })
}

pub fn read_catalog_import_status() -> Result<CatalogImportStatus, String> {
    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    let importing = get_setting(&conn, "catalog_importing") == "1";
    let done = get_setting(&conn, "catalog_import_done") == "1";
    let message = get_setting(&conn, "catalog_import_summary");

    let msg = if importing {
        if message.is_empty() {
            "Importando catálogo… Puede tardar varios minutos según la cantidad elegida.".into()
        } else {
            message
        }
    } else if done && !message.is_empty() {
        message
    } else if done {
        "Catálogo configurado.".into()
    } else {
        String::new()
    };

    Ok(CatalogImportStatus {
        importing,
        done,
        message: msg,
    })
}

pub fn list_supermarket_categories(
    app: &AppHandle,
    csv_path: Option<String>,
) -> Result<Vec<SupermarketCategory>, String> {
    let explicit_csv = csv_path.is_some();
    if explicit_csv {
        if let Some(path) = resolve_supermarket_csv_path_with_override(app, csv_path) {
            let rows = list_csv_primary_categories(&path)?;
            return Ok(rows
                .into_iter()
                .map(|(name, count)| SupermarketCategory { name, count })
                .collect());
        }
    }
    if let Some(index) = bundled_categories_index(app) {
        return Ok(index);
    }
    if let Some(path) = resolve_supermarket_csv_path_with_override(app, None) {
        let rows = list_csv_primary_categories(&path)?;
        return Ok(rows
            .into_iter()
            .map(|(name, count)| SupermarketCategory { name, count })
            .collect());
    }
    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    let from_db = list_db_supermarket_categories(&conn)?;
    if from_db.is_empty() {
        return Err(
            "El catálogo del instalador aún no está listo. Cerrá y abrí la app de nuevo, \
             o reinstalá con el instalador completo. Si tenés el archivo CSV, usá «Elegir archivo CSV»."
                .into(),
        );
    }
    Ok(from_db)
}

/// `mode`: empty | demo | skip | full | categories
pub fn apply_catalog_choice(
    app: AppHandle,
    mode: String,
    categories: Vec<String>,
) -> Result<(), String> {
    let csv_path = resolve_supermarket_csv_path(&app);
    let db_path = get_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    set_setting(&conn, "catalog_setup_answered", "1")?;
    set_setting(&conn, "catalog_import_choice", &mode)?;

    if mode == "skip" || mode == "empty" {
        set_setting(&conn, "catalog_import_done", "1")?;
        set_setting(
            &conn,
            "catalog_import_summary",
            "Comercio vacío. Cargá productos manualmente o con Excel/CSV.",
        )?;
        purge_demo_products(&conn)?;
        return Ok(());
    }

    if mode == "demo" {
        set_setting(&conn, "catalog_import_done", "1")?;
        set_setting(
            &conn,
            "catalog_import_summary",
            "Productos de ejemplo. Quitálos en Productos → «Quitar ejemplos».",
        )?;
        return Ok(());
    }

    let Some(path) = csv_path else {
        set_setting(&conn, "catalog_import_done", "1")?;
        set_setting(
            &conn,
            "catalog_import_summary",
            "No se encontró el archivo de catálogo en el instalador.",
        )?;
        return Ok(());
    };

    let cats_json = serde_json::to_string(&categories).unwrap_or_else(|_| "[]".into());
    set_setting(&conn, "catalog_import_categories", &cats_json)?;

    let filter = if mode == "categories" {
        let set: HashSet<String> = categories
            .iter()
            .map(|c| c.trim().to_lowercase())
            .filter(|c| !c.is_empty())
            .collect();
        if set.is_empty() {
            return Err("Elegí al menos una categoría.".into());
        }
        Some(set)
    } else {
        None
    };

    spawn_catalog_import(app, path, filter);
    Ok(())
}

pub fn spawn_catalog_import(_app: AppHandle, csv_path: String, categories_filter: Option<HashSet<String>>) {
    std::thread::spawn(move || {
        if let Err(e) = run_catalog_import(&csv_path, categories_filter) {
            eprintln!("Error importando catálogo: {e}");
            if let Ok(conn) = Connection::open(get_db_path().unwrap_or_default()) {
                let _ = set_setting(&conn, "catalog_importing", "0");
                let _ = set_setting(&conn, "catalog_import_summary", &format!("Error: {e}"));
            }
        }
    });
}

fn run_catalog_import(csv_path: &str, categories_filter: Option<HashSet<String>>) -> Result<(), String> {
    if !Path::new(csv_path).exists() {
        return Err("CSV no encontrado.".into());
    }

    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    set_setting(&conn, "catalog_importing", "1")?;
    let label = if categories_filter.is_some() {
        "Importando categorías seleccionadas…"
    } else {
        "Importando catálogo completo…"
    };
    set_setting(&conn, "catalog_import_summary", label)?;

    let result = import_products_csv(
        csv_path,
        ImportCsvOptions {
            update_existing: false,
            categories_filter,
            catalog_source: Some("supermarket".into()),
        },
    )?;
    purge_demo_products(&conn)?;
    let _ = crate::product_search::rebuild_products_fts(&conn);

    set_setting(&conn, "catalog_importing", "0")?;
    set_setting(&conn, "catalog_import_done", "1")?;
    set_setting(
        &conn,
        "catalog_import_summary",
        &format!(
            "Catálogo listo: {} productos nuevos, {} omitidos.",
            result.inserted, result.skipped
        ),
    )?;
    Ok(())
}

pub fn remove_supermarket_catalog(include_legacy: bool) -> Result<u32, String> {
    let total = remove_supermarket_catalog_safe(include_legacy, DEMO_BARCODES)?;
    if let Ok(conn) = Connection::open(get_db_path()?) {
        let _ = set_setting(
            &conn,
            "catalog_import_summary",
            &format!("Se quitaron {total} productos del catálogo masivo."),
        );
    }
    Ok(total)
}

#[derive(Serialize)]
pub struct AppStorageInfo {
    pub app_data_dir: String,
    pub database_path: String,
    pub catalog_csv_path: String,
    pub catalog_csv_ready: bool,
    pub catalog_bundled: bool,
    pub exe_dir: String,
}

pub fn read_app_storage_info(app: &AppHandle) -> Result<AppStorageInfo, String> {
    let app_data = get_app_data_dir()?;
    let db = get_db_path()?;
    let catalog = get_catalog_csv_dest()?;
    let catalog_ready = csv_file_usable(&catalog);
    let catalog_bundled = bundled_supermarket_csv_path(app).is_some();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_default();
    Ok(AppStorageInfo {
        app_data_dir: app_data.to_string_lossy().into_owned(),
        database_path: db.to_string_lossy().into_owned(),
        catalog_csv_path: catalog.to_string_lossy().into_owned(),
        catalog_csv_ready: catalog_ready,
        catalog_bundled,
        exe_dir: exe_dir.to_string_lossy().into_owned(),
    })
}

pub fn count_supermarket_products() -> Result<u32, String> {
    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM products WHERE active = 1 AND catalog_source = 'supermarket'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(n as u32)
}

fn reset_stuck_catalog_import() {
    let Ok(conn) = Connection::open(get_db_path().unwrap_or_default()) else {
        return;
    };
    if get_setting(&conn, "catalog_importing") != "1" {
        return;
    }
    let _ = set_setting(&conn, "catalog_importing", "0");
    if get_setting(&conn, "catalog_import_done") != "1" {
        let _ = set_setting(
            &conn,
            "catalog_import_summary",
            "La importación anterior se interrumpió. En Productos podés importar de nuevo o quitar el catálogo.",
        );
    }
}

/// Copia el CSV del instalador a AppData; no importa productos al iniciar.
pub fn try_start_bundled_import(app: &AppHandle) {
    reset_stuck_catalog_import();
    if let Err(e) = ensure_catalog_csv_copied_sync(app) {
        eprintln!("Catálogo CSV: {e}");
    }
}
