use crate::database::open_exclusive;
use crate::mp_app_credentials::load_mp_app_config;
use crate::settings_util::{
    read_setting, read_setting_flag, read_setting_or, write_setting, write_setting_flag,
};
use base64::Engine;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{mpsc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

const MP_AUTH_URL: &str = "https://auth.mercadopago.com/authorization";
const MP_TOKEN_URL: &str = "https://api.mercadopago.com/oauth/token";
const MP_USERS_ME_URL: &str = "https://api.mercadopago.com/users/me";
const OAUTH_WAIT_SECS: u64 = 300;
/// Puerto local para recibir el `code` desde la página HTTPS (evita depender del deep link en Windows).
const OAUTH_LOCAL_PORT: u16 = 38473;
const OAUTH_LOCAL_CALLBACK_PATH: &str = "/oauth/callback";

#[derive(Debug, Serialize)]
pub struct MpConnectResult {
    pub user_id: String,
    pub nickname: String,
    pub external_store_id: String,
    pub external_pos_id: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    user_id: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct UserMeResponse {
    id: u64,
    nickname: Option<String>,
    email: Option<String>,
    #[serde(default)]
    address: Option<serde_json::Value>,
}

struct PendingOAuth {
    state: String,
    tx: mpsc::Sender<Result<String, String>>,
}

static PENDING_OAUTH: OnceLock<Mutex<Option<PendingOAuth>>> = OnceLock::new();

fn pending_oauth() -> &'static Mutex<Option<PendingOAuth>> {
    PENDING_OAUTH.get_or_init(|| Mutex::new(None))
}

fn mp_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

fn pkce_pair() -> (String, String) {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("random");
    let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    let hash = Sha256::digest(verifier.as_bytes());
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash);
    (verifier, challenge)
}

fn url_encode(value: &str) -> String {
    urlencoding::encode(value).into_owned()
}

fn parse_query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let k = parts.next()?;
        if k == key {
            let v = parts.next().unwrap_or("");
            return urlencoding::decode(v).ok().map(|s| s.into_owned());
        }
    }
    None
}

fn parse_oauth_deep_link(raw: &str) -> Option<(String, String)> {
    let raw = raw.trim();
    if !raw.starts_with("gestioncomercios://") {
        return None;
    }
    let rest = raw.strip_prefix("gestioncomercios://")?;
    let (_, query) = rest.split_once('?').unwrap_or((rest, ""));
    if let Some(err) = parse_query_param(query, "error") {
        let desc = parse_query_param(query, "error_description").unwrap_or_default();
        return Some((
            String::new(),
            format!("Mercado Pago rechazó la autorización: {err} {desc}")
                .trim()
                .to_string(),
        ));
    }
    let code = parse_query_param(query, "code")?;
    let state = parse_query_param(query, "state")?;
    Some((code, state))
}

fn deliver_oauth_code(code: &str, state: &str) -> bool {
    if code.trim().is_empty() {
        return false;
    }
    let Ok(mut guard) = pending_oauth().lock() else {
        return false;
    };
    let Some(pending) = guard.take() else {
        return false;
    };
    if state != pending.state {
        let _ = pending.tx.send(Err(
            "Estado OAuth inválido. Intentá conectar de nuevo.".into()
        ));
        return true;
    }
    let _ = pending.tx.send(Ok(code.to_string()));
    true
}

fn deliver_oauth_error(message: String) -> bool {
    let Ok(mut guard) = pending_oauth().lock() else {
        return false;
    };
    let Some(pending) = guard.take() else {
        return false;
    };
    let _ = pending.tx.send(Err(message));
    true
}

/// Llamado al abrir `gestioncomercios://oauth/callback?...` (Windows/Linux/macOS).
pub fn try_handle_oauth_deep_link(raw: &str) -> bool {
    let Some((code, state_or_err)) = parse_oauth_deep_link(raw) else {
        return false;
    };
    if code.is_empty() {
        return deliver_oauth_error(state_or_err);
    }
    deliver_oauth_code(&code, &state_or_err)
}

fn oauth_pending_active() -> bool {
    pending_oauth()
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|_| ()))
        .is_some()
}

fn write_oauth_http_response(stream: &mut TcpStream, body: &str) {
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn handle_oauth_http_request(stream: &mut TcpStream) -> bool {
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).unwrap_or(0);
    if n == 0 {
        return false;
    }
    let req = String::from_utf8_lossy(&buf[..n]);
    let request_line = req.lines().next().unwrap_or("");
    let path_query = request_line.split_whitespace().nth(1).unwrap_or("");
    if !path_query.starts_with(OAUTH_LOCAL_CALLBACK_PATH) {
        write_oauth_http_response(
            stream,
            "<!DOCTYPE html><html><body><p>Ruta inválida.</p></body></html>",
        );
        return false;
    }
    let query = path_query.split_once('?').map(|(_, q)| q).unwrap_or("");
    if let Some(err) = parse_query_param(query, "error") {
        let desc = parse_query_param(query, "error_description").unwrap_or_default();
        let msg = format!("Mercado Pago rechazó la autorización: {err} {desc}")
            .trim()
            .to_string();
        let delivered = deliver_oauth_error(msg);
        write_oauth_http_response(
            stream,
            "<!DOCTYPE html><html lang=\"es\"><body style=\"font-family:system-ui;text-align:center;padding:2rem\"><h1>No se pudo vincular</h1><p>Volvé a Walqo e intentá de nuevo.</p></body></html>",
        );
        return delivered;
    }
    let code = parse_query_param(query, "code").unwrap_or_default();
    let state = parse_query_param(query, "state").unwrap_or_default();
    let delivered = deliver_oauth_code(&code, &state);
    let body = if delivered {
        "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"utf-8\"><title>Listo</title></head><body style=\"font-family:system-ui;text-align:center;padding:2rem;background:#0c1816;color:#f0faf8\"><h1>¡Listo!</h1><p>Autorización recibida. Volvé a Walqo y esperá unos segundos; podés cerrar esta pestaña.</p></body></html>"
    } else {
        "<!DOCTYPE html><html lang=\"es\"><body style=\"font-family:system-ui;text-align:center;padding:2rem\"><h1>Sin conexión con la app</h1><p>Dejá Walqo abierta y hacé clic en «Conectar con Mercado Pago» otra vez.</p></body></html>"
    };
    write_oauth_http_response(stream, body);
    delivered
}

