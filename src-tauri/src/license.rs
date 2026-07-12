use crate::database::open_exclusive;
use crate::settings_util::{read_setting, write_setting};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

/// Clave pública Ed25519 (hex). Regenerar con `node scripts/gen-license-keys.mjs` en producción.
const LICENSE_PUBLIC_KEY_HEX: &str =
    "683fd5deba30783f9a584514125190d4c60f79f15dbecb4636c4cd5f02297d88";

const TOKEN_PREFIX: &str = "GC1";
const OFFLINE_GRACE_DAYS: i64 = 14;
const TRIAL_DAYS: i64 = 7;
const TRIAL_OFFER_WINDOW_SECS: i64 = 86_400;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicensePayload {
    pub v: u8,
    pub lid: String,
    pub plan: String,
    pub max_devices: u32,
    pub machine_id: String,
    pub pro: bool,
    pub iat: i64,
    pub key_mask: String,
    #[serde(default)]
    pub exp: i64,
    #[serde(default = "default_billing")]
    pub billing: String,
}

fn default_billing() -> String {
    "perpetual".to_string()
}

#[derive(Debug, Clone, Serialize)]
pub struct LicenseStatus {
    pub active: bool,
    pub plan: String,
    pub pro_enabled: bool,
    pub max_devices: u32,
    pub machine_id: String,
    pub key_mask: Option<String>,
    pub message: Option<String>,
    pub needs_activation: bool,
    pub offline_grace_days_left: Option<i32>,
    pub billing: String,
    pub expires_at: Option<i64>,
    pub days_until_expiry: Option<i32>,
    pub is_trial: bool,
    pub trial_days_left: Option<i32>,
    pub trial_offer_pending: bool,
}

#[derive(Debug, Deserialize)]
struct ActivateResponse {
    ok: bool,
    token: Option<String>,
    plan: Option<String>,
    pro: Option<bool>,
    max_devices: Option<u32>,
    error: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ValidateResponse {
    ok: bool,
    valid: Option<bool>,
    token: Option<String>,
    error: Option<String>,
    message: Option<String>,
}

fn license_api_url() -> String {
    option_env!("LICENSE_API_URL")
        .unwrap_or("https://gestion-comercios-license.walphur.workers.dev")
        .to_string()
}

fn verifying_key() -> Result<VerifyingKey, String> {
    let bytes = hex::decode(LICENSE_PUBLIC_KEY_HEX).map_err(|e| e.to_string())?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "clave pública de licencia inválida".to_string())?;
    VerifyingKey::from_bytes(&arr).map_err(|e| e.to_string())
}

pub fn get_machine_id() -> String {
    let raw = machine_guid_raw().unwrap_or_else(fallback_machine_raw);
    let digest = Sha256::digest(raw.as_bytes());
    format!("{:x}", digest)
}

fn machine_guid_raw() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let out = std::process::Command::new("reg")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "query",
                r"HKLM\SOFTWARE\Microsoft\Cryptography",
                "/v",
                "MachineGuid",
            ])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 && parts[1].eq_ignore_ascii_case("REG_SZ") {
                return Some(parts[2].to_string());
            }
            if parts.len() >= 2 && parts[0].eq_ignore_ascii_case("MachineGuid") {
                return parts.last().map(|s| s.to_string());
            }
        }
    }
    None
}

fn fallback_machine_raw() -> String {
    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown-host".to_string());
    let user = std::env::var("USERNAME").unwrap_or_else(|_| "unknown-user".to_string());
    format!("{host}:{user}")
}

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn parse_token(token: &str) -> Result<(LicensePayload, Vec<u8>), String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 || parts[0] != TOKEN_PREFIX {
        return Err("Formato de licencia inválido".to_string());
    }
    let payload_bytes =
        base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, parts[1])
            .map_err(|e| format!("Licencia corrupta: {e}"))?;
    let sig_bytes =
        base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, parts[2])
            .map_err(|e| format!("Firma inválida: {e}"))?;
    let payload: LicensePayload = serde_json::from_slice(&payload_bytes)
        .map_err(|e| format!("Datos de licencia inválidos: {e}"))?;
    Ok((payload, sig_bytes))
}

