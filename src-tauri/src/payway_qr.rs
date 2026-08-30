use crate::database::open_exclusive;
use crate::settings_util::{read_setting_flag, read_setting_or};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

const PAYWAY_QR_MIN_AMOUNT: f64 = 10.0;
const SANDBOX_BASE: &str = "https://api-sandbox.prismamediosdepago.com/v1/decidir_qr_services";
const PROD_BASE: &str = "https://api.prismamediosdepago.com/v1/decidir_qr_services";

#[derive(Debug, Serialize, Deserialize)]
pub struct PaywayQrOrderResult {
    pub payment_id: String,
    pub intention_id: Option<String>,
    pub external_reference: String,
    pub qr_data: String,
    pub simulated: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaywayPaymentStatus {
    pub status: String,
    pub status_detail: Option<String>,
    pub payment_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PaywayConfigStatus {
    pub enabled: bool,
    pub configured: bool,
    pub simulation: bool,
    pub sandbox: bool,
}

#[derive(Debug, Serialize)]
pub struct PaywayConnectionTest {
    pub ok: bool,
    pub message: String,
}

struct PaywaySettings {
    api_key_public: String,
    api_key_secret: String,
    cuit_owner: String,
    merchant_cuit: String,
    branch_office: String,
    checkout: String,
    sandbox: bool,
}

fn payway_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())
}

fn payway_base_url(sandbox: bool) -> &'static str {
    if sandbox {
        SANDBOX_BASE
    } else {
        PROD_BASE
    }
}

fn digits_only(value: &str) -> String {
    value.chars().filter(|c| c.is_ascii_digit()).collect()
}

fn load_payway_settings(conn: &rusqlite::Connection) -> Result<PaywaySettings, String> {
    Ok(PaywaySettings {
        api_key_public: read_setting_or(conn, "payway_api_key_public", ""),
        api_key_secret: read_setting_or(conn, "payway_api_key_secret", ""),
        cuit_owner: digits_only(&read_setting_or(conn, "payway_cuit_owner", "")),
        merchant_cuit: digits_only(&read_setting_or(conn, "payway_merchant_cuit", "")),
        branch_office: read_setting_or(conn, "payway_branch_office", "").trim().to_string(),
        checkout: read_setting_or(conn, "payway_checkout", "").trim().to_string(),
        sandbox: read_setting_flag(conn, "payway_sandbox") || !read_setting_flag(conn, "payway_production"),
    })
}

fn payway_configured(settings: &PaywaySettings, simulation: bool) -> bool {
    if simulation {
        return true;
    }
    !settings.api_key_secret.trim().is_empty()
        && settings.merchant_cuit.len() >= 11
        && !settings.branch_office.is_empty()
        && !settings.checkout.is_empty()
}

fn payway_auth_header(settings: &PaywaySettings) -> String {
    let public = settings.api_key_public.trim();
    let secret = settings.api_key_secret.trim();
    if !public.is_empty() && !secret.is_empty() {
        let token = B64.encode(format!("{public}:{secret}"));
        return format!("Basic {token}");
    }
    secret.to_string()
}

fn payway_cuit_owner(settings: &PaywaySettings) -> String {
    if !settings.cuit_owner.is_empty() {
        settings.cuit_owner.clone()
    } else {
        settings.merchant_cuit.clone()
    }
}

fn format_payway_api_error(status: reqwest::StatusCode, body: &Value) -> String {
    let mut parts = Vec::new();
    if let Some(errors) = body.get("errors").and_then(|v| v.as_array()) {
        for err in errors {
            if let Some(title) = err.get("title").and_then(|v| v.as_str()) {
                if !title.is_empty() {
                    parts.push(title.to_string());
                }
            }
            if let Some(code) = err.get("code").and_then(|v| v.as_str()) {
                if !code.is_empty() {
                    parts.push(code.to_string());
                }
            }
        }
    }
    if parts.is_empty() {
        if let Some(msg) = body.get("message").and_then(|v| v.as_str()) {
            parts.push(msg.to_string());
        }
    }
    if parts.is_empty() {
        parts.push("Error desconocido".to_string());
    }
    format!("Payway ({status}): {}", parts.join(" — "))
}