fn spawn_oauth_local_callback_server() {
    thread::spawn(|| {
        let listener = match TcpListener::bind(format!("127.0.0.1:{OAUTH_LOCAL_PORT}")) {
            Ok(l) => l,
            Err(_) => return,
        };
        let _ = listener.set_nonblocking(true);
        let deadline = Instant::now() + Duration::from_secs(OAUTH_WAIT_SECS);
        while Instant::now() < deadline && oauth_pending_active() {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
                    if handle_oauth_http_request(&mut stream) {
                        break;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(80));
                }
                Err(_) => break,
            }
        }
    });
}

fn push_mp_error_part(parts: &mut Vec<String>, value: &str) {
    let value = value.trim();
    if value.is_empty() {
        return;
    }
    if !parts.iter().any(|p| p.eq_ignore_ascii_case(value)) {
        parts.push(value.to_string());
    }
}

fn format_mp_oauth_error(body: &serde_json::Value) -> String {
    let mut parts = Vec::new();
    if let Some(msg) = body.get("message").and_then(|v| v.as_str()) {
        push_mp_error_part(&mut parts, msg);
    }
    if let Some(err) = body.get("error").and_then(|v| v.as_str()) {
        push_mp_error_part(&mut parts, err);
    }
    if let Some(causes) = body.get("cause").and_then(|v| v.as_array()) {
        for cause in causes {
            if let Some(code) = cause.get("code").and_then(|v| v.as_str()) {
                push_mp_error_part(&mut parts, code);
            }
            if let Some(desc) = cause.get("description").and_then(|v| v.as_str()) {
                push_mp_error_part(&mut parts, desc);
            }
        }
    }
    if let Some(errors) = body.get("errors").and_then(|v| v.as_array()) {
        for err in errors {
            if let Some(msg) = err.as_str() {
                push_mp_error_part(&mut parts, msg);
            } else if let Some(code) = err.get("code").and_then(|v| v.as_str()) {
                push_mp_error_part(&mut parts, code);
            }
        }
    }
    if parts.is_empty() {
        if let Ok(raw) = serde_json::to_string(body) {
            if raw.len() > 20 {
                return format!("Error de Mercado Pago: {raw}");
            }
        }
        "Error de Mercado Pago (sin detalle).".to_string()
    } else {
        parts.join(" — ")
    }
}

fn mp_api_error(step: &str, body: &serde_json::Value) -> String {
    format!("{step}: {}", format_mp_oauth_error(body))
}

pub fn scan_startup_args_for_oauth_deep_link() {
    for arg in std::env::args().skip(1) {
        if arg.contains("gestioncomercios://") {
            try_handle_oauth_deep_link(&arg);
        }
    }
}

fn exchange_authorization_code(
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, String> {
    let config = load_mp_app_config()
        .ok_or("OAuth de Mercado Pago no configurado en esta versión de la app.")?;

    let client = mp_http_client()?;
    let response = client
        .post(MP_TOKEN_URL)
        .json(&json!({
            "client_id": config.client_id,
            "client_secret": config.client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
        }))
        .send()
        .map_err(|e| format!("Sin conexión con Mercado Pago: {e}"))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .map_err(|e| format!("Respuesta inválida al obtener token: {e}"))?;

    if !status.is_success() {
        return Err(format_mp_oauth_error(&body));
    }

    serde_json::from_value(body).map_err(|e| format!("Token OAuth inválido: {e}"))
}

pub fn refresh_mp_access_token(conn: &rusqlite::Connection) -> Result<String, String> {
    let refresh = read_setting_or(conn, "mp_refresh_token", "");
    if refresh.trim().is_empty() {
        let token = read_setting_or(conn, "mp_access_token", "");
        if token.trim().is_empty() {
            return Err("Mercado Pago no está conectado.".into());
        }
        return Ok(token);
    }

    let expires_at: i64 = read_setting_or(conn, "mp_token_expires_at", "0")
        .parse()
        .unwrap_or(0);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let current = read_setting_or(conn, "mp_access_token", "");
    if !current.trim().is_empty() && now < expires_at.saturating_sub(300) {
        return Ok(current);
    }

    let config = load_mp_app_config().ok_or("OAuth de Mercado Pago no configurado.")?;

    let client = mp_http_client()?;
    let response = client
        .post(MP_TOKEN_URL)
        .json(&json!({
            "client_id": config.client_id,
            "client_secret": config.client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh.trim(),
        }))
        .send()
        .map_err(|e| format!("Sin conexión con Mercado Pago: {e}"))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .map_err(|e| format!("Respuesta inválida al renovar token: {e}"))?;

    if !status.is_success() {
        let msg = body
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("No se pudo renovar el token. Volvé a conectar Mercado Pago.");
        return Err(msg.to_string());
    }

    let token_resp: TokenResponse =
        serde_json::from_value(body).map_err(|e| format!("Token renovado inválido: {e}"))?;

    persist_oauth_tokens(conn, &token_resp)?;
    Ok(token_resp.access_token)
}

fn persist_oauth_tokens(conn: &rusqlite::Connection, token: &TokenResponse) -> Result<(), String> {
    write_setting(conn, "mp_access_token", &token.access_token)?;
    if let Some(refresh) = &token.refresh_token {
        write_setting(conn, "mp_refresh_token", refresh)?;
    }
    if let Some(expires_in) = token.expires_in {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        write_setting(
            conn,
            "mp_token_expires_at",
            &format!("{}", now + expires_in),
        )?;
    }
    if let Some(uid) = token.user_id {
        write_setting(conn, "mp_user_id", &uid.to_string())?;
    }
    write_setting_flag(conn, "mp_oauth_connected", true)?;
    write_setting_flag(conn, "mp_simulation", false)?;
    Ok(())
}

fn fetch_user_profile(access_token: &str) -> Result<UserMeResponse, String> {
    let client = mp_http_client()?;
    let response = client
        .get(MP_USERS_ME_URL)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .map_err(|e| format!("Sin conexión con Mercado Pago: {e}"))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .map_err(|e| format!("Perfil MP inválido: {e}"))?;

    if !status.is_success() {
        return Err("No se pudo leer el perfil de Mercado Pago.".into());
    }

    serde_json::from_value(body).map_err(|e| format!("Perfil MP inválido: {e}"))
}

fn mp_error_ignorable(body: &serde_json::Value) -> bool {
    if body
        .get("error")
        .and_then(|v| v.as_str())
        .map(|e| e.eq_ignore_ascii_case("validation_error"))
        .unwrap_or(false)
    {
        return false;
    }
    let msg = body
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();
    if msg.contains("validation") {
        return false;
    }
    if msg.contains("already") || msg.contains("exist") || msg.contains("duplic") {
        return true;
    }
    if let Some(causes) = body.get("cause").and_then(|v| v.as_array()) {
        for cause in causes {
            let code = cause
                .get("code")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            if matches!(
                code.as_str(),
                "point_of_sale_exists" | "store_already_exists" | "duplicate"
            ) {
                return true;
            }
        }
    }
    false
}

fn mp_external_ids(user_id: &str) -> (String, String) {
    let digits: String = user_id.chars().filter(|c| c.is_ascii_digit()).collect();
    let suffix = if digits.is_empty() {
        user_id
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect()
    } else {
        digits
    };
    let store_id = format!("GC{suffix}");
    let pos_id = format!("{store_id}P1");
    (store_id, pos_id)
}

fn parse_numeric_id(value: &serde_json::Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().map(|n| n.max(0) as u64))
        .or_else(|| value.as_str().and_then(|s| s.parse().ok()))
}

