use crate::database::open_exclusive;
use crate::mercadopago_oauth::{mp_access_token_for_api, oauth_connected_nickname, repair_mp_store_and_pos};
use crate::mp_app_credentials::mp_oauth_available;
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

fn format_mp_api_error(status: reqwest::StatusCode, body: &serde_json::Value) -> String {
    let mut parts = Vec::new();
    if let Some(msg) = body.get("message").and_then(|v| v.as_str()) {
        if !msg.is_empty() {
            parts.push(msg.to_string());
        }
    }
    if let Some(causes) = body.get("cause").and_then(|v| v.as_array()) {
        for cause in causes {
            if let Some(code) = cause.get("code").and_then(|v| v.as_str()) {
                if !code.is_empty() {
                    parts.push(code.to_string());
                }
            }
            if let Some(desc) = cause.get("description").and_then(|v| v.as_str()) {
                if !desc.is_empty() {
                    parts.push(desc.to_string());
                }
            }
        }
    }
    if parts.is_empty() {
        parts.push("Error desconocido".to_string());
    }
    format!("Mercado Pago ({status}): {}", parts.join(" — "))
}

fn mp_order_needs_pos_repair(status: reqwest::StatusCode, body: &serde_json::Value) -> bool {
    if status.as_u16() == 404 {
        return true;
    }
    body.get("cause")
        .and_then(|v| v.as_array())
        .map(|causes| {
            causes.iter().any(|c| {
                c.get("code")
                    .and_then(|v| v.as_str())
                    .map(|code| code.eq_ignore_ascii_case("pos_not_found"))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn sanitize_mp_field(value: &str, max_len: usize, fallback: &str) -> String {
    let cleaned: String = value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '-' | '_'))
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.chars().take(max_len).collect()
    }
}

fn post_mp_qr_order(
    client: &Client,
    token: &str,
    external_pos_id: &str,
    amount: f64,
    description: &str,
    external_reference: &str,
) -> Result<(reqwest::StatusCode, serde_json::Value), String> {
    let amount_str = format!("{:.2}", amount);
    let safe_description = sanitize_mp_field(description, 150, "Venta");
    let safe_reference = sanitize_mp_field(external_reference, 64, "pos-venta");
    let payload = json!({
        "type": "qr",
        "total_amount": amount_str,
        "description": safe_description,
        "external_reference": safe_reference,
        "expiration_time": "PT15M",
        "config": {
            "qr": {
                "external_pos_id": external_pos_id,
                "mode": "dynamic"
            }
        },
        "transactions": {
            "payments": [{ "amount": amount_str }]
        },
        "items": [{
            "title": safe_description,
            "unit_price": amount_str,
            "quantity": 1,
            "unit_measure": "unit"
        }]
    });

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
    Ok((status, body))
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

    let token = match mp_access_token_for_api(&conn) {
        Ok(t) => t,
        Err(_) => {
            let manual = read_setting_or(&conn, "mp_access_token", "");
            if manual.trim().is_empty() {
                return Err("Conectá Mercado Pago en Administración → Negocio y caja.".into());
            }
            manual
        }
    };

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

    let mut external_pos_id = read_setting_or(&conn, "mp_external_pos_id", "");
    if external_pos_id.trim().is_empty() {
        let (_, pos_id) = repair_mp_store_and_pos(&conn)?;
        external_pos_id = pos_id;
    }

    let client = mp_client()?;
    let (status, body) = post_mp_qr_order(
        &client,
        &token,
        external_pos_id.trim(),
        amount,
        &description,
        &external_reference,
    )?;

    let (status, body) = if !status.is_success() && mp_order_needs_pos_repair(status, &body) {
        let (_, pos_id) = repair_mp_store_and_pos(&conn)?;
        post_mp_qr_order(
            &client,
            &token,
            pos_id.trim(),
            amount,
            &description,
            &external_reference,
        )?
    } else {
        (status, body)
    };

    if !status.is_success() {
        return Err(format_mp_api_error(status, &body));
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
    let token = match mp_access_token_for_api(&conn) {
        Ok(t) => t,
        Err(_) => {
            let manual = read_setting_or(&conn, "mp_access_token", "");
            if manual.trim().is_empty() {
                return Err("Mercado Pago no está conectado.".into());
            }
            manual
        }
    };

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
    pub oauth_connected: bool,
    pub oauth_available: bool,
    pub nickname: Option<String>,
}

#[tauri::command]
pub fn get_mp_config_status() -> Result<MpConfigStatus, String> {
    let conn = open_exclusive()?;
    let enabled = read_setting_flag(&conn, "mp_enabled");
    let token = read_setting(&conn, "mp_access_token").unwrap_or_default();
    let pos = read_setting(&conn, "mp_external_pos_id").unwrap_or_default();
    let oauth_connected = read_setting_flag(&conn, "mp_oauth_connected");
    let simulation =
        read_setting_flag(&conn, "mp_simulation") || (!oauth_connected && token.eq_ignore_ascii_case("TEST"));
    let configured = if oauth_connected {
        !pos.trim().is_empty()
    } else {
        !token.trim().is_empty() && !pos.trim().is_empty()
    };
    Ok(MpConfigStatus {
        enabled,
        configured,
        simulation,
        oauth_connected,
        oauth_available: mp_oauth_available(),
        nickname: oauth_connected_nickname(&conn),
    })
}