fn verify_token_signature(token: &str) -> Result<LicensePayload, String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("Licencia incompleta".to_string());
    }
    let signed = format!("{}.{}", parts[0], parts[1]);
    let (_, sig_bytes) = parse_token(token)?;
    let sig_arr: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| "Firma de licencia inválida".to_string())?;
    let signature = Signature::from_bytes(&sig_arr);
    verifying_key()?
        .verify(signed.as_bytes(), &signature)
        .map_err(|_| "La licencia no es auténtica".to_string())?;
    let (payload, _) = parse_token(token)?;
    Ok(payload)
}

fn read_stored_token(conn: &Connection) -> Option<String> {
    read_setting(conn, "license_token")
}

fn clear_license_settings(conn: &Connection) -> Result<(), String> {
    write_setting(conn, "license_token", "")?;
    write_setting(conn, "license_key_mask", "")?;
    write_setting(conn, "license_plan", "")?;
    write_setting(conn, "license_max_devices", "0")?;
    write_setting(conn, "pro_plan_enabled", "0")?;
    write_setting(
        conn,
        "pro_modules",
        r#"{"quotes":false,"appointments":false,"delivery_notes":false,"service_orders":false}"#,
    )?;
    Ok(())
}

fn write_license_settings(
    conn: &Connection,
    token: &str,
    payload: &LicensePayload,
) -> Result<(), String> {
    write_setting(conn, "license_token", token)?;
    write_setting(conn, "license_key_mask", &payload.key_mask)?;
    write_setting(conn, "license_plan", &payload.plan)?;
    write_setting(
        conn,
        "license_max_devices",
        &payload.max_devices.to_string(),
    )?;
    write_setting(conn, "license_last_online_at", &now_epoch().to_string())?;
    write_setting(
        conn,
        "pro_plan_enabled",
        if payload.pro { "1" } else { "0" },
    )?;
    if payload.pro {
        write_setting(
            conn,
            "pro_modules",
            r#"{"quotes":true,"appointments":true,"delivery_notes":true,"service_orders":true}"#,
        )?;
    }
    Ok(())
}

fn read_trial_started_at(conn: &Connection) -> Option<i64> {
    read_setting(conn, "trial_started_at")?
        .parse::<i64>()
        .ok()
        .filter(|ts| *ts > 0)
}

fn trial_expires_at(started: i64) -> i64 {
    started + TRIAL_DAYS * 86_400
}

fn trial_days_left(started: i64) -> i32 {
    let left = (trial_expires_at(started) - now_epoch()) / 86_400;
    left.max(0) as i32
}

fn trial_expired(started: i64) -> bool {
    now_epoch() >= trial_expires_at(started)
}

fn enable_trial_pro_modules(conn: &Connection) -> Result<(), String> {
    write_setting(conn, "pro_plan_enabled", "1")?;
    write_setting(
        conn,
        "pro_modules",
        r#"{"quotes":true,"appointments":true,"delivery_notes":true,"service_orders":true}"#,
    )?;
    Ok(())
}

fn read_first_open_at(conn: &Connection) -> Option<i64> {
    read_setting(conn, "first_open_at")?
        .parse::<i64>()
        .ok()
        .filter(|ts| *ts > 0)
}

fn trial_offer_was_shown(conn: &Connection) -> bool {
    read_setting(conn, "trial_offer_shown").as_deref() == Some("1")
}

fn mark_trial_offer_shown(conn: &Connection) -> Result<(), String> {
    write_setting(conn, "trial_offer_shown", "1")
}

fn ensure_first_open_at(conn: &Connection) -> Result<i64, String> {
    if let Some(ts) = read_first_open_at(conn) {
        return Ok(ts);
    }
    let now = now_epoch();
    write_setting(conn, "first_open_at", &now.to_string())?;
    Ok(now)
}

fn should_show_trial_offer(conn: &Connection) -> bool {
    if trial_offer_was_shown(conn) {
        return false;
    }
    let first = match read_first_open_at(conn) {
        Some(ts) => ts,
        None => return true,
    };
    now_epoch() - first < TRIAL_OFFER_WINDOW_SECS
}