fn search_store_numeric_id(
    client: &Client,
    access_token: &str,
    user_id: &str,
    external_store_id: &str,
) -> Option<u64> {
    let url = format!(
        "https://api.mercadopago.com/users/{user_id}/stores/search?external_id={}",
        url_encode(external_store_id)
    );
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body: serde_json::Value = response.json().ok()?;
    if let Some(results) = body.get("results").and_then(|v| v.as_array()) {
        if let Some(first) = results.first() {
            if let Some(id) = first.get("id").and_then(parse_numeric_id) {
                return Some(id);
            }
        }
    }
    if let Some(arr) = body.as_array() {
        for entry in arr {
            if let Some(results) = entry.get("results").and_then(|v| v.as_array()) {
                if let Some(first) = results.first() {
                    if let Some(id) = first.get("id").and_then(parse_numeric_id) {
                        return Some(id);
                    }
                }
            }
        }
    }
    None
}

/// Nombre oficial en `GET https://api.mercadolibre.com/countries/AR` (mismo catálogo que usa MP).
/// `plain` es la grafía sin tildes: la API de sucursales rechaza una u otra según el campo.
struct ArState {
    code: &'static str,
    official: &'static str,
    plain: Option<&'static str>,
}

const AR_STATES: &[ArState] = &[
    ArState { code: "AR-B", official: "Buenos Aires", plain: None },
    ArState { code: "AR-C", official: "Capital Federal", plain: None },
    ArState { code: "AR-K", official: "Catamarca", plain: None },
    ArState { code: "AR-H", official: "Chaco", plain: None },
    ArState { code: "AR-U", official: "Chubut", plain: None },
    ArState { code: "AR-W", official: "Corrientes", plain: None },
    ArState { code: "AR-X", official: "Córdoba", plain: Some("Cordoba") },
    ArState { code: "AR-E", official: "Entre Ríos", plain: Some("Entre Rios") },
    ArState { code: "AR-P", official: "Formosa", plain: None },
    ArState { code: "AR-Y", official: "Jujuy", plain: None },
    ArState { code: "AR-L", official: "La Pampa", plain: None },
    ArState { code: "AR-F", official: "La Rioja", plain: None },
    ArState { code: "AR-M", official: "Mendoza", plain: None },
    ArState { code: "AR-N", official: "Misiones", plain: None },
    ArState { code: "AR-Q", official: "Neuquén", plain: Some("Neuquen") },
    ArState { code: "AR-R", official: "Río Negro", plain: Some("Rio Negro") },
    ArState { code: "AR-A", official: "Salta", plain: None },
    ArState { code: "AR-J", official: "San Juan", plain: None },
    ArState { code: "AR-D", official: "San Luis", plain: None },
    ArState { code: "AR-Z", official: "Santa Cruz", plain: None },
    ArState { code: "AR-S", official: "Santa Fe", plain: None },
    ArState { code: "AR-G", official: "Santiago del Estero", plain: None },
    ArState { code: "AR-V", official: "Tierra del Fuego", plain: None },
    ArState { code: "AR-T", official: "Tucumán", plain: Some("Tucuman") },
];

struct CatalogPlace {
    street_name: &'static str,
    street_number: &'static str,
    city_name: &'static str,
    state_name: &'static str,
    latitude: f64,
    longitude: f64,
}

