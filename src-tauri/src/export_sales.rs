use crate::database::open_exclusive;
use crate::settings_util::read_setting_or;
use std::fs::File;
use std::io::Write;
use std::path::Path;

fn since_modifier(days: i32) -> String {
    format!("-{days} days")
}

fn csv_cell(s: &str) -> String {
    if s.contains(';') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn fmt_money(n: f64) -> String {
    format!("{n:.2}")
}

fn payment_label(method: &str) -> String {
    match method.to_lowercase().as_str() {
        "efectivo" => "Efectivo".into(),
        "tarjeta" => "Tarjeta".into(),
        "transferencia" => "Transferencia".into(),
        "mercadopago" | "mercado_pago" => "Mercado Pago".into(),
        "fiado" | "cuenta_corriente" => "Fiado".into(),
        other => {
            if other.is_empty() {
                "—".into()
            } else {
                let mut c = other.chars();
                match c.next() {
                    None => String::new(),
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                }
            }
        }
    }
}

fn split_datetime(created_at: &str) -> (String, String) {
    let parts: Vec<&str> = created_at.split(' ').collect();
    if parts.len() >= 2 {
        return (parts[0].to_string(), parts[1].to_string());
    }
    (created_at.to_string(), String::new())
}

fn local_now_label() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let days = secs / 86400;
    let day_secs = secs % 86400;
    let h = day_secs / 3600;
    let m = (day_secs % 3600) / 60;
    let year = 1970 + (days / 365);
    let month = ((days % 365) / 30) + 1;
    let day = (days % 30) + 1;
    format!("{year:04}-{month:02}-{day:02} {h:02}:{m:02}")
}

