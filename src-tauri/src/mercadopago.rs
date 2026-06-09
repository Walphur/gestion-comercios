use crate::database::open_exclusive;
use crate::settings_util::{read_setting, read_setting_flag, read_setting_or};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

const MP_ORDERS_URL: &str = "https://api.mercadopago.com/v1/orders";

#[derive(Debug, Serialize, Deserialize)]
pub struct MpQrOrderResult {
    pub order_id: String,
    pub external_reference: String,
    pub qr_data: String,
    pub simulated: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MpPaymentStatus {
    pub status: String,
    pub status_detail: Option<String>,
    pub payment_id: Option<String>,
}

fn mp_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())
}

fn extract_qr_data(body: &serde_json::Value) -> Option<String> {
    body.pointer("/type_response/qr_data")
        .or_else(|| body.pointer("/config/qr/qr_data"))
        .or_else(|| body.get("qr_data"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn extract_order_id(body: &serde_json::Value) -> Option<String> {
    body.get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

#[tauri::command]
pub fn create_mp_qr_order(
    amount: f64,
    description: String,
    external_reference: String,
) -> Result<MpQrOrderResult, String> {
    if amount <= 0.0 {
        return Err("El monto debe ser mayor a cero.".into());
    }

    let conn = open_exclusive()?;
    if !read_setting_flag(&conn, "mp_enabled") {
        return Err("Mercado Pago no está activado en Administración.".into());
    }

    let token = read_setting_or(&conn, "mp_access_token", "");
    if token.trim().is_empty() {
        return Err("Falta el Access Token de Mercado Pago en Administración.".into());
    }

    if read_setting_flag(&conn, "mp_simulation") || token.eq_ignore_ascii_case("TEST") {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        return Ok(MpQrOrderResult {
            order_id: format!("SIM-{}-{}", ts, &Uuid::new_v4().to_string()[..8]),
            external_reference: external_reference.clone(),
            qr_data: format!(
                "MP-SIM|ref={}|amount={:.2}|desc={}",
                external_reference,
                amount,
                description.chars().take(40).collect::<String>()
            ),
            simulated: true,
        });
    }

    let external_pos_id = read_setting_or(&conn, "mp_external_pos_id", "CAJA1");
    let amount_str = format!("{:.2}", amount);

    let payload = json!({
        "type": "qr",
        "total_amount": amount_str,
        "description": description,
        "external_reference": external_reference,
        "expiration_time": "PT16M",
        "config": {
            "qr": {
                "external_pos_id": external_pos_id,
                "mode": "dynamic"
            }
        },
        "transactions": {
            "payments": [{ "amount": amount_str }]
        }
    });

    let client = mp_client()?;
    let idempotency = Uuid::new_v4().to_string();
    let response = client
        .post(MP_ORDERS_URL)
        .header("Authorization", format!("Bearer {}", token.trim()))
        .header("Content-Type", "application/json")
        .header("X-Idempotency-Key", idempotency)
        .json(&payload)
        .send()
        .map_err(|e| format!("Sin conexión con Mercado Pago: {e}"))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .map_err(|e| format!("Respuesta inválida de Mercado Pago: {e}"))?;

    if !status.is_success() {
        let msg = body
            .pointer("/message")
            .or_else(|| body.pointer("/error"))
            .and_then(|v| v.as_str())
            .unwrap_or("Error desconocido");
        let detail = body
            .pointer("/cause/0/description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        return Err(format!("Mercado Pago ({status}): {msg} {detail}").trim().to_string());
    }

    let order_id = extract_order_id(&body).ok_or("Mercado Pago no devolvió ID de orden.")?;
    let qr_data = extract_qr_data(&body).ok_or(
        "Mercado Pago no devolvió qr_data. Verificá external_pos_id y credenciales de producción.",
    )?;

    Ok(MpQrOrderResult {
        order_id,
        external_reference,
        qr_data,
        simulated: false,
    })
}

fn order_is_paid(body: &serde_json::Value) -> (bool, Option<String>, Option<String>) {
    let status = body
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();

    if matches!(status.as_str(), "paid" | "processed" | "closed") {
        let payment_id = body
            .pointer("/transactions/payments/0/id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        return (true, Some(status), payment_id);
    }

    if let Some(payments) = body.pointer("/transactions/payments").and_then(|v| v.as_array()) {
        for p in payments {
            let ps = p.get("status").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
            if ps == "approved" || ps == "processed" {
                let payment_id = p.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                return (true, Some(ps), payment_id);
            }
        }
    }

    (
        false,
        Some(status),
        body
            .pointer("/status_detail")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    )
}

#[tauri::command]
pub fn check_mp_order_status(order_id: String, simulated: bool) -> Result<MpPaymentStatus, String> {
    if simulated || order_id.starts_with("SIM-") {
        if let Some(rest) = order_id.strip_prefix("SIM-") {
            let ts_str = rest.split('-').next().unwrap_or("");
            if let Ok(ts) = ts_str.parse::<u64>() {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                if now.saturating_sub(ts) >= 3000 {
                    return Ok(MpPaymentStatus {
                        status: "approved".into(),
                        status_detail: Some("simulated".into()),
                        payment_id: Some(format!("SIM-PAY-{order_id}")),
                    });
                }
            }
        }
        return Ok(MpPaymentStatus {
            status: "pending".into(),
            status_detail: Some("simulated".into()),
            payment_id: None,
        });
    }

    let conn = open_exclusive()?;
    let token = read_setting_or(&conn, "mp_access_token", "");
    if token.trim().is_empty() {
        return Err("Falta Access Token de Mercado Pago.".into());
    }

    let client = mp_client()?;
    let url = format!("{MP_ORDERS_URL}/{order_id}");
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token.trim()))
        .send()
        .map_err(|e| format!("Sin conexión con Mercado Pago: {e}"))?;

    let status_code = response.status();
    let body: serde_json::Value = response
        .json()
        .map_err(|e| format!("Respuesta inválida: {e}"))?;

    if !status_code.is_success() {
        let msg = body
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("No se pudo consultar la orden");
        return Err(msg.to_string());
    }

    let (paid, st, detail) = order_is_paid(&body);
    Ok(MpPaymentStatus {
        status: if paid {
            "approved".into()
        } else {
            st.unwrap_or_else(|| "pending".into())
        },
        status_detail: detail,
        payment_id: if paid {
            body.pointer("/transactions/payments/0/id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        } else {
            None
        },
    })
}

#[derive(Debug, Serialize)]
pub struct MpConfigStatus {
    pub enabled: bool,
    pub configured: bool,
    pub simulation: bool,
}

#[tauri::command]
pub fn get_mp_config_status() -> Result<MpConfigStatus, String> {
    let conn = open_exclusive()?;
    let enabled = read_setting_flag(&conn, "mp_enabled");
    let token = read_setting(&conn, "mp_access_token").unwrap_or_default();
    let pos = read_setting(&conn, "mp_external_pos_id").unwrap_or_default();
    let simulation = read_setting_flag(&conn, "mp_simulation") || token.eq_ignore_ascii_case("TEST");
    Ok(MpConfigStatus {
        enabled,
        configured: !token.trim().is_empty() && !pos.trim().is_empty(),
        simulation,
    })
}