/// Pares que el validador de sucursales acepta. El primero que coincida con la provincia
/// de la cuenta se prueba antes que el resto, así una ciudad desconocida no bloquea el alta.
const STORE_LOCATION_CATALOG: &[CatalogPlace] = &[
    CatalogPlace { street_name: "Av Illia", street_number: "100", city_name: "San Luis", state_name: "San Luis", latitude: -33.3017, longitude: -66.3378 },
    CatalogPlace { street_name: "Av Colon", street_number: "100", city_name: "Córdoba", state_name: "Córdoba", latitude: -31.4201, longitude: -64.1888 },
    CatalogPlace { street_name: "Av Corrientes", street_number: "1000", city_name: "Palermo", state_name: "Capital Federal", latitude: -34.588, longitude: -58.430 },
    CatalogPlace { street_name: "Av Cabildo", street_number: "2000", city_name: "Belgrano", state_name: "Capital Federal", latitude: -34.562, longitude: -58.456 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "La Plata", state_name: "Buenos Aires", latitude: -34.921, longitude: -57.954 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Mendoza", state_name: "Mendoza", latitude: -32.8895, longitude: -68.8458 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Santa Fe", state_name: "Santa Fe", latitude: -31.6333, longitude: -60.7000 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Rosario", state_name: "Santa Fe", latitude: -32.9442, longitude: -60.6505 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Salta", state_name: "Salta", latitude: -24.7821, longitude: -65.4232 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "San Juan", state_name: "San Juan", latitude: -31.5375, longitude: -68.5364 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Corrientes", state_name: "Corrientes", latitude: -27.4692, longitude: -58.8306 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Resistencia", state_name: "Chaco", latitude: -27.4514, longitude: -58.9867 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Posadas", state_name: "Misiones", latitude: -27.3621, longitude: -55.9008 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Paraná", state_name: "Entre Ríos", latitude: -31.7333, longitude: -60.5333 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Neuquén", state_name: "Neuquén", latitude: -38.9516, longitude: -68.0591 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Viedma", state_name: "Río Negro", latitude: -40.8135, longitude: -62.9967 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "San Miguel de Tucumán", state_name: "Tucumán", latitude: -26.8083, longitude: -65.2176 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Tucumán", state_name: "Tucumán", latitude: -26.8083, longitude: -65.2176 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "San Salvador de Jujuy", state_name: "Jujuy", latitude: -24.1858, longitude: -65.2995 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Catamarca", state_name: "Catamarca", latitude: -28.4696, longitude: -65.7795 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "La Rioja", state_name: "La Rioja", latitude: -29.4131, longitude: -66.8563 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Santa Rosa", state_name: "La Pampa", latitude: -36.6203, longitude: -64.2906 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Formosa", state_name: "Formosa", latitude: -26.1775, longitude: -58.1781 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Rawson", state_name: "Chubut", latitude: -43.3002, longitude: -65.1023 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Río Gallegos", state_name: "Santa Cruz", latitude: -51.6230, longitude: -69.2168 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Ushuaia", state_name: "Tierra del Fuego", latitude: -54.8019, longitude: -68.3030 },
    CatalogPlace { street_name: "San Martin", street_number: "100", city_name: "Santiago del Estero", state_name: "Santiago del Estero", latitude: -27.7951, longitude: -64.2615 },
];

fn fold_location_key(value: &str) -> String {
    value
        .chars()
        .map(|c| match c {
            'Á' | 'À' | 'Ä' | 'á' | 'à' | 'ä' => 'a',
            'É' | 'È' | 'Ë' | 'é' | 'è' | 'ë' => 'e',
            'Í' | 'Ì' | 'Ï' | 'í' | 'ì' | 'ï' => 'i',
            'Ó' | 'Ò' | 'Ö' | 'ó' | 'ò' | 'ö' => 'o',
            'Ú' | 'Ù' | 'Ü' | 'ú' | 'ù' | 'ü' => 'u',
            'Ñ' | 'ñ' => 'n',
            other => other.to_ascii_lowercase(),
        })
        .filter(|c| c.is_ascii_alphanumeric() || *c == ' ')
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn without_accents(value: &str) -> String {
    value
        .chars()
        .map(|c| match c {
            'á' => 'a',
            'Á' => 'A',
            'é' => 'e',
            'É' => 'E',
            'í' => 'i',
            'Í' => 'I',
            'ó' => 'o',
            'Ó' => 'O',
            'ú' => 'u',
            'Ú' => 'U',
            'ü' => 'u',
            'Ü' => 'U',
            'ñ' => 'n',
            'Ñ' => 'N',
            other => other,
        })
        .collect()
}

fn resolve_state_name(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let folded = fold_location_key(trimmed);
    if matches!(
        folded.as_str(),
        "capital federal"
            | "caba"
            | "ciudad autonoma de buenos aires"
            | "ciudad de buenos aires"
            | "ciudad autonoma"
            | "cf"
    ) || trimmed.eq_ignore_ascii_case("AR-C")
    {
        return "Capital Federal".to_string();
    }
    if trimmed.to_ascii_uppercase().starts_with("AR-") {
        if let Some(state) = AR_STATES
            .iter()
            .find(|state| state.code.eq_ignore_ascii_case(trimmed))
        {
            return state.official.to_string();
        }
    }
    if let Some(state) = AR_STATES
        .iter()
        .find(|state| fold_location_key(state.official) == folded)
    {
        return state.official.to_string();
    }
    trimmed.to_string()
}

fn plain_state_name(state: &str) -> Option<&'static str> {
    let folded = fold_location_key(state);
    AR_STATES.iter().find_map(|entry| {
        if fold_location_key(entry.official) == folded {
            entry.plain
        } else {
            None
        }
    })
}

fn state_coords(state: &str) -> (f64, f64) {
    let folded = fold_location_key(state);
    STORE_LOCATION_CATALOG
        .iter()
        .find(|place| fold_location_key(place.state_name) == folded)
        .map(|place| (place.latitude, place.longitude))
        .unwrap_or((-34.6037, -58.3816))
}

fn json_text(value: &serde_json::Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        let text = text.trim();
        if !text.is_empty() {
            return Some(text.to_string());
        }
    }
    if let Some(n) = value.as_i64() {
        return Some(n.to_string());
    }
    if let Some(n) = value.as_u64() {
        return Some(n.to_string());
    }
    if let Some(obj) = value.as_object() {
        for key in ["name", "city_name", "state_name"] {
            if let Some(text) = obj.get(key).and_then(json_text) {
                return Some(text);
            }
        }
        if let Some(text) = obj.get("id").and_then(|v| v.as_str()) {
            let text = text.trim();
            if !text.is_empty() {
                return Some(text.to_string());
            }
        }
    }
    None
}

fn address_text(address: &serde_json::Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(text) = address.get(*key).and_then(json_text) {
            return Some(text);
        }
    }
    None
}

fn profile_city_state(profile: &UserMeResponse) -> Option<(String, String, String, String)> {
    let address = profile.address.as_ref()?;
    let city = address_text(address, &["city", "city_name"])?;
    let state = address_text(address, &["state", "state_name"])?;
    let street = address_text(address, &["street_name", "address"]).unwrap_or_default();
    let number = address_text(address, &["street_number"]).unwrap_or_default();
    Some((city, state, street, number))
}

fn first_setting(conn: &rusqlite::Connection, keys: &[&str]) -> String {
    for key in keys {
        let value = read_setting_or(conn, key, "");
        let value = value.trim();
        if !value.is_empty() {
            return value.to_string();
        }
    }
    String::new()
}