fn start_trial(conn: &Connection) -> Result<i64, String> {
    if let Some(ts) = read_trial_started_at(conn) {
        return Ok(ts);
    }
    let now = now_epoch();
    write_setting(conn, "trial_started_at", &now.to_string())?;
    mark_trial_offer_shown(conn)?;
    enable_trial_pro_modules(conn)?;
    Ok(now)
}

fn trial_offer_pending_status() -> LicenseStatus {
    LicenseStatus {
        active: false,
        plan: "none".to_string(),
        pro_enabled: false,
        max_devices: 0,
        machine_id: get_machine_id(),
        key_mask: None,
        message: Some(
            "Probá Gestión Comercios 7 días gratis con todas las funciones Pro.".to_string(),
        ),
        needs_activation: true,
        offline_grace_days_left: None,
        billing: "none".to_string(),
        expires_at: None,
        days_until_expiry: None,
        is_trial: false,
        trial_days_left: None,
        trial_offer_pending: true,
    }
}

fn status_from_trial(started: i64) -> LicenseStatus {
    let days_left = trial_days_left(started);
    LicenseStatus {
        active: true,
        plan: "trial".to_string(),
        pro_enabled: true,
        max_devices: 1,
        machine_id: get_machine_id(),
        key_mask: None,
        message: Some(format!(
            "Prueba gratuita · {days_left} día(s) restante(s)"
        )),
        needs_activation: false,
        offline_grace_days_left: None,
        billing: "trial".to_string(),
        expires_at: Some(trial_expires_at(started)),
        days_until_expiry: Some(days_left),
        is_trial: true,
        trial_days_left: Some(days_left),
        trial_offer_pending: false,
    }
}

fn evaluate_trial(conn: &Connection) -> LicenseStatus {
    if let Some(started) = read_trial_started_at(conn) {
        if trial_expired(started) {
            write_setting(conn, "pro_plan_enabled", "0").ok();
            write_setting(
                conn,
                "pro_modules",
                r#"{"quotes":false,"appointments":false,"delivery_notes":false,"service_orders":false}"#,
            )
            .ok();
            return inactive_status(
                "Tu prueba de 7 días terminó. Activá tu licencia con la clave de compra o contactá a Waltech.",
            );
        }
        let _ = enable_trial_pro_modules(conn);
        return status_from_trial(started);
    }

    let _ = ensure_first_open_at(conn);

    if should_show_trial_offer(conn) {
        return trial_offer_pending_status();
    }

    if !trial_offer_was_shown(conn) {
        mark_trial_offer_shown(conn).ok();
    }

    inactive_status("Activá tu licencia para usar el programa")
}

fn offline_grace_days_left(conn: &Connection) -> Option<i32> {
    let last = read_setting(conn, "license_last_online_at")?
        .parse::<i64>()
        .ok()?;
    let elapsed_days = (now_epoch() - last) / 86_400;
    let left = OFFLINE_GRACE_DAYS - elapsed_days;
    Some(left.max(0) as i32)
}

fn subscription_expired(payload: &LicensePayload) -> bool {
    payload.exp > 0 && now_epoch() > payload.exp
}

fn days_until_expiry(payload: &LicensePayload) -> Option<i32> {
    if payload.exp <= 0 {
        return None;
    }
    let left = (payload.exp - now_epoch()) / 86_400;
    Some(left.max(0) as i32)
}

fn validate_local(conn: &Connection) -> Result<LicensePayload, String> {
    let token = read_stored_token(conn).ok_or("Sin licencia activada")?;
    let payload = verify_token_signature(&token)?;
    if subscription_expired(&payload) {
        return Err(
            "Tu suscripción venció. Contactá a Waltech por WhatsApp para renovar.".to_string(),
        );
    }
    let machine_id = get_machine_id();
    if payload.machine_id != machine_id {
        return Err(
            "Esta licencia está activada en otra PC. Contactá a Waltech para transferirla."
                .to_string(),
        );
    }
    Ok(payload)
}

