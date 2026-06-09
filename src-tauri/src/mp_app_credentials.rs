use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct FileCreds {
    client_id: String,
    client_secret: String,
}

/// Credenciales de la app integradora (Gestión Comercios) en Mercado Pago Developers.
/// El comercio no las ve: solo autoriza con OAuth.
pub fn load_mp_app_credentials() -> Option<(String, String)> {
    if let (Some(id), Some(secret)) = (
        option_env!("MP_CLIENT_ID"),
        option_env!("MP_CLIENT_SECRET"),
    ) {
        if !id.is_empty() && !secret.is_empty() {
            return Some((id.to_string(), secret.to_string()));
        }
    }

    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("credentials/mp_oauth.json");
    if let Ok(text) = std::fs::read_to_string(&path) {
        if let Ok(creds) = serde_json::from_str::<FileCreds>(&text) {
            if !creds.client_id.trim().is_empty() && !creds.client_secret.trim().is_empty() {
                return Some((creds.client_id.trim().to_string(), creds.client_secret.trim().to_string()));
            }
        }
    }

    None
}

pub fn mp_oauth_available() -> bool {
    load_mp_app_credentials().is_some()
}