fn extract_qr_data(body: &Value) -> Option<String> {
    const KEYS: &[&str] = &[
        "qr_data",
        "qr_string",
        "qr",
        "emv_qr",
        "payload",
        "qr_payload",
    ];
    for key in KEYS {
        if let Some(v) = body.get(*key).and_then(|v| v.as_str()) {
            if !v.trim().is_empty() {
                return Some(v.trim().to_string());
            }
        }
    }
    body.pointer("/qr/data")
        .or_else(|| body.pointer("/qr/qr_data"))
        .or_else(|| body.pointer("/payment/qr_data"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn extract_payment_id(body: &Value) -> Option<String> {
    body.get("payment_id")
        .or_else(|| body.pointer("/status_details/payment_id"))
        .and_then(|v| {
            if let Some(s) = v.as_str() {
                Some(s.to_string())
            } else if let Some(n) = v.as_i64() {
                Some(n.to_string())
            } else {
                None
            }
        })
}

fn extract_intention_id(body: &Value) -> Option<i64> {
    body.get("intention_id")
        .and_then(|v| v.as_i64())
        .or_else(|| {
            body.get("intention_id")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
        })
}

fn payment_is_approved(body: &Value) -> bool {
    let status = body
        .pointer("/status_details/status")
        .or_else(|| body.get("status"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_uppercase();
    matches!(status.as_str(), "APPROVED" | "ACREDITADO" | "00" | "5700")
}

fn payway_request(
    client: &Client,
    settings: &PaywaySettings,
    method: reqwest::Method,
    path: &str,
    query: Option<&[(&str, String)]>,
    body: Option<Value>,
) -> Result<(reqwest::StatusCode, Value), String> {
    let base = payway_base_url(settings.sandbox);
    let url = format!("{base}{path}");
    let mut req = client.request(method, &url);

    let secret = settings.api_key_secret.trim();
    if secret.is_empty() {
        return Err("Falta la API key secreta de Payway.".into());
    }

    req = req.header("apikey", secret);
    let cuit = payway_cuit_owner(settings);
    if !cuit.is_empty() {
        req = req.header("Cuit-Owner", cuit);
    }
    let auth = payway_auth_header(settings);
    if auth.starts_with("Basic ") {
        req = req.header("Authorization", auth);
    }
    req = req.header("Content-Type", "application/json");

    if let Some(q) = query {
        req = req.query(q);
    }
    if let Some(json_body) = body {
        req = req.json(&json_body);
    }

    let response = req
        .send()
        .map_err(|e| format!("Sin conexión con Payway: {e}"))?;
    let status = response.status();
    let text = response
        .text()
        .map_err(|e| format!("Respuesta inválida de Payway: {e}"))?;
    let parsed: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({ "raw": text }));
    Ok((status, parsed))
}

fn fetch_intention_id(
    client: &Client,
    settings: &PaywaySettings,
    amount: f64,
    external_reference: &str,
) -> Result<i64, String> {
    let query = [
        ("cuit", settings.merchant_cuit.clone()),
        ("branch_office", settings.branch_office.clone()),
        ("checkout", settings.checkout.clone()),
        ("amount", format!("{amount:.2}")),
        ("external_reference", external_reference.to_string()),
    ];
    let (status, body) = payway_request(
        client,
        settings,
        reqwest::Method::GET,
        "/direct_connection_system/intentions",
        Some(&query),
        None,
    )?;

    if status.is_success() {
        if let Some(id) = extract_intention_id(&body) {
            return Ok(id);
        }
        if let Some(items) = body.as_array() {
            if let Some(first) = items.first() {
                if let Some(id) = extract_intention_id(first) {
                    return Ok(id);
                }
            }
        }
        if let Some(items) = body.get("intentions").and_then(|v| v.as_array()) {
            if let Some(first) = items.first() {
                if let Some(id) = extract_intention_id(first) {
                    return Ok(id);
                }
            }
        }
    }

    Err(format_payway_api_error(status, &body))
}

fn create_payway_payment(
    client: &Client,
    settings: &PaywaySettings,
    intention_id: i64,
    amount: f64,
    external_reference: &str,
) -> Result<Value, String> {
    let payload = json!({
        "intention_id": intention_id,
        "cuit": settings.merchant_cuit,
        "branch_office": settings.branch_office,
        "checkout": settings.checkout,
        "payment_method_information": {
            "scheme": "PCT",
            "type": "TRANSFERENCIA"
        },
        "amount": amount,
        "currency": "ARS",
        "installments": 1,
        "external_reference": external_reference
    });

    let (status, body) = payway_request(
        client,
        settings,
        reqwest::Method::POST,
        "/direct_connection_system/payments",
        None,
        Some(payload),
    )?;

    if status.is_success() || status.as_u16() == 201 {
        return Ok(body);
    }
    Err(format_payway_api_error(status, &body))
}

fn query_payway_payment(
    client: &Client,
    settings: &PaywaySettings,
    payment_id: &str,
) -> Result<Value, String> {
    let query = [("payment_id", payment_id.to_string())];
    let (status, body) = payway_request(
        client,
        settings,
        reqwest::Method::GET,
        "/direct_connection_system/payments",
        Some(&query),
        None,
    )?;
    if status.is_success() {
        return Ok(body);
    }
    Err(format_payway_api_error(status, &body))
}

#[tauri::command]
pub fn get_payway_config_status() -> Result<PaywayConfigStatus, String> {
    let conn = open_exclusive()?;
    let enabled = read_setting_flag(&conn, "payway_enabled");
    let simulation = read_setting_flag(&conn, "payway_simulation");
    let settings = load_payway_settings(&conn)?;
    let sandbox = settings.sandbox;
    let configured = payway_configured(&settings, simulation);
    Ok(PaywayConfigStatus {
        enabled,
        configured,
        simulation,
        sandbox,
    })
}

#[tauri::command]
pub fn test_payway_connection() -> Result<PaywayConnectionTest, String> {
    let conn = open_exclusive()?;
    if read_setting_flag(&conn, "payway_simulation") {
        return Ok(PaywayConnectionTest {
            ok: true,
            message: "Modo demostración activo: no se consulta la API real.".into(),
        });
    }
    let settings = load_payway_settings(&conn)?;
    if settings.api_key_secret.trim().is_empty() {
        return Err("Cargá la API key secreta de Prisma/Payway.".into());
    }
    let client = payway_client()?;
    let (status, body) = payway_request(
        &client,
        &settings,
        reqwest::Method::GET,
        "/health/liveness",
        None,
        None,
    )?;
    if status.is_success() {
        return Ok(PaywayConnectionTest {
            ok: true,
            message: format!(
                "Conexión OK ({})",
                if settings.sandbox {
                    "sandbox"
                } else {
                    "producción"
                }
            ),
        });
    }
    Ok(PaywayConnectionTest {
        ok: false,
        message: format_payway_api_error(status, &body),
    })
}

#[tauri::command]
pub fn create_payway_qr_order(
    amount: f64,
    description: String,
    external_reference: String,
) -> Result<PaywayQrOrderResult, String> {
    if amount <= 0.0 {
        return Err("El monto debe ser mayor a cero.".into());
    }
    if amount < PAYWAY_QR_MIN_AMOUNT {
        return Err(format!(
            "El monto es muy pequeño para Payway QR. Mínimo: ${:.2}.",
            PAYWAY_QR_MIN_AMOUNT
        ));
    }

    let conn = open_exclusive()?;
    if !read_setting_flag(&conn, "payway_enabled") {
        return Err("Payway QR no está activado en Administración.".into());
    }

    let simulation = read_setting_flag(&conn, "payway_simulation");
    let _desc = description;

    if simulation {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        return Ok(PaywayQrOrderResult {
            payment_id: format!("PW-SIM-{}-{}", ts, &Uuid::new_v4().to_string()[..8]),
            intention_id: Some(format!("SIM-INT-{ts}")),
            external_reference: external_reference.clone(),
            qr_data: format!(
                "PW-SIM|ref={}|amount={:.2}",
                external_reference, amount
            ),
            simulated: true,
        });
    }

    let settings = load_payway_settings(&conn)?;
    if !payway_configured(&settings, false) {
        return Err(
            "Completá API keys, CUIT, sucursal y caja en Administración → Payway QR.".into(),
        );
    }

    let client = payway_client()?;
    let intention_id = fetch_intention_id(&client, &settings, amount, &external_reference)
        .or_else(|primary| {
            let manual = read_setting_or(&conn, "payway_intention_id", "");
            manual
                .trim()
                .parse::<i64>()
                .map_err(|_| primary)
        })?;

    let body = create_payway_payment(
        &client,
        &settings,
        intention_id,
        amount,
        &external_reference,
    )?;

    let payment_id = extract_payment_id(&body)
        .ok_or("Payway no devolvió payment_id. Verificá credenciales y datos del comercio.")?;
    let qr_data = extract_qr_data(&body).unwrap_or_else(|| {
        format!(
            "PAYWAY|payment_id={}|intention_id={}|amount={:.2}",
            payment_id, intention_id, amount
        )
    });

    Ok(PaywayQrOrderResult {
        payment_id,
        intention_id: Some(intention_id.to_string()),
        external_reference,
        qr_data,
        simulated: false,
    })
}

#[tauri::command]
pub fn check_payway_payment_status(
    payment_id: String,
    simulated: bool,
) -> Result<PaywayPaymentStatus, String> {
    if simulated || payment_id.starts_with("PW-SIM-") {
        if let Some(rest) = payment_id.strip_prefix("PW-SIM-") {
            let ts_str = rest.split('-').next().unwrap_or("");
            if let Ok(ts) = ts_str.parse::<u64>() {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                if now.saturating_sub(ts) >= 3000 {
                    return Ok(PaywayPaymentStatus {
                        status: "approved".into(),
                        status_detail: Some("simulated".into()),
                        payment_id: Some(payment_id),
                    });
                }
            }
        }
        return Ok(PaywayPaymentStatus {
            status: "pending".into(),
            status_detail: Some("simulated".into()),
            payment_id: None,
        });
    }

    let conn = open_exclusive()?;
    let settings = load_payway_settings(&conn)?;
    let client = payway_client()?;
    let body = query_payway_payment(&client, &settings, &payment_id)?;
    let approved = payment_is_approved(&body);
    let detail = body
        .pointer("/status_details/description")
        .or_else(|| body.pointer("/status_details/status_code"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(PaywayPaymentStatus {
        status: if approved {
            "approved".into()
        } else {
            "pending".into()
        },
        status_detail: detail,
        payment_id: if approved {
            Some(payment_id)
        } else {
            None
        },
    })
}
