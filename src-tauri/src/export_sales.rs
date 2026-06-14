use crate::database::open_exclusive;
use std::fs::File;
use std::io::Write;
use std::path::Path;

fn since_modifier(days: i32) -> String {
    format!("-{days} days")
}

fn csv_cell(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn split_datetime(created_at: &str) -> (String, String) {
    let parts: Vec<&str> = created_at.split(' ').collect();
    if parts.len() >= 2 {
        return (parts[0].to_string(), parts[1].to_string());
    }
    (created_at.to_string(), String::new())
}

#[tauri::command]
pub fn export_sales_csv(file_path: String, days: i32) -> Result<u32, String> {
    let conn = open_exclusive()?;
    let since = since_modifier(days.max(1));

    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file = File::create(path).map_err(|e| e.to_string())?;
    writeln!(
        file,
        "fecha,hora,numero,subtotal,descuento_pct,total,medio_pago,pagado,vuelto,cliente,vendedor"
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.created_at, s.subtotal, s.discount_pct, s.total, s.payment_method,
                    s.paid, s.change_due, COALESCE(c.name, ''), COALESCE(u.display_name, '')
             FROM sales s
             LEFT JOIN customers c ON c.id = s.customer_id
             LEFT JOIN users u ON u.id = s.user_id
             WHERE s.voided = 0 AND date(s.created_at) >= date('now', 'localtime', ?1)
             ORDER BY s.created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query([&since]).map_err(|e| e.to_string())?;
    let mut count = 0u32;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: i64 = row.get(0).unwrap_or(0);
        let created_at: String = row.get(1).unwrap_or_default();
        let subtotal: f64 = row.get(2).unwrap_or(0.0);
        let discount_pct: f64 = row.get(3).unwrap_or(0.0);
        let total: f64 = row.get(4).unwrap_or(0.0);
        let payment_method: String = row.get(5).unwrap_or_default();
        let paid: Option<f64> = row.get(6).ok();
        let change_due: Option<f64> = row.get(7).ok();
        let customer: String = row.get(8).unwrap_or_default();
        let seller: String = row.get(9).unwrap_or_default();
        let (fecha, hora) = split_datetime(&created_at);

        writeln!(
            file,
            "{},{},{},{},{},{},{},{},{},{},{}",
            csv_cell(&fecha),
            csv_cell(&hora),
            id,
            subtotal,
            discount_pct,
            total,
            csv_cell(&payment_method),
            paid.unwrap_or(0.0),
            change_due.unwrap_or(0.0),
            csv_cell(&customer),
            csv_cell(&seller),
        )
        .map_err(|e| e.to_string())?;
        count += 1;
    }

    Ok(count)
}

#[tauri::command]
pub fn export_sales_detail_csv(file_path: String, days: i32) -> Result<u32, String> {
    let conn = open_exclusive()?;
    let since = since_modifier(days.max(1));

    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file = File::create(path).map_err(|e| e.to_string())?;
    writeln!(
        file,
        "fecha,numero_venta,producto,cantidad,precio_unit,descuento_pct,total_linea,medio_pago,vendedor"
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT s.created_at, s.id, si.name, si.qty, si.unit_price, si.discount_pct, si.line_total,
                    s.payment_method, COALESCE(u.display_name, '')
             FROM sale_items si
             JOIN sales s ON s.id = si.sale_id
             LEFT JOIN users u ON u.id = s.user_id
             WHERE s.voided = 0 AND date(s.created_at) >= date('now', 'localtime', ?1)
             ORDER BY s.created_at ASC, si.id ASC",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query([&since]).map_err(|e| e.to_string())?;
    let mut count = 0u32;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let created_at: String = row.get(0).unwrap_or_default();
        let sale_id: i64 = row.get(1).unwrap_or(0);
        let name: String = row.get(2).unwrap_or_default();
        let qty: f64 = row.get(3).unwrap_or(0.0);
        let unit_price: f64 = row.get(4).unwrap_or(0.0);
        let discount_pct: f64 = row.get(5).unwrap_or(0.0);
        let line_total: f64 = row.get(6).unwrap_or(0.0);
        let payment_method: String = row.get(7).unwrap_or_default();
        let seller: String = row.get(8).unwrap_or_default();
        let (fecha, _) = split_datetime(&created_at);

        writeln!(
            file,
            "{},{},{},{},{},{},{},{},{}",
            csv_cell(&fecha),
            sale_id,
            csv_cell(&name),
            qty,
            unit_price,
            discount_pct,
            line_total,
            csv_cell(&payment_method),
            csv_cell(&seller),
        )
        .map_err(|e| e.to_string())?;
        count += 1;
    }

    Ok(count)
}