fn status_from_payload(
    conn: &Connection,
    payload: &LicensePayload,
    needs_activation: bool,
    message: Option<String>,
) -> LicenseStatus {
    LicenseStatus {
        active: true,
        plan: payload.plan.clone(),
        pro_enabled: payload.pro,
        max_devices: payload.max_devices,
        machine_id: get_machine_id(),
        key_mask: Some(payload.key_mask.clone()),
        message,
        needs_activation,
        offline_grace_days_left: if payload.exp > 0 {
            None
        } else {
            offline_grace_days_left(conn)
        },
        billing: if payload.billing.is_empty() {
            "perpetual".to_string()
        } else {
            payload.billing.clone()
        },
        expires_at: if payload.exp > 0 {
            Some(payload.exp)
        } else {
            None
        },
        days_until_expiry: days_until_expiry(payload),
        is_trial: false,
        trial_days_left: None,
        trial_offer_pending: false,
    }
}

fn inactive_status(message: impl Into<String>) -> LicenseStatus {
    LicenseStatus {
        active: false,
        plan: "none".to_string(),
        pro_enabled: false,
        max_devices: 0,
        machine_id: get_machine_id(),
        key_mask: None,
        message: Some(message.into()),
        needs_activation: true,
        offline_grace_days_left: None,
        billing: "none".to_string(),
        expires_at: None,
        days_until_expiry: None,
        is_trial: false,
        trial_days_left: None,
        trial_offer_pending: false,
    }
}

fn dev_license_bypass() -> Option<LicenseStatus> {
    let e2e = std::env::var("GESTION_E2E").ok().as_deref() == Some("1");
    let dev =
        cfg!(debug_assertions) && std::env::var("GESTION_LICENSE_DEV").ok().as_deref() == Some("1");
    if e2e || dev {
        return Some(LicenseStatus {
            active: true,
            plan: "pro".to_string(),
            pro_enabled: true,
            max_devices: 99,
            machine_id: get_machine_id(),
            key_mask: Some(if e2e { "E2E" } else { "DEV" }.to_string()),
            message: Some(if e2e {
                "Modo pruebas E2E".to_string()
            } else {
                "Modo desarrollo sin licencia".to_string()
            }),
            needs_activation: false,
            offline_grace_days_left: None,
            billing: "perpetual".to_string(),
            expires_at: None,
            days_until_expiry: None,
            is_trial: false,
            trial_days_left: None,
            trial_offer_pending: false,
        });
    }
    None
}

pub fn get_license_status() -> LicenseStatus {
    if let Some(status) = dev_license_bypass() {
        return status;
    }

    let conn = match open_exclusive() {
        Ok(c) => c,
        Err(e) => return inactive_status(format!("Base de datos: {e}")),
    };

    let has_token = read_stored_token(&conn)
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false);
    if !has_token {
        return evaluate_trial(&conn);
    }

    match validate_local(&conn) {
        Ok(payload) => status_from_payload(&conn, &payload, false, None),
        Err(msg) => inactive_status(msg),
    }
}

