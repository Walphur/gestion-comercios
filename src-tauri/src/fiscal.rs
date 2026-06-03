use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FiscalResult {
    pub voucher_number: String,
    pub cae: String,
    pub cae_expires_at: String,
    pub qr_payload: String,
    pub raw_response: String,
}

/// Emisión fiscal simulada (homologación). Reemplazar por WSAA/WSFEv1 ARCA.
pub fn request_fiscal_invoice(conn: &Connection, sale_id: i64) -> Result<FiscalResult, String> {
    let (total, payment): (f64, String) = conn
        .query_row(
            "SELECT total, payment_method FROM sales WHERE id = ?1 AND voided = 0",
            [sale_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| format!("Venta {sale_id} no encontrada: {e}"))?;

    // Simula latencia de red sin bloquear el hilo principal de la UI (ya estamos en worker).
    std::thread::sleep(std::time::Duration::from_millis(400));

    let voucher_number = format!("0001-{:08}", sale_id);
    let cae = format!("{:014}", 70000000000000u64 + sale_id as u64);
    let expires = chrono_lite_expires();
    let qr = format!(
        "https://www.afip.gob.ar/fe/qr/?p={{\"ver\":1,\"sale\":{sale_id},\"tot\":{total}}}"
    );
    let raw = serde_json::json!({
        "sale_id": sale_id,
        "total": total,
        "payment_method": payment,
        "simulated": true,
        "voucher_number": voucher_number,
        "cae": cae,
    })
    .to_string();

    Ok(FiscalResult {
        voucher_number,
        cae,
        cae_expires_at: expires,
        qr_payload: qr,
        raw_response: raw,
    })
}

fn chrono_lite_expires() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let days = 10;
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + days * 86400;
    format!("{}", secs)
}

pub fn persist_fiscal_result(
    conn: &Connection,
    sale_id: i64,
    result: &FiscalResult,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO fiscal_documents
           (sale_id, voucher_type, voucher_number, cae, cae_expires_at, qr_payload, raw_response)
         VALUES (?1, 'B', ?2, ?3, ?4, ?5, ?6)",
        params![
            sale_id,
            result.voucher_number,
            result.cae,
            result.cae_expires_at,
            result.qr_payload,
            result.raw_response,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE sales SET fiscal_status = 'completed' WHERE id = ?1",
        [sale_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
