use crate::database::open_exclusive;
use crate::mp_app_credentials::load_mp_app_credentials;
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
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

pub const MP_OAUTH_PORT: u16 = 3847;
pub const MP_REDIRECT_URI: &str = "http://127.0.0.1:3847/callback";
const MP_AUTH_URL: &str = "https://auth.mercadopago.com/authorization";
const MP_TOKEN_URL: &str = "https://api.mercadopago.com/oauth/token";
const MP_USERS_ME_URL: &str = "https://api.mercadopago.com/users/me";

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

fn respond_oauth_html(stream: &mut TcpStream, title: &str, message: &str) {
    let body = format!(
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>{title}</title></head>\
         <body style=\"font-family:system-ui,sans-serif;text-align:center;padding:3rem;background:#0c1816;color:#f0faf8\">\
         <h1>{title}</h1><p>{message}</p></body></html>"
    );
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes());
}

fn handle_oauth_request(stream: &mut TcpStream, expected_state: &str) -> Result<String, String> {
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let first_line = req.lines().next().ok_or("Solicitud vacía")?;
    let path = first_line
        .split_whitespace()
        .nth(1)
        .ok_or("Ruta inválida")?;

    if !path.starts_with("/callback") {
        respond_oauth_html(stream, "Gestión Comercios", "Ruta no reconocida.");
        return Err("Callback OAuth inválido.".into());
    }

    let query = path.split('?').nth(1).unwrap_or("");
    if let Some(err) = parse_query_param(query, "error") {
        let desc = parse_query_param(query, "error_description").unwrap_or_default();
        respond_oauth_html(
            stream,
            "No se pudo vincular",
            &format!("{err}. {desc} Volvé a la app e intentá de nuevo."),
        );
        return Err(format!("Mercado Pago rechazó la autorización: {err} {desc}").trim().to_string());
    }

    let code = parse_query_param(query, "code").ok_or("Falta el código de autorización.")?;
    let state = parse_query_param(query, "state").ok_or("Falta el estado OAuth.")?;
    if state != expected_state {
        respond_oauth_html(stream, "Error de seguridad", "El estado no coincide. Intentá de nuevo.");
        return Err("Estado OAuth inválido.".into());
    }

    respond_oauth_html(
        stream,
        "¡Cuenta vinculada!",
        "Podés cerrar esta ventana y volver a Gestión Comercios.",
    );
    Ok(code)
}

fn wait_for_oauth_callback(expected_state: &str, timeout: Duration) -> Result<String, String> {
    let listener = TcpListener::bind(format!("127.0.0.1:{MP_OAUTH_PORT}"))
        .map_err(|e| format!("No se pudo abrir el puerto local {MP_OAUTH_PORT}: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| e.to_string())?;

    let deadline = Instant::now() + timeout;
    loop {
        if Instant::now() > deadline {
            return Err(
                "Tiempo agotado esperando autorización. Volvé a intentar «Conectar con Mercado Pago»."
                    .into(),
            );
        }
        match listener.accept() {
            Ok((mut stream, _)) => match handle_oauth_request(&mut stream, expected_state) {
                Ok(code) => return Ok(code),
                Err(e) => return Err(e),
            },
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

fn exchange_authorization_code(code: &str, code_verifier: &str) -> Result<TokenResponse, String> {
    let (client_id, client_secret) =
        load_mp_app_credentials().ok_or("OAuth de Mercado Pago no configurado en esta versión de la app.")?;

    let client = mp_http_client()?;
    let response = client
        .post(MP_TOKEN_URL)
        .json(&json!({
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": MP_REDIRECT_URI,
            "code_verifier": code_verifier,
        }))
        .send()
        .map_err(|e| format!("Sin conexión con Mercado Pago: {e}"))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .map_err(|e| format!("Respuesta inválida al obtener token: {e}"))?;

    if !status.is_success() {
        let msg = body
            .get("message")
            .or_else(|| body.get("error"))
            .and_then(|v| v.as_str())
            .unwrap_or("No se pudo obtener el token");
        return Err(msg.to_string());
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

    let (client_id, client_secret) =
        load_mp_app_credentials().ok_or("OAuth de Mercado Pago no configurado.")?;

    let client = mp_http_client()?;
    let response = client
        .post(MP_TOKEN_URL)
        .json(&json!({
            "client_id": client_id,
            "client_secret": client_secret,
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
    let (client_id, _) =
        load_mp_app_credentials().ok_or("La conexión automática con Mercado Pago aún no está habilitada en esta instalación.")?;

    let state = Uuid::new_v4().to_string();
    let (code_verifier, code_challenge) = pkce_pair();

    let auth_url = format!(
        "{MP_AUTH_URL}?response_type=code&client_id={}&platform_id=mp&state={}&redirect_uri={}&code_challenge={}&code_challenge_method=S256",
        url_encode(&client_id),
        url_encode(&state),
        url_encode(MP_REDIRECT_URI),
        url_encode(&code_challenge),
    );

    let listener_handle = std::thread::spawn(move || wait_for_oauth_callback(&state, Duration::from_secs(300)));

    app.opener()
        .open_url(&auth_url, None::<&str>)
        .map_err(|e| format!("No se pudo abrir el navegador: {e}"))?;

    let code = listener_handle
        .join()
        .map_err(|_| "Error interno al esperar autorización.".to_string())??;

    let token = exchange_authorization_code(&code, &code_verifier)?;
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