fn post_json<T: for<'de> Deserialize<'de>>(
    path: &str,
    body: &serde_json::Value,
) -> Result<T, String> {
    let url = format!("{}{}", license_api_url(), path);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post(&url)
        .json(body)
        .send()
        .map_err(|e| format!("Sin conexión al servidor de licencias: {e}"))?;
    let status = res.status();
    let text = res.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        if let Ok(err) = serde_json::from_str::<ActivateResponse>(&text) {
            return Err(err
                .message
                .or(err.error)
                .unwrap_or_else(|| "Error de activación".to_string()));
        }
        return Err(format!("Servidor de licencias respondió {status}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("Respuesta inválida del servidor: {e}"))
}

pub fn activate_license(key: String) -> LicenseStatus {
    if let Some(status) = dev_license_bypass() {
        return status;
    }

    let key = key.trim().to_uppercase();
    if key.len() < 8 {
        return inactive_status("Clave de licencia inválida");
    }

    let body = serde_json::json!({
        "key": key,
        "machine_id": get_machine_id(),
        "app": "gestion-comercios",
    });

    let resp: ActivateResponse = match post_json("/v1/activate", &body) {
        Ok(r) => r,
        Err(e) => return inactive_status(e),
    };

    if !resp.ok {
        return inactive_status(
            resp.message
                .or(resp.error)
                .unwrap_or_else(|| "No se pudo activar la licencia".to_string()),
        );
    }

    let token = match resp.token {
        Some(t) => t,
        None => return inactive_status("El servidor no devolvió la licencia"),
    };

    let payload = match verify_token_signature(&token) {
        Ok(p) => p,
        Err(e) => return inactive_status(e),
    };

    let conn = match open_exclusive() {
        Ok(c) => c,
        Err(e) => return inactive_status(format!("Base de datos: {e}")),
    };

    if let Err(e) = write_license_settings(&conn, &token, &payload) {
        return inactive_status(e);
    }

    status_from_payload(
        &conn,
        &payload,
        false,
        Some("Licencia activada correctamente".to_string()),
    )
}

pub fn refresh_license_online() -> LicenseStatus {
    if let Some(status) = dev_license_bypass() {
        return status;
    }

    let conn = match open_exclusive() {
        Ok(c) => c,
        Err(e) => return inactive_status(format!("Base de datos: {e}")),
    };

    let token = match read_stored_token(&conn) {
        Some(t) if !t.trim().is_empty() => t,
        _ => return evaluate_trial(&conn),
    };

    let body = serde_json::json!({
        "token": token,
        "machine_id": get_machine_id(),
    });

    let resp: ValidateResponse = match post_json("/v1/validate", &body) {
        Ok(r) => r,
        Err(e) => {
            if let Ok(payload) = validate_local(&conn) {
                if subscription_expired(&payload) {
                    let _ = clear_license_settings(&conn);
                    return inactive_status(
                        "Tu suscripción venció. Contactá a Waltech por WhatsApp para renovar.",
                    );
                }
                if let Some(left) = offline_grace_days_left(&conn) {
                    if left > 0 {
                        return status_from_payload(
                            &conn,
                            &payload,
                            false,
                            Some(format!("Modo offline ({left} días restantes)")),
                        );
                    }
                }
            }
            return inactive_status(e);
        }
    };

    if !resp.ok || resp.valid != Some(true) {
        let msg = resp
            .message
            .or(resp.error)
            .unwrap_or_else(|| "Licencia no válida".to_string());
        let _ = clear_license_settings(&conn);
        return inactive_status(msg);
    }

    if let Some(new_token) = resp.token {
        if let Ok(payload) = verify_token_signature(&new_token) {
            let _ = write_license_settings(&conn, &new_token, &payload);
            return status_from_payload(&conn, &payload, false, None);
        }
    }

    if let Ok(payload) = validate_local(&conn) {
        write_setting(&conn, "license_last_online_at", &now_epoch().to_string()).ok();
        return status_from_payload(&conn, &payload, false, None);
    }

    inactive_status("Licencia no válida")
}

pub fn start_trial_license() -> LicenseStatus {
    if let Some(status) = dev_license_bypass() {
        return status;
    }

    let conn = match open_exclusive() {
        Ok(c) => c,
        Err(e) => return inactive_status(format!("Base de datos: {e}")),
    };

    let has_token = read_stored_token(&conn)
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false);
    if has_token {
        return get_license_status();
    }

    match start_trial(&conn) {
        Ok(started) => status_from_trial(started),
        Err(e) => inactive_status(e),
    }
}

pub fn skip_trial_offer() -> LicenseStatus {
    if let Some(status) = dev_license_bypass() {
        return status;
    }

    let conn = match open_exclusive() {
        Ok(c) => c,
        Err(e) => return inactive_status(format!("Base de datos: {e}")),
    };

    let has_token = read_stored_token(&conn)
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false);
    if has_token {
        return get_license_status();
    }

    mark_trial_offer_shown(&conn).ok();
    inactive_status("Activá tu licencia para usar el programa")
}
