use crate::db_path::get_db_path;
use rusqlite::Connection;
use std::fs::File;
use std::io::Write;
use std::path::Path;

#[tauri::command]
pub fn export_products_csv(file_path: String) -> Result<u32, String> {
    let conn = Connection::open(get_db_path()?).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT p.barcode, p.name, b.name, s.name, c.name, p.price, p.cost, p.stock, p.min_stock, p.sku
             FROM products p
             LEFT JOIN brands b ON b.id = p.brand_id
             LEFT JOIN suppliers s ON s.id = p.supplier_id
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.active = 1
             ORDER BY p.name",
        )
        .map_err(|e| e.to_string())?;

    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file = File::create(path).map_err(|e| e.to_string())?;
    writeln!(
        file,
        "barcode,nombre,marca,proveedor,categoria,precio,costo,stock,stock_minimo,sku"
    )
    .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query([])
        .map_err(|e| e.to_string())?;

    let mut count = 0u32;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let barcode: Option<String> = row.get(0).unwrap_or(None);
        let name: String = row.get(1).unwrap_or_default();
        let brand: Option<String> = row.get(2).unwrap_or(None);
        let supplier: Option<String> = row.get(3).unwrap_or(None);
        let category: Option<String> = row.get(4).unwrap_or(None);
        let price: f64 = row.get(5).unwrap_or(0.0);
        let cost: f64 = row.get(6).unwrap_or(0.0);
        let stock: f64 = row.get(7).unwrap_or(0.0);
        let min_stock: f64 = row.get(8).unwrap_or(0.0);
        let sku: Option<String> = row.get(9).unwrap_or(None);

        writeln!(
            file,
            "{},{},{},{},{},{},{},{},{},{}",
            csv_cell(barcode.as_deref().unwrap_or("")),
            csv_cell(&name),
            csv_cell(brand.as_deref().unwrap_or("")),
            csv_cell(supplier.as_deref().unwrap_or("")),
            csv_cell(category.as_deref().unwrap_or("")),
            price,
            cost,
            stock,
            min_stock,
            csv_cell(sku.as_deref().unwrap_or("")),
        )
        .map_err(|e| e.to_string())?;
        count += 1;
    }

    Ok(count)
}

fn csv_cell(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}
