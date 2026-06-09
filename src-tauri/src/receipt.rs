use crate::database::open_exclusive;
use crate::settings_util::{read_setting_or, read_setting_flag};
use serde::Serialize;
use std::io::Write;
use std::net::TcpStream;
use std::path::PathBuf;
use std::time::Duration;

#[derive(Serialize)]
pub struct ReceiptPrintResult {
    pub printed: bool,
    pub drawer_opened: bool,
    pub mode: String,
    pub message: String,
}

struct SaleReceipt {
    business_name: String,
    sale_id: i64,
    created_at: String,
    payment_method: String,
    total: f64,
    paid: Option<f64>,
    change_due: Option<f64>,
    items: Vec<(String, f64, f64, f64)>,
}

fn load_sale_receipt(sale_id: i64) -> Result<SaleReceipt, String> {
    let conn = open_exclusive()?;
    let business_name = read_setting_or(&conn, "business_name", "Gestión Comercios");

    let (total, payment_method, paid, change_due, created_at): (
        f64,
        String,
        Option<f64>,
        Option<f64>,
        String,
    ) = conn
        .query_row(
            "SELECT total, payment_method, paid, change_due, created_at FROM sales WHERE id = ?1 AND voided = 0",
            [sale_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .map_err(|_| format!("Venta {sale_id} no encontrada"))?;

    let mut stmt = conn
        .prepare(
            "SELECT name, qty, unit_price, line_total FROM sale_items WHERE sale_id = ?1 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([sale_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, f64>(1)?,
                r.get::<_, f64>(2)?,
                r.get::<_, f64>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        let (name, qty, unit_price, line_total) = row.map_err(|e| e.to_string())?;
        items.push((name, qty, unit_price, line_total));
    }

    Ok(SaleReceipt {
        business_name,
        sale_id,
        created_at,
        payment_method,
        total,
        paid,
        change_due,
        items,
    })
}

fn esc_init() -> Vec<u8> {
    vec![0x1B, 0x40]
}

fn esc_drawer_pulse() -> Vec<u8> {
    vec![0x1B, 0x70, 0x00, 0x19, 0xFA]
}

fn esc_cut() -> Vec<u8> {
    vec![0x1D, 0x56, 0x00]
}

fn esc_align_center() -> Vec<u8> {
    vec![0x1B, 0x61, 0x01]
}

fn esc_align_left() -> Vec<u8> {
    vec![0x1B, 0x61, 0x00]
}

fn esc_bold(on: bool) -> Vec<u8> {
    vec![0x1B, 0x45, if on { 1 } else { 0 }]
}

fn text_line(s: &str) -> Vec<u8> {
    let mut out = Vec::new();
    for ch in s.chars() {
        if ch == '\n' {
            out.push(b'\n');
            continue;
        }
        if ch.is_ascii() {
            out.push(ch as u8);
        } else {
            // Fallback ASCII para acentos comunes
            let rep = match ch {
                'á' => "a",
                'é' => "e",
                'í' => "i",
                'ó' => "o",
                'ú' => "u",
                'Á' => "A",
                'É' => "E",
                'Í' => "I",
                'Ó' => "O",
                'Ú' => "U",
                'ñ' => "n",
                'Ñ' => "N",
                'ü' => "u",
                'Ü' => "U",
                '¿' => "?",
                '¡' => "!",
                _ => "?",
            };
            out.extend_from_slice(rep.as_bytes());
        }
    }
    out.push(b'\n');
    out
}

fn pad_line(left: &str, right: &str, width: usize) -> String {
    let lw = left.chars().count();
    let rw = right.chars().count();
    if lw + rw + 1 >= width {
        return format!("{left} {right}");
    }
    let spaces = width.saturating_sub(lw + rw);
    format!("{left}{:>spaces$}{right}", "")
}

fn build_receipt_bytes(receipt: &SaleReceipt, width: usize) -> Vec<u8> {
    let mut data = Vec::new();
    data.extend(esc_init());
    data.extend(esc_align_center());
    data.extend(esc_bold(true));
    data.extend(text_line(&receipt.business_name));
    data.extend(esc_bold(false));
    data.extend(text_line("TICKET DE VENTA"));
    data.extend(esc_align_left());
    data.extend(text_line(&format!("Venta #{}", receipt.sale_id)));
    data.extend(text_line(&receipt.created_at));
    data.extend(text_line(&"-".repeat(width.min(48))));

    for (name, qty, unit_price, line_total) in &receipt.items {
        let name_trim = if name.chars().count() > width {
            name.chars().take(width - 3).collect::<String>() + "..."
        } else {
            name.clone()
        };
        data.extend(text_line(&name_trim));
        let detail = format!(
            "{:.2} x {:.2}",
            qty,
            unit_price
        );
        data.extend(text_line(&pad_line(
            &detail,
            &format!("{:.2}", line_total),
            width,
        )));
    }

    data.extend(text_line(&"-".repeat(width.min(48))));
    data.extend(esc_bold(true));
    data.extend(text_line(&pad_line(
        "TOTAL",
        &format!("${:.2}", receipt.total),
        width,
    )));
    data.extend(esc_bold(false));
    data.extend(text_line(&format!("Pago: {}", receipt.payment_method)));

    if let Some(paid) = receipt.paid {
        data.extend(text_line(&format!("Recibido: ${paid:.2}")));
    }
    if let Some(change) = receipt.change_due {
        if change > 0.001 {
            data.extend(text_line(&format!("Vuelto: ${change:.2}")));
        }
    }

    data.extend(text_line(""));
    data.extend(esc_align_center());
    data.extend(text_line("Gracias por su compra"));
    data.extend(text_line(""));
    data.extend(esc_cut());
    data
}

fn send_to_printer(bytes: &[u8]) -> Result<String, String> {
    let conn = open_exclusive()?;
    let mode = read_setting_or(&conn, "printer_mode", "off");
    match mode.as_str() {
        "off" => Ok("off".into()),
        "file" => {
            let path = read_setting_or(&conn, "printer_file_path", "receipt_last.bin");
            let mut file_path = PathBuf::from(&path);
            if file_path.extension().is_none() {
                if let Ok(db) = crate::db_path::get_db_path() {
                    if let Some(parent) = db.parent() {
                        file_path = parent.join("receipt_last.bin");
                    }
                }
            }
            std::fs::write(&file_path, bytes).map_err(|e| e.to_string())?;
            Ok(format!("file:{}", file_path.display()))
        }
        "network" => {
            let host = read_setting_or(&conn, "printer_host", "192.168.1.100");
            let port: u16 = read_setting_or(&conn, "printer_port", "9100")
                .parse()
                .unwrap_or(9100);
            let addr = format!("{host}:{port}");
            let mut stream = TcpStream::connect_timeout(
                &addr.parse().map_err(|e: std::net::AddrParseError| e.to_string())?,
                Duration::from_secs(5),
            )
            .map_err(|e| format!("No se pudo conectar a la impresora ({addr}): {e}"))?;
            stream
                .write_all(bytes)
                .map_err(|e| format!("Error al imprimir: {e}"))?;
            stream.flush().ok();
            Ok(format!("network:{addr}"))
        }
        other => Err(format!("Modo de impresora desconocido: {other}")),
    }
}

#[tauri::command]
pub fn print_sale_receipt(sale_id: i64, open_drawer: bool) -> Result<ReceiptPrintResult, String> {
    let conn = open_exclusive()?;
    let enabled = read_setting_flag(&conn, "printer_enabled");
    if !enabled {
        return Ok(ReceiptPrintResult {
            printed: false,
            drawer_opened: false,
            mode: "off".into(),
            message: "Impresora desactivada.".into(),
        });
    }

    let width: usize = read_setting_or(&conn, "printer_width", "42")
        .parse()
        .unwrap_or(42);
    let receipt = load_sale_receipt(sale_id)?;
    let mut bytes = build_receipt_bytes(&receipt, width);

    if open_drawer {
        bytes.extend(esc_drawer_pulse());
    }

    let mode = send_to_printer(&bytes)?;
    Ok(ReceiptPrintResult {
        printed: mode != "off",
        drawer_opened: open_drawer && mode != "off",
        mode: mode.clone(),
        message: if mode == "off" {
            "Impresora desactivada.".into()
        } else {
            "Ticket enviado a la impresora.".into()
        },
    })
}

#[tauri::command]
pub fn test_printer_connection() -> Result<String, String> {
    let conn = open_exclusive()?;
    let mode = read_setting_or(&conn, "printer_mode", "off");
    if mode == "off" {
        return Err("Activá la impresora en Administración.".into());
    }

    let mut bytes = esc_init();
    bytes.extend(esc_align_center());
    bytes.extend(text_line("GESTION COMERCIOS"));
    bytes.extend(text_line("Prueba de impresora OK"));
    bytes.extend(esc_cut());
    bytes.extend(esc_drawer_pulse());

    let result = send_to_printer(&bytes)?;
    Ok(format!("Prueba enviada ({result})"))
}
