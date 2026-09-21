//! OAuth Tienda Nube / Nuvemshop (opcional).
//! Si no hay `tn_oauth.json`, el comercio puede pegar token + store_id a mano.

use crate::database::open_exclusive;
use crate::settings_util::{write_setting, write_setting_flag};
use crate::tn_app_credentials::load_tn_app_config;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{mpsc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

const TN_TOKEN_URL: &str = "https://www.tiendanube.com/apps/authorize/token";
const OAUTH_WAIT_SECS: u64 = 300;
const OAUTH_LOCAL_PORT: u16 = 38474;
const OAUTH_LOCAL_CALLBACK_PATH: &str = "/oauth/tn/callback";

#[derive(Debug, Serialize)]
pub struct TnConnectResult {
    pub store_id: String,
    pub store_name: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    token_type: Option<String>,
    #[serde(default)]
    scope: Option<String>,
    /// En TN el store_id llega como `user_id`.
    user_id: serde_json::Value,
}

struct PendingOAuth {
    tx: mpsc::Sender<Result<String, String>>,
}

static PENDING_OAUTH: OnceLock<Mutex<Option<PendingOAuth>>> = OnceLock::new();

fn pending_oauth() -> &'static Mutex<Option<PendingOAuth>> {
    PENDING_OAUTH.get_or_init(|| Mutex::new(None))
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
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

fn deliver_oauth_code(code: &str) -> bool {
    let Ok(mut guard) = pending_oauth().lock() else {
        return false;
    };
    if let Some(pending) = guard.take() {
        let _ = pending.tx.send(Ok(code.to_string()));
        true
    } else {
        false
    }
}

fn deliver_oauth_error(message: String) -> bool {
    let Ok(mut guard) = pending_oauth().lock() else {
        return false;
    };
    if let Some(pending) = guard.take() {
        let _ = pending.tx.send(Err(message));
        true
    } else {
        false
    }
}

fn write_oauth_http_response(stream: &mut TcpStream, body: &str) {
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
}

fn handle_oauth_http_request(stream: &mut TcpStream) -> bool {
    let mut buf = [0u8; 4096];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return false,
    };
    let req = String::from_utf8_lossy(&buf[..n]);
    let first = req.lines().next().unwrap_or("");
    let path_q = first.split_whitespace().nth(1).unwrap_or("");
    let (path, query) = path_q
        .split_once('?')
        .map(|(p, q)| (p, q))
        .unwrap_or((path_q, ""));

    if path != OAUTH_LOCAL_CALLBACK_PATH {
        write_oauth_http_response(stream, "<html><body>OK</body></html>");
        return false;
    }

    if let Some(err) = parse_query_param(query, "error") {
        let desc = parse_query_param(query, "error_description").unwrap_or_default();
        let msg = if desc.is_empty() {
            err
        } else {
            format!("{err}: {desc}")
        };
        let delivered = deliver_oauth_error(msg);
        write_oauth_http_response(
            stream,
            "<html><body><p>No se pudo vincular Tienda Nube. Podés cerrar esta ventana.</p></body></html>",
        );
        return delivered;
    }

    let Some(code) = parse_query_param(query, "code") else {
        write_oauth_http_response(
            stream,
            "<html><body><p>Falta el código de autorización.</p></body></html>",
        );
        return false;
    };

    let delivered = deliver_oauth_code(&code);
    write_oauth_http_response(
        stream,
        "<html><body><p>¡Listo! Volvé a WalQo.</p></body></html>",
    );
    delivered
}

fn oauth_pending_active() -> bool {
    pending_oauth()
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false)
}

fn spawn_oauth_local_callback_server() {
    thread::spawn(|| {
        let listener = match TcpListener::bind(("127.0.0.1", OAUTH_LOCAL_PORT)) {
            Ok(l) => l,
            Err(_) => return,
        };
        let _ = listener.set_nonblocking(true);
        let deadline = Instant::now() + Duration::from_secs(OAUTH_WAIT_SECS + 5);
        while Instant::now() < deadline && oauth_pending_active() {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                    if handle_oauth_http_request(&mut stream) {
                        break;
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(100));
                }
                Err(_) => break,
            }
        }
    });
}

fn user_id_to_store_id(value: &serde_json::Value) -> Result<String, String> {
    if let Some(n) = value.as_u64() {
        return Ok(n.to_string());
    }
    if let Some(n) = value.as_i64() {
        return Ok(n.to_string());
    }
    if let Some(s) = value.as_str() {
        let t = s.trim();
        if !t.is_empty() {
            return Ok(t.to_string());
        }
    }
    Err("Tienda Nube no devolvió el ID de la tienda.".into())
}

