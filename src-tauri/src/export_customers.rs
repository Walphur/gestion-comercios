use crate::database::open_exclusive;
use rusqlite::Connection;
use std::fs::File;
use std::io::Write;
use std::path::Path;

fn csv_cell(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// Exporta clientes activos (con saldo / límite) a CSV.
pub fn write_customers_csv(conn: &Connection, file_path: &Path) -> Result<u32, String> {
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut stmt = conn
        .prepare(
            "SELECT name, phone, document, email, credit_limit, balance, notes, created_at
             FROM customers
             WHERE active = 1
             ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let mut file = File::create(file_path).map_err(|e| e.to_string())?;
    // BOM para Excel en Windows
    file.write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|e| e.to_string())?;
    writeln!(
        file,
        "nombre,telefono,documento,email,limite_credito,saldo,notas,alta"
    )
    .map_err(|e| e.to_string())?;

    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut count = 0u32;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let name: String = row.get(0).unwrap_or_default();
        let phone: Option<String> = row.get(1).unwrap_or(None);
        let document: Option<String> = row.get(2).unwrap_or(None);
        let email: Option<String> = row.get(3).unwrap_or(None);
        let credit_limit: f64 = row.get(4).unwrap_or(0.0);
        let balance: f64 = row.get(5).unwrap_or(0.0);
        let notes: Option<String> = row.get(6).unwrap_or(None);
        let created_at: String = row.get(7).unwrap_or_default();

        writeln!(
            file,
            "{},{},{},{},{},{},{},{}",
            csv_cell(&name),
            csv_cell(phone.as_deref().unwrap_or("")),
            csv_cell(document.as_deref().unwrap_or("")),
            csv_cell(email.as_deref().unwrap_or("")),
            credit_limit,
            balance,
            csv_cell(notes.as_deref().unwrap_or("")),
            csv_cell(&created_at),
        )
        .map_err(|e| e.to_string())?;
        count += 1;
    }

    Ok(count)
}

#[tauri::command]
pub fn export_customers_csv(file_path: String) -> Result<u32, String> {
    let conn = open_exclusive()?;
    write_customers_csv(&conn, Path::new(&file_path))
}