fn location_payload(
    street_name: &str,
    street_number: &str,
    city_name: &str,
    state_name: &str,
    latitude: f64,
    longitude: f64,
) -> serde_json::Value {
    json!({
        "street_name": street_name,
        "street_number": street_number,
        "city_name": city_name,
        "state_name": state_name,
        "latitude": latitude,
        "longitude": longitude,
        "reference": "Local"
    })
}

fn sanitize_street(name: &str) -> String {
    let cleaned = name
        .chars()
        .filter(|c| c.is_ascii_alphabetic() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if cleaned.chars().count() < 3 {
        "San Martin".to_string()
    } else {
        cleaned.chars().take(40).collect()
    }
}

fn sanitize_street_number(raw: &str) -> String {
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        "100".to_string()
    } else {
        digits.chars().take(6).collect()
    }
}

fn push_location(
    out: &mut Vec<serde_json::Value>,
    seen: &mut Vec<String>,
    city_name: &str,
    state_name: &str,
    street_name: &str,
    street_number: &str,
    latitude: f64,
    longitude: f64,
) {
    let city_name = city_name.trim();
    let state_name = state_name.trim();
    if city_name.is_empty() || state_name.is_empty() {
        return;
    }
    let key = format!(
        "{}|{}",
        city_name.to_lowercase(),
        state_name.to_lowercase()
    );
    if seen.iter().any(|existing| existing == &key) {
        return;
    }
    seen.push(key);
    out.push(location_payload(
        street_name,
        street_number,
        city_name,
        state_name,
        latitude,
        longitude,
    ));
}

/// Ciudad del comercio primero. Después la grafía oficial y, si lleva tilde, la variante sin tilde.
fn push_place_spellings(
    out: &mut Vec<serde_json::Value>,
    seen: &mut Vec<String>,
    city: &str,
    state: &str,
    street_name: &str,
    street_number: &str,
    latitude: f64,
    longitude: f64,
) {
    let state_official = resolve_state_name(state);
    if state_official.is_empty() {
        return;
    }
    push_location(
        out,
        seen,
        city,
        &state_official,
        street_name,
        street_number,
        latitude,
        longitude,
    );
    if fold_location_key(city) == fold_location_key(&state_official) {
        push_location(
            out,
            seen,
            &state_official,
            &state_official,
            street_name,
            street_number,
            latitude,
            longitude,
        );
    }
    if let Some(plain_state) = plain_state_name(&state_official) {
        let plain_city = if fold_location_key(city) == fold_location_key(&state_official) {
            plain_state.to_string()
        } else {
            without_accents(city)
        };
        push_location(
            out,
            seen,
            &plain_city,
            plain_state,
            street_name,
            street_number,
            latitude,
            longitude,
        );
    } else {
        let plain_city = without_accents(city);
        if plain_city != city {
            push_location(
                out,
                seen,
                &plain_city,
                &state_official,
                street_name,
                street_number,
                latitude,
                longitude,
            );
        }
    }
}

fn push_catalog_place(
    out: &mut Vec<serde_json::Value>,
    seen: &mut Vec<String>,
    place: &CatalogPlace,
) {
    push_place_spellings(
        out,
        seen,
        place.city_name,
        place.state_name,
        place.street_name,
        place.street_number,
        place.latitude,
        place.longitude,
    );
}

fn store_location_attempts(
    profile: Option<&UserMeResponse>,
    conn: &rusqlite::Connection,
) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    let mut seen = Vec::new();
    let mut preferred_state = String::new();

    if let Some(profile) = profile {
        if let Some((city, state, street, number)) = profile_city_state(profile) {
            preferred_state = resolve_state_name(&state);
            let (lat, lng) = state_coords(&preferred_state);
            push_place_spellings(
                &mut out,
                &mut seen,
                &city,
                &state,
                &sanitize_street(&street),
                &sanitize_street_number(&number),
                lat,
                lng,
            );
        }
    }

    let settings_city = first_setting(
        conn,
        &[
            "business_city",
            "ciudad",
            "business_ciudad",
            "business_localidad",
        ],
    );
    let settings_state = first_setting(
        conn,
        &[
            "business_province",
            "provincia",
            "business_provincia",
            "business_state",
        ],
    );
    if !settings_city.is_empty() && !settings_state.is_empty() {
        if preferred_state.is_empty() {
            preferred_state = resolve_state_name(&settings_state);
        }
        let (lat, lng) = state_coords(&settings_state);
        push_place_spellings(
            &mut out,
            &mut seen,
            &settings_city,
            &settings_state,
            "San Martin",
            "100",
            lat,
            lng,
        );
    }

    let preferred_fold = fold_location_key(&preferred_state);
    if !preferred_fold.is_empty() {
        for place in STORE_LOCATION_CATALOG {
            if fold_location_key(place.state_name) == preferred_fold {
                push_catalog_place(&mut out, &mut seen, place);
            }
        }
    }
    for place in STORE_LOCATION_CATALOG {
        push_catalog_place(&mut out, &mut seen, place);
    }
    out
}

fn is_location_validation_error(body: &serde_json::Value) -> bool {
    let raw = serde_json::to_string(body).unwrap_or_default().to_lowercase();
    let mentions_place = raw.contains("city_name")
        || raw.contains("state_name")
        || raw.contains("location.city")
        || raw.contains("location.state");
    let invalid = raw.contains("invalid") || raw.contains("validation");
    mentions_place && invalid
}

fn sanitize_store_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| c.is_ascii_alphabetic() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if cleaned.is_empty() {
        "Mi Comercio".to_string()
    } else {
        cleaned.chars().take(45).collect()
    }
}

fn post_store(
    client: &Client,
    access_token: &str,
    user_id: &str,
    payload: &serde_json::Value,
) -> Result<(bool, serde_json::Value), String> {
    let store_url = format!("https://api.mercadopago.com/users/{user_id}/stores");
    let response = client
        .post(&store_url)
        .header("Authorization", format!("Bearer {access_token}"))
        .json(payload)
        .send()
        .map_err(|e| format!("Sin conexión al crear sucursal: {e}"))?;
    let status = response.status();
    let body: serde_json::Value = response.json().unwrap_or(json!({}));
    Ok((status.is_success(), body))
}

