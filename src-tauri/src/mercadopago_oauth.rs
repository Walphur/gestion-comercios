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
use tauri::AppHandle;
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
            format!("Mercado Pago rechazó la autorización: {err} {desc}").trim().to_string(),
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
        let _ = pending.tx.send(Err("Estado OAuth inválido. Intentá conectar de nuevo.".into()));
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
            "<!DOCTYPE html><html lang=\"es\"><body style=\"font-family:system-ui;text-align:center;padding:2rem\"><h1>No se pudo vincular</h1><p>Volvé a Gestión Comercios e intentá de nuevo.</p></body></html>",
        );
        return delivered;
    }
    let code = parse_query_param(query, "code").unwrap_or_default();
    let state = parse_query_param(query, "state").unwrap_or_default();
    let delivered = deliver_oauth_code(&code, &state);
    let body = if delivered {
        "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"utf-8\"><title>Listo</title></head><body style=\"font-family:system-ui;text-align:center;padding:2rem;background:#0c1816;color:#f0faf8\"><h1>¡Listo!</h1><p>Mercado Pago vinculado. Podés cerrar esta pestaña y volver a Gestión Comercios.</p></body></html>"
    } else {
        "<!DOCTYPE html><html lang=\"es\"><body style=\"font-family:system-ui;text-align:center;padding:2rem\"><h1>Sin conexión con la app</h1><p>Dejá Gestión Comercios abierta y hacé clic en «Conectar con Mercado Pago» otra vez.</p></body></html>"
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

fn format_mp_oauth_error(body: &serde_json::Value) -> String {
    let mut parts = Vec::new();
    if let Some(msg) = body.get("message").and_then(|v| v.as_str()) {
        if !msg.is_empty() {
            parts.push(msg.to_string());
        }
    }
    if let Some(err) = body.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() && !parts.iter().any(|p| p == err) {
            parts.push(err.to_string());
        }
    }
    if let Some(causes) = body.get("cause").and_then(|v| v.as_array()) {
        for cause in causes {
            if let Some(desc) = cause.get("description").and_then(|v| v.as_str()) {
                if !desc.is_empty() {
                    parts.push(desc.to_string());
                }
            } else if let Some(code) = cause.get("code").and_then(|v| v.as_str()) {
                if !code.is_empty() {
                    parts.push(code.to_string());
                }
            }
        }
    }
    if parts.is_empty() {
        "No se pudo obtener el token de Mercado Pago.".to_string()
    } else {
        parts.join(" — ")
    }
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
    let config =
        load_mp_app_config().ok_or("OAuth de Mercado Pago no configurado en esta versión de la app.")?;

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
            "test_token": "false",
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

    let token_resp: TokenResponse = serde_json::from_value(body)
        .map_err(|e| format!("Token renovado inválido: {e}"))?;

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
    let msg = body
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();
    msg.contains("already") || msg.contains("exist") || msg.contains("duplic")
}

fn ensure_store_and_pos(
    access_token: &str,
    user_id: &str,
    business_name: &str,
) -> Result<(String, String), String> {
    let external_store_id = format!("GC{user_id}");
    let external_pos_id = format!("{external_store_id}POS1");
    let client = mp_http_client()?;

    let store_url = format!("https://api.mercadopago.com/users/{user_id}/stores");
    let store_payload = json!({
        "name": business_name.chars().take(60).collect::<String>(),
        "external_id": external_store_id,
        "location": {
            "street_name": "Sin especificar",
            "street_number": "0",
            "city_name": "Buenos Aires",
            "state_name": "Buenos Aires",
            "latitude": -34.6037,
            "longitude": -58.3816
        }
    });

    let store_resp = client
        .post(&store_url)
        .header("Authorization", format!("Bearer {access_token}"))
        .json(&store_payload)
        .send()
        .map_err(|e| format!("Sin conexión al crear sucursal: {e}"))?;

    if !store_resp.status().is_success() {
        let body: serde_json::Value = store_resp.json().unwrap_or(json!({}));
        if !mp_error_ignorable(&body) {
            let msg = body
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("No se pudo crear la sucursal en Mercado Pago");
            return Err(msg.to_string());
        }
    }

    let pos_payload = json!({
        "name": "Caja 1",
        "external_store_id": external_store_id,
        "external_id": external_pos_id
    });

    let pos_resp = client
        .post("https://api.mercadopago.com/pos")
        .header("Authorization", format!("Bearer {access_token}"))
        .json(&pos_payload)
        .send()
        .map_err(|e| format!("Sin conexión al crear caja: {e}"))?;

    if !pos_resp.status().is_success() {
        let body: serde_json::Value = pos_resp.json().unwrap_or(json!({}));
        if !mp_error_ignorable(&body) {
            let msg = body
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("No se pudo crear la caja en Mercado Pago");
            return Err(msg.to_string());
        }
    }

    Ok((external_store_id, external_pos_id))
}

pub fn run_mp_oauth_flow(app: &AppHandle) -> Result<MpConnectResult, String> {
    let config = load_mp_app_config()
        .ok_or("La conexión automática con Mercado Pago aún no está habilitada en esta instalación.")?;

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

    let auth_url = format!(
        "{MP_AUTH_URL}?response_type=code&client_id={}&platform_id=mp&state={}&redirect_uri={}&code_challenge={}&code_challenge_method=S256",
        url_encode(&config.client_id),
        url_encode(&state),
        url_encode(&config.redirect_uri),
        url_encode(&code_challenge),
    );

    spawn_oauth_local_callback_server();

    if let Err(e) = app.opener().open_url(&auth_url, None::<&str>) {
        let _ = pending_oauth().lock().map(|mut g| *g = None);
        return Err(format!("No se pudo abrir el navegador: {e}"));
    }

    let code = match rx.recv_timeout(Duration::from_secs(OAUTH_WAIT_SECS)) {
        Ok(Ok(code)) => code,
        Ok(Err(e)) => return Err(e),
        Err(_) => {
            let _ = pending_oauth().lock().map(|mut g| *g = None);
            return Err(
                "Tiempo agotado. Dejá Gestión Comercios abierta, autorizá en el navegador y volvé a intentar."
                    .into(),
            );
        }
    };

    let token = exchange_authorization_code(&code, &code_verifier, &config.redirect_uri)?;
    let profile = fetch_user_profile(&token.access_token)?;

    let conn = open_exclusive()?;
    persist_oauth_tokens(&conn, &token)?;

    let business_name = read_setting_or(&conn, "business_name", "Mi Comercio");
    let user_id = profile.id.to_string();
    let (external_store_id, external_pos_id) =
        ensure_store_and_pos(&token.access_token, &user_id, &business_name)?;

    let nickname = profile
        .nickname
        .or(profile.email)
        .unwrap_or_else(|| format!("Usuario {}", profile.id));

    write_setting(&conn, "mp_user_nickname", &nickname)?;
    write_setting(&conn, "mp_external_store_id", &external_store_id)?;
    write_setting(&conn, "mp_external_pos_id", &external_pos_id)?;
    write_setting_flag(&conn, "mp_enabled", true)?;

    Ok(MpConnectResult {
        user_id,
        nickname,
        external_store_id,
        external_pos_id,
    })
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
