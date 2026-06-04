use crate::db_path::get_db_path;
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
}

const DEMO_BARCODES: &[&str] = &[
    "7790895000011", "7790895000028", "7798065000015", "7799312000010", "7790315980012",
    "7790315980029", "7790733001024", "7790748000010", "7798154000011", "7798154000028",
    "7798154000035", "7791132000015", "7791132000022", "7791132000039", "7790741000010",
    "7790741000027", "7790741000034", "7790315000018", "7790315000025", "7790001999999",
];

pub fn bundled_supermarket_csv_path(app: &AppHandle) -> Option<String> {
    let path = app
        .path()
        .resolve("productos_supermercado.csv", tauri::path::BaseDirectory::Resource)
        .ok()?;
    if path.exists() {
        Some(path.to_string_lossy().into_owned())
    } else {
        None
    }
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

fn purge_demo_products(conn: &Connection) -> Result<(), String> {
    for barcode in DEMO_BARCODES {
        conn.execute(
            "UPDATE products SET active = 0 WHERE barcode = ?1 AND active = 1",
            [barcode],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn read_catalog_wizard_state(app: &AppHandle) -> Result<CatalogWizardState, String> {
    let csv_available = resolve_supermarket_csv_path(app).is_some();
    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    let answered = get_setting(&conn, "catalog_setup_answered") == "1";
    let done = get_setting(&conn, "catalog_import_done") == "1";
    let needed = csv_available && !answered && !done;
    Ok(CatalogWizardState {
        needed,
        csv_available,
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
    if let Some(path) = resolve_supermarket_csv_path_with_override(app, csv_path) {
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
            "No hay catálogo en el instalador. Copiá productos_supermercado.csv junto al programa \
             o usá «Elegir archivo CSV» (también podés definir GESTION_SUPERMARKET_CSV)."
                .into(),
        );
    }
    Ok(from_db)
}

/// `mode`: skip | full | categories
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

    if mode == "skip" {
        set_setting(&conn, "catalog_import_done", "1")?;
        set_setting(
            &conn,
            "catalog_import_summary",
            "Sin catálogo masivo. Podés cargar productos manualmente o por CSV.",
        )?;
        purge_demo_products(&conn)?;
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

fn deactivate_products_batch(conn: &Connection, sql: &str) -> Result<u32, String> {
    let mut total = 0u32;
    loop {
        let n = conn.execute(sql, []).map_err(|e| e.to_string())? as u32;
        if n == 0 {
            break;
        }
        total += n;
    }
    Ok(total)
}

pub fn remove_supermarket_catalog(include_legacy: bool) -> Result<u32, String> {
    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    let mut total = 0u32;

    let batch_sql = "UPDATE products SET active = 0, updated_at=datetime('now','localtime')
         WHERE id IN (
           SELECT id FROM products
           WHERE active = 1 AND catalog_source = 'supermarket'
           LIMIT 3000
         )";
    total += deactivate_products_batch(&conn, batch_sql)?;

    if include_legacy && total == 0 {
        let demo_list: String = DEMO_BARCODES
            .iter()
            .map(|b| format!("'{b}'"))
            .collect::<Vec<_>>()
            .join(",");
        let legacy_batch = format!(
            "UPDATE products SET active = 0, updated_at=datetime('now','localtime')
             WHERE id IN (
               SELECT id FROM products
               WHERE active = 1 AND catalog_source IS NULL AND barcode IS NOT NULL
               AND barcode NOT IN ({demo_list})
               LIMIT 3000
             )"
        );
        total += deactivate_products_batch(&conn, &legacy_batch)?;
    }

    let _ = crate::product_search::rebuild_products_fts(&conn);
    set_setting(
        &conn,
        "catalog_import_summary",
        &format!("Se quitaron {total} productos del catálogo masivo."),
    )?;
    Ok(total)
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

/// Ya no importa automáticamente: el usuario elige en el asistente.
pub fn try_start_bundled_import(_app: &AppHandle) {
    // Intencionalmente vacío (antes importaba todo al abrir).
}