fn ensure_store_numeric_id(
    client: &Client,
    access_token: &str,
    user_id: &str,
    external_store_id: &str,
    business_name: &str,
    locations: &[serde_json::Value],
) -> Result<u64, String> {
    if let Some((id, _)) = find_existing_store(client, access_token, user_id, external_store_id) {
        return Ok(id);
    }

    let name = sanitize_store_name(business_name);
    let mut first_err = String::new();
    for location in locations {
        let payload = json!({
            "name": name,
            "external_id": external_store_id,
            "location": location
        });
        let (ok, body) = post_store(client, access_token, user_id, &payload)?;
        if ok {
            if let Some(id) = body.get("id").and_then(parse_numeric_id) {
                return Ok(id);
            }
        }
        if mp_error_ignorable(&body) {
            if let Some((id, _)) =
                find_existing_store(client, access_token, user_id, external_store_id)
            {
                return Ok(id);
            }
        }
        if first_err.is_empty() {
            first_err = mp_api_error("sucursal", &body);
        }
        if is_location_validation_error(&body) || mp_error_ignorable(&body) {
            continue;
        }
        if let Some((id, _)) = find_existing_store(client, access_token, user_id, external_store_id)
        {
            return Ok(id);
        }
        return Err(mp_api_error("sucursal", &body));
    }

    if let Some((id, _)) = find_existing_store(client, access_token, user_id, external_store_id) {
        return Ok(id);
    }

    if first_err.is_empty() {
        first_err = "Mercado Pago no devolvió la sucursal.".into();
    }
    Err(first_err)
}

