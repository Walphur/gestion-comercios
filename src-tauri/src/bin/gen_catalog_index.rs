//! Genera resources/catalog/categories_index.json desde productos_supermercado.csv
//! Uso: cargo run --bin gen_catalog_index -- <ruta.csv>

use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    let csv = env::args()
        .nth(1)
        .expect("Uso: gen_catalog_index <productos_supermercado.csv>");
    let rows = tauri_app_lib::import_products::list_csv_primary_categories(&csv)
        .unwrap_or_else(|e| panic!("{e}"));
    let out: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|(name, count)| serde_json::json!({ "name": name, "count": count }))
        .collect();
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dest = manifest_dir.join("resources/catalog/categories_index.json");
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).expect("mkdir resources/catalog");
    }
    let json = serde_json::to_string_pretty(&out).expect("json");
    fs::write(&dest, json).expect("write index");
    eprintln!("OK: {} categorías → {}", out.len(), dest.display());
}