fn write_bom(file: &mut File) -> Result<(), String> {
    file.write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_sales_csv(file_path: String, days: i32) -> Result<u32, String> {
    let conn = open_exclusive()?;
    let since = since_modifier(days.max(1));
    let business = read_setting_or(&conn, "business_name", "Gestión Comercios");

    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file = File::create(path).map_err(|e| e.to_string())?;
    write_bom(&mut file)?;

    writeln!(file, "Gestión Comercios - Resumen de ventas").map_err(|e| e.to_string())?;
    writeln!(file, "Comercio;{}", csv_cell(&business)).map_err(|e| e.to_string())?;
    writeln!(file, "Generado;{}", local_now_label()).map_err(|e| e.to_string())?;
    writeln!(file, "Período;últimos {} días", days.max(1)).map_err(|e| e.to_string())?;
    writeln!(file).map_err(|e| e.to_string())?;

    // Resumen por medio de pago
    writeln!(file, "RESUMEN POR MEDIO DE PAGO").map_err(|e| e.to_string())?;
    writeln!(file, "Medio de pago;Operaciones;Total").map_err(|e| e.to_string())?;

    let mut pay_stmt = conn
        .prepare(
            "SELECT payment_method, COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS sum_total
             FROM sales
             WHERE voided = 0 AND date(created_at) >= date('now', 'localtime', ?1)
             GROUP BY payment_method
             ORDER BY sum_total DESC",
        )
        .map_err(|e| e.to_string())?;
    let mut pay_rows = pay_stmt.query([&since]).map_err(|e| e.to_string())?;
    let mut grand_total = 0.0f64;
    let mut grand_count = 0i64;
    while let Some(row) = pay_rows.next().map_err(|e| e.to_string())? {
        let method: String = row.get(0).unwrap_or_default();
        let cnt: i64 = row.get(1).unwrap_or(0);
        let sum: f64 = row.get(2).unwrap_or(0.0);
        grand_total += sum;
        grand_count += cnt;
        writeln!(
            file,
            "{};{};{}",
            csv_cell(&payment_label(&method)),
            cnt,
            fmt_money(sum)
        )
        .map_err(|e| e.to_string())?;
    }
    writeln!(
        file,
        "TOTAL GENERAL;{};{}",
        grand_count,
        fmt_money(grand_total)
    )
    .map_err(|e| e.to_string())?;
    writeln!(file).map_err(|e| e.to_string())?;

    // Resumen por día
    writeln!(file, "RESUMEN POR DÍA").map_err(|e| e.to_string())?;
    writeln!(file, "Fecha;Operaciones;Total").map_err(|e| e.to_string())?;
    let mut day_stmt = conn
        .prepare(
            "SELECT date(created_at) AS d, COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS sum_total
             FROM sales
             WHERE voided = 0 AND date(created_at) >= date('now', 'localtime', ?1)
             GROUP BY date(created_at)
             ORDER BY d ASC",
        )
        .map_err(|e| e.to_string())?;
    let mut day_rows = day_stmt.query([&since]).map_err(|e| e.to_string())?;
    while let Some(row) = day_rows.next().map_err(|e| e.to_string())? {
        let day: String = row.get(0).unwrap_or_default();
        let cnt: i64 = row.get(1).unwrap_or(0);
        let sum: f64 = row.get(2).unwrap_or(0.0);
        writeln!(file, "{};{};{}", csv_cell(&day), cnt, fmt_money(sum))
            .map_err(|e| e.to_string())?;
    }
    writeln!(file).map_err(|e| e.to_string())?;

    // Detalle
    writeln!(file, "DETALLE DE VENTAS").map_err(|e| e.to_string())?;
    writeln!(
        file,
        "Fecha;Hora;Nº venta;Subtotal;Descuento %;Total;Medio de pago;Pagado;Vuelto;Cliente;Vendedor"
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.created_at, s.subtotal, s.discount_pct, s.total, s.payment_method,
                    s.paid, s.change_due, COALESCE(c.name, ''), COALESCE(u.display_name, 'Cajero')
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
        let seller: String = row.get(9).unwrap_or_else(|_| "Cajero".into());
        let (fecha, hora) = split_datetime(&created_at);
        let customer_out = if customer.is_empty() {
            "—"
        } else {
            &customer
        };

        writeln!(
            file,
            "{};{};{};{};{};{};{};{};{};{};{}",
            csv_cell(&fecha),
            csv_cell(&hora),
            id,
            fmt_money(subtotal),
            fmt_money(discount_pct),
            fmt_money(total),
            csv_cell(&payment_label(&payment_method)),
            fmt_money(paid.unwrap_or(0.0)),
            fmt_money(change_due.unwrap_or(0.0)),
            csv_cell(customer_out),
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
    let business = read_setting_or(&conn, "business_name", "Gestión Comercios");

    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file = File::create(path).map_err(|e| e.to_string())?;
    write_bom(&mut file)?;

    writeln!(file, "Gestión Comercios - Detalle por producto").map_err(|e| e.to_string())?;
    writeln!(file, "Comercio;{}", csv_cell(&business)).map_err(|e| e.to_string())?;
    writeln!(file, "Generado;{}", local_now_label()).map_err(|e| e.to_string())?;
    writeln!(file, "Período;últimos {} días", days.max(1)).map_err(|e| e.to_string())?;
    writeln!(file).map_err(|e| e.to_string())?;

    let (line_count, line_total): (i64, f64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(si.line_total), 0)
             FROM sale_items si
             JOIN sales s ON s.id = si.sale_id
             WHERE s.voided = 0 AND date(s.created_at) >= date('now', 'localtime', ?1)",
            [&since],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((0, 0.0));

    writeln!(file, "RESUMEN").map_err(|e| e.to_string())?;
    writeln!(file, "Líneas de venta;{}", line_count).map_err(|e| e.to_string())?;
    writeln!(file, "Importe total;{}", fmt_money(line_total)).map_err(|e| e.to_string())?;
    writeln!(file).map_err(|e| e.to_string())?;

    writeln!(file, "DETALLE POR PRODUCTO").map_err(|e| e.to_string())?;
    writeln!(
        file,
        "Fecha;Hora;Nº venta;Producto;Cantidad;Precio unit.;Descuento %;Total línea;Medio de pago;Vendedor"
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT s.created_at, s.id, si.name, si.qty, si.unit_price, si.discount_pct, si.line_total,
                    s.payment_method, COALESCE(u.display_name, 'Cajero')
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
        let seller: String = row.get(8).unwrap_or_else(|_| "Cajero".into());
        let (fecha, hora) = split_datetime(&created_at);

        writeln!(
            file,
            "{};{};{};{};{};{};{};{};{};{}",
            csv_cell(&fecha),
            csv_cell(&hora),
            sale_id,
            csv_cell(&name),
            fmt_money(qty),
            fmt_money(unit_price),
            fmt_money(discount_pct),
            fmt_money(line_total),
            csv_cell(&payment_label(&payment_method)),
            csv_cell(&seller),
        )
        .map_err(|e| e.to_string())?;
        count += 1;
    }

    Ok(count)
}