fn search_pos_external_id(
    client: &Client,
    access_token: &str,
    external_id: &str,
) -> Option<String> {
    let url = format!(
        "https://api.mercadopago.com/pos?external_id={}",
        url_encode(external_id)
    );
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body: serde_json::Value = response.json().ok()?;
    body.get("results")
        .and_then(|v| v.as_array())
        .and_then(|rows| rows.first())
        .and_then(|row| row.get("external_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn store_id_and_external(entry: &serde_json::Value) -> Option<(u64, String)> {
    let id = entry.get("id").and_then(parse_numeric_id)?;
    let external = entry
        .get("external_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Some((id, external))
}

fn first_store_in_body(body: &serde_json::Value) -> Option<(u64, String)> {
    if let Some(results) = body.get("results").and_then(|v| v.as_array()) {
        if let Some(found) = results.first().and_then(store_id_and_external) {
            return Some(found);
        }
    }
    if let Some(found) = store_id_and_external(body) {
        return Some(found);
    }
    let entries = body.as_array()?;
    for entry in entries {
        if let Some(results) = entry.get("results").and_then(|v| v.as_array()) {
            if let Some(found) = results.first().and_then(store_id_and_external) {
                return Some(found);
            }
        }
        if let Some(found) = store_id_and_external(entry) {
            return Some(found);
        }
    }
    None
}

fn list_first_store(
    client: &Client,
    access_token: &str,
    user_id: &str,
) -> Option<(u64, String)> {
    let url = format!("https://api.mercadopago.com/users/{user_id}/stores/search?limit=10");
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body: serde_json::Value = response.json().ok()?;
    first_store_in_body(&body)
}

fn find_existing_store(
    client: &Client,
    access_token: &str,
    user_id: &str,
    external_store_id: &str,
) -> Option<(u64, String)> {
    if let Some(id) = search_store_numeric_id(client, access_token, user_id, external_store_id) {
        return Some((id, external_store_id.to_string()));
    }
    list_first_store(client, access_token, user_id)
}

fn list_any_existing_pos(client: &Client, access_token: &str) -> Option<(String, String)> {
    let response = client
        .get("https://api.mercadopago.com/pos?limit=50")
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body: serde_json::Value = response.json().ok()?;
    let row = body.get("results").and_then(|v| v.as_array())?.first()?;
    let pos_id = row.get("external_id").and_then(|v| v.as_str())?;
    let store_id = row
        .get("external_store_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Some((store_id, pos_id.to_string()))
}

fn post_pos(
    client: &Client,
    access_token: &str,
    payload: &serde_json::Value,
) -> Result<(bool, serde_json::Value), String> {
    let response = client
        .post("https://api.mercadopago.com/pos")
        .header("Authorization", format!("Bearer {access_token}"))
        .json(payload)
        .send()
        .map_err(|e| format!("Sin conexión al crear caja: {e}"))?;
    let status = response.status();
    let body: serde_json::Value = response.json().unwrap_or(json!({}));
    Ok((status.is_success(), body))
}

fn create_pos_with_fallbacks(
    client: &Client,
    access_token: &str,
    store_numeric_id: u64,
    external_store_id: &str,
    external_pos_id: &str,
) -> Result<String, String> {
    let attempts = [
        json!({
            "name": "Caja1",
            "fixed_amount": true,
            "store_id": store_numeric_id,
            "external_store_id": external_store_id,
            "external_id": external_pos_id
        }),
        json!({
            "name": "Caja1",
            "fixed_amount": true,
            "store_id": store_numeric_id,
            "external_store_id": external_store_id,
            "external_id": external_pos_id,
            "category": 621102
        }),
        json!({
            "name": "Caja1",
            "fixed_amount": true,
            "store_id": store_numeric_id,
            "external_id": external_pos_id
        }),
        json!({
            "name": "Caja1",
            "fixed_amount": true,
            "external_store_id": external_store_id,
            "external_id": external_pos_id
        }),
    ];

    let mut last_err = String::new();
    for payload in &attempts {
        let (ok, body) = post_pos(client, access_token, payload)?;
        if ok {
            let pos_id = body
                .get("external_id")
                .and_then(|v| v.as_str())
                .unwrap_or(external_pos_id)
                .to_string();
            return Ok(pos_id);
        }
        if mp_error_ignorable(&body) {
            if let Some(found) = search_pos_external_id(client, access_token, external_pos_id)
                .or_else(|| search_pos_for_store(client, access_token, external_store_id))
            {
                return Ok(found);
            }
        } else {
            last_err = mp_api_error("caja QR", &body);
        }
    }

    if let Some(found) = search_pos_external_id(client, access_token, external_pos_id)
        .or_else(|| search_pos_for_store(client, access_token, external_store_id))
    {
        return Ok(found);
    }

    Err(if last_err.is_empty() {
        "caja QR: Mercado Pago no devolvió la caja.".into()
    } else {
        last_err
    })
}

fn search_pos_for_store(
    client: &Client,
    access_token: &str,
    external_store_id: &str,
) -> Option<String> {
    let url = format!(
        "https://api.mercadopago.com/pos?external_store_id={}",
        url_encode(external_store_id)
    );
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body: serde_json::Value = response.json().ok()?;
    body.get("results")
        .and_then(|v| v.as_array())
        .and_then(|rows| rows.first())
        .and_then(|row| row.get("external_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn ensure_store_and_pos(
    access_token: &str,
    user_id: &str,
    business_name: &str,
    locations: &[serde_json::Value],
) -> Result<(String, String), String> {
    let (external_store_id, external_pos_id) = mp_external_ids(user_id);
    let client = mp_http_client()?;

    if let Some(found) = search_pos_external_id(&client, access_token, &external_pos_id) {
        return Ok((external_store_id, found));
    }
    if let Some(found) = search_pos_for_store(&client, access_token, &external_store_id) {
        return Ok((external_store_id, found));
    }

    if let Some((store_numeric_id, existing_external)) =
        find_existing_store(&client, access_token, user_id, &external_store_id)
    {
        let store_ext = if existing_external.is_empty() {
            external_store_id.clone()
        } else {
            existing_external
        };
        let pos_id = create_pos_with_fallbacks(
            &client,
            access_token,
            store_numeric_id,
            &store_ext,
            &external_pos_id,
        )?;
        return Ok((store_ext, pos_id));
    }

    if let Some((existing_store, existing_pos)) = list_any_existing_pos(&client, access_token) {
        let store = if existing_store.is_empty() {
            external_store_id.clone()
        } else {
            existing_store
        };
        return Ok((store, existing_pos));
    }

    let store_numeric_id = ensure_store_numeric_id(
        &client,
        access_token,
        user_id,
        &external_store_id,
        business_name,
        locations,
    )?;

    let pos_id = create_pos_with_fallbacks(
        &client,
        access_token,
        store_numeric_id,
        &external_store_id,
        &external_pos_id,
    )?;
    Ok((external_store_id, pos_id))
}

/// Recrea o busca sucursal/caja en MP y actualiza la base local (útil si quedó vinculado sin POS).
pub fn repair_mp_store_and_pos(conn: &rusqlite::Connection) -> Result<(String, String), String> {
    let business_name = read_setting_or(conn, "business_name", "Mi Comercio");
    let token = mp_access_token_for_api(conn)?;
    let mut user_id = read_setting_or(conn, "mp_user_id", "");
    let profile = fetch_user_profile(&token).ok();
    if user_id.trim().is_empty() {
        let profile = profile.as_ref().ok_or("No se pudo leer el perfil de Mercado Pago.")?;
        user_id = profile.id.to_string();
        write_setting(conn, "mp_user_id", &user_id)?;
    }
    let locations = store_location_attempts(profile.as_ref(), conn);
    let (external_store_id, external_pos_id) =
        ensure_store_and_pos(&token, user_id.trim(), &business_name, &locations)?;
    write_setting(conn, "mp_external_store_id", &external_store_id)?;
    write_setting(conn, "mp_external_pos_id", &external_pos_id)?;
    write_setting_flag(conn, "mp_enabled", true)?;
    Ok((external_store_id, external_pos_id))
}

pub fn run_mp_oauth_flow(app: &AppHandle) -> Result<MpConnectResult, String> {
    let config = load_mp_app_config().ok_or(
        "La conexión automática con Mercado Pago aún no está habilitada en esta instalación.",
    )?;

    let state = Uuid::new_v4().to_string();
    let (code_verifier, code_challenge) = pkce_pair();
    let (tx, rx) = mpsc::channel();

    {
        let mut guard = pending_oauth()
            .lock()
            .map_err(|_| "Error interno al iniciar OAuth.".to_string())?;
        if guard.is_some() {
            return Err("Ya hay una conexión con Mercado Pago en curso.".into());
        }
        *guard = Some(PendingOAuth {
            state: state.clone(),
            tx,
        });
    }

    let redirect_uri = config.redirect_uri.trim();
    let auth_url = format!(
        "{MP_AUTH_URL}?response_type=code&client_id={}&platform_id=mp&state={}&redirect_uri={}&scope=offline_access%20read%20write&code_challenge={}&code_challenge_method=S256",
        url_encode(&config.client_id),
        url_encode(&state),
        url_encode(redirect_uri),
        url_encode(&code_challenge),
    );

    spawn_oauth_local_callback_server();

    let _ = app.emit("mp-oauth-url", auth_url.clone());

    if let Err(e) = crate::open_browser::open_https_in_browser(&auth_url) {
        if let Err(e2) = app.opener().open_url(&auth_url, None::<&str>) {
            let _ = pending_oauth().lock().map(|mut g| *g = None);
            return Err(format!("No se pudo abrir el navegador: {e2} ({e})"));
        }
    }

    let code = match rx.recv_timeout(Duration::from_secs(OAUTH_WAIT_SECS)) {
        Ok(Ok(code)) => code,
        Ok(Err(e)) => return Err(e),
        Err(_) => {
            let _ = pending_oauth().lock().map(|mut g| *g = None);
            return Err(
                "Tiempo agotado. Dejá Walqo abierta, autorizá en el navegador y volvé a intentar."
                    .into(),
            );
        }
    };

    let redirect_uri = config.redirect_uri.trim();
    let token = exchange_authorization_code(&code, &code_verifier, redirect_uri).map_err(|e| {
        if e.contains("invalid_grant") {
            format!(
                "{e}. No recargues la pestaña del navegador: hacé clic en «Conectar con Mercado Pago» otra vez."
            )
        } else {
            format!("No se pudo autorizar la cuenta: {e}")
        }
    })?;
    let profile = fetch_user_profile(&token.access_token)
        .map_err(|e| format!("No se pudo leer tu perfil de Mercado Pago: {e}"))?;

    let conn = open_exclusive()?;
    let business_name = read_setting_or(&conn, "business_name", "Mi Comercio");
    let user_id = profile.id.to_string();
    write_setting(&conn, "mp_user_id", &user_id)?;
    let locations = store_location_attempts(Some(&profile), &conn);
    let (external_store_id, external_pos_id) =
        ensure_store_and_pos(&token.access_token, &user_id, &business_name, &locations)?;

    persist_oauth_tokens(&conn, &token)?;

    let nickname = profile
        .nickname
        .or(profile.email)
        .unwrap_or_else(|| format!("Usuario {}", profile.id));

    write_setting(&conn, "mp_user_nickname", &nickname)?;
    write_setting(&conn, "mp_external_store_id", &external_store_id)?;
    write_setting(&conn, "mp_external_pos_id", &external_pos_id)?;
    write_setting_flag(&conn, "mp_enabled", true)?;

    let result = MpConnectResult {
        user_id,
        nickname,
        external_store_id,
        external_pos_id,
    };
    let _ = app.emit("mp-oauth-connected", &result);
    Ok(result)
}

#[tauri::command]
pub async fn connect_mp_oauth(app: AppHandle) -> Result<MpConnectResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_mp_oauth_flow(&app))
        .await
        .map_err(|e| format!("{e:?}"))?
}

#[tauri::command]
pub fn disconnect_mp_oauth() -> Result<(), String> {
    let conn = open_exclusive()?;
    for key in [
        "mp_access_token",
        "mp_refresh_token",
        "mp_token_expires_at",
        "mp_user_id",
        "mp_user_nickname",
        "mp_external_store_id",
        "mp_external_pos_id",
    ] {
        write_setting(&conn, key, "")?;
    }
    write_setting_flag(&conn, "mp_oauth_connected", false)?;
    write_setting_flag(&conn, "mp_enabled", false)?;
    Ok(())
}

pub fn mp_access_token_for_api(conn: &rusqlite::Connection) -> Result<String, String> {
    if read_setting_flag(conn, "mp_oauth_connected") {
        return refresh_mp_access_token(conn);
    }
    let token = read_setting_or(conn, "mp_access_token", "");
    if token.trim().is_empty() {
        return Err("Mercado Pago no está conectado.".into());
    }
    Ok(token)
}

pub fn oauth_connected_nickname(conn: &rusqlite::Connection) -> Option<String> {
    if !read_setting_flag(conn, "mp_oauth_connected") {
        return None;
    }
    read_setting(conn, "mp_user_nickname")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_settings() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)",
            [],
        )
        .unwrap();
        conn
    }

    fn city_state_pairs(locations: &[serde_json::Value]) -> Vec<(String, String)> {
        locations
            .iter()
            .map(|loc| {
                (
                    loc["city_name"].as_str().unwrap_or("").to_string(),
                    loc["state_name"].as_str().unwrap_or("").to_string(),
                )
            })
            .collect()
    }

    fn profile_with_address(city: &str, state: &str) -> UserMeResponse {
        serde_json::from_value(json!({
            "id": 1,
            "address": { "city": city, "state": state }
        }))
        .unwrap()
    }

    #[test]
    fn cordoba_uses_official_accent_then_plain_spelling() {
        assert_eq!(resolve_state_name("AR-X"), "Córdoba");
        assert_eq!(resolve_state_name("Cordoba"), "Córdoba");
        assert_eq!(plain_state_name("Córdoba"), Some("Cordoba"));

        let conn = memory_settings();
        let profile = profile_with_address("Córdoba", "AR-X");
        let pairs = city_state_pairs(&store_location_attempts(Some(&profile), &conn));
        assert_eq!(pairs[0], ("Córdoba".to_string(), "Córdoba".to_string()));
        assert!(pairs.iter().any(|p| p.0 == "Cordoba" && p.1 == "Cordoba"));
        let accented = pairs.iter().position(|p| p.0 == "Córdoba" && p.1 == "Córdoba");
        let plain = pairs.iter().position(|p| p.0 == "Cordoba" && p.1 == "Cordoba");
        assert!(accented.unwrap() < plain.unwrap());
    }

    #[test]
    fn merchant_city_is_tried_before_national_fallbacks() {
        let conn = memory_settings();
        let profile = profile_with_address("Villa Mercedes", "AR-D");
        let pairs = city_state_pairs(&store_location_attempts(Some(&profile), &conn));
        assert_eq!(
            pairs[0],
            ("Villa Mercedes".to_string(), "San Luis".to_string())
        );
        assert!(pairs.iter().any(|p| p.0 == "San Luis" && p.1 == "San Luis"));
        assert!(pairs.iter().any(|p| p.0 == "Palermo" && p.1 == "Capital Federal"));
        assert!(pairs.iter().any(|p| p.0 == "Belgrano" && p.1 == "Capital Federal"));
        let own = pairs.iter().position(|p| p.0 == "Villa Mercedes").unwrap();
        let capital = pairs.iter().position(|p| p.0 == "San Luis").unwrap();
        let palermo = pairs.iter().position(|p| p.0 == "Palermo").unwrap();
        assert!(own < capital);
        assert!(capital < palermo);
    }

    #[test]
    fn settings_city_is_used_when_profile_has_no_address() {
        let conn = memory_settings();
        write_setting(&conn, "ciudad", "Villa Mercedes").unwrap();
        write_setting(&conn, "provincia", "San Luis").unwrap();
        let profile = serde_json::from_value::<UserMeResponse>(json!({"id": 9})).unwrap();
        let pairs = city_state_pairs(&store_location_attempts(Some(&profile), &conn));
        assert_eq!(
            pairs[0],
            ("Villa Mercedes".to_string(), "San Luis".to_string())
        );
    }

    #[test]
    fn missing_city_still_covers_san_luis_cordoba_and_caba() {
        let conn = memory_settings();
        let pairs = city_state_pairs(&store_location_attempts(None, &conn));
        assert_eq!(pairs[0], ("San Luis".to_string(), "San Luis".to_string()));
        assert!(pairs.iter().any(|p| p.0 == "Córdoba" && p.1 == "Córdoba"));
        assert!(pairs.iter().any(|p| p.0 == "Palermo" && p.1 == "Capital Federal"));
        assert!(pairs.iter().any(|p| p.0 == "Mendoza" && p.1 == "Mendoza"));
    }
}