fn exchange_authorization_code(code: &str) -> Result<TokenResponse, String> {
    let config = load_tn_app_config()
        .ok_or("OAuth de Tienda Nube no configurado en esta instalación.")?;

    let client = http_client()?;
    let response = client
        .post(TN_TOKEN_URL)
        .header("Content-Type", "application/json")
        .json(&json!({
            "client_id": config.client_id,
            "client_secret": config.client_secret,
            "grant_type": "authorization_code",
            "code": code,
        }))
        .send()
        .map_err(|e| format!("Sin conexión con Tienda Nube: {e}"))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .map_err(|e| format!("Respuesta inválida al obtener token: {e}"))?;

    if !status.is_success() {
        let msg = body
            .get("error_description")
            .or_else(|| body.get("description"))
            .or_else(|| body.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("No se pudo obtener el token de Tienda Nube.");
        return Err(msg.to_string());
    }

    serde_json::from_value(body).map_err(|e| format!("Token OAuth inválido: {e}"))
}

pub fn persist_tn_credentials(
    store_id: &str,
    access_token: &str,
    store_name: Option<&str>,
) -> Result<(), String> {
    let conn = open_exclusive()?;
    write_setting(&conn, "tn_store_id", store_id.trim())?;
    write_setting(&conn, "tn_access_token", access_token.trim())?;
    if let Some(name) = store_name {
        if !name.trim().is_empty() {
            write_setting(&conn, "tn_store_name", name.trim())?;
        }
    }
    write_setting_flag(&conn, "tn_oauth_connected", true)?;
    write_setting_flag(&conn, "tn_enabled", true)?;
    write_setting_flag(&conn, "tn_sync_stock", true)?;
    Ok(())
}

pub fn clear_tn_credentials() -> Result<(), String> {
    let conn = open_exclusive()?;
    write_setting(&conn, "tn_access_token", "")?;
    write_setting(&conn, "tn_store_id", "")?;
    write_setting(&conn, "tn_store_name", "")?;
    write_setting_flag(&conn, "tn_oauth_connected", false)?;
    write_setting_flag(&conn, "tn_enabled", false)?;
    Ok(())
}

pub fn run_tn_oauth_flow(app: &AppHandle) -> Result<TnConnectResult, String> {
    let config = load_tn_app_config().ok_or(
        "La conexión automática con Tienda Nube aún no está habilitada. Usá Store ID + Access Token, o contactá soporte WalQo.",
    )?;

    let (tx, rx) = mpsc::channel();
    {
        let mut guard = pending_oauth()
            .lock()
            .map_err(|_| "Error interno al iniciar OAuth.".to_string())?;
        if guard.is_some() {
            return Err("Ya hay una conexión con Tienda Nube en curso.".into());
        }
        *guard = Some(PendingOAuth { tx });
    }

    // URL de autorización estándar TN (redirect URI se configura en el panel de la app).
    let auth_url = format!(
        "https://www.tiendanube.com/apps/{}/authorize",
        url_encode(&config.client_id)
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
                "Tiempo agotado. Dejá WalQo abierta, autorizá en el navegador y volvé a intentar."
                    .into(),
            );
        }
    };

    let token = exchange_authorization_code(&code)?;
    let store_id = user_id_to_store_id(&token.user_id)?;
    persist_tn_credentials(&store_id, &token.access_token, None)?;

    let store_name = crate::tiendanube::fetch_store_name(&store_id, &token.access_token)
        .unwrap_or_else(|_| format!("Tienda {store_id}"));
    let _ = persist_tn_credentials(&store_id, &token.access_token, Some(&store_name));

    let _ = app.emit("tn-oauth-connected", ());

    Ok(TnConnectResult {
        store_id,
        store_name,
    })
}

#[tauri::command]
pub async fn connect_tn_oauth(app: AppHandle) -> Result<TnConnectResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_tn_oauth_flow(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn disconnect_tn() -> Result<(), String> {
    clear_tn_credentials()
}

#[tauri::command]
pub fn save_tn_manual_credentials(
    store_id: String,
    access_token: String,
) -> Result<TnConnectResult, String> {
    let store_id = store_id.trim().to_string();
    let access_token = access_token.trim().to_string();
    if store_id.is_empty() || access_token.is_empty() {
        return Err("Completá el Store ID y el Access Token.".into());
    }
    let store_name = crate::tiendanube::fetch_store_name(&store_id, &access_token)
        .unwrap_or_else(|_| format!("Tienda {store_id}"));
    persist_tn_credentials(&store_id, &access_token, Some(&store_name))?;
    Ok(TnConnectResult {
        store_id,
        store_name,
    })
}
