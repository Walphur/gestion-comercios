use serde::Deserialize;

/// URL HTTPS pública registrada en Mercado Pago Developers (redirect OAuth).
pub const DEFAULT_MP_REDIRECT_URI: &str =
    "https://walphur.github.io/gestion-comercios/oauth/callback.html";

#[derive(Debug, Clone)]
pub struct MpAppConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

#[derive(Debug, Deserialize)]
struct FileCreds {
    client_id: String,
    client_secret: String,
    #[serde(default)]
    redirect_uri: Option<String>,
}

fn parse_creds_json(text: &str) -> Option<MpAppConfig> {
    let creds: FileCreds = serde_json::from_str(text).ok()?;
    if creds.client_id.trim().is_empty() || creds.client_secret.trim().is_empty() {
        return None;
    }
    Some(MpAppConfig {
        client_id: creds.client_id.trim().to_string(),
        client_secret: creds.client_secret.trim().to_string(),
        redirect_uri: creds
            .redirect_uri
            .filter(|u| !u.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_MP_REDIRECT_URI.to_string()),
    })
}

fn load_from_json_text(text: &str) -> Option<MpAppConfig> {
    parse_creds_json(text)
}

/// Credenciales de la app integradora (Gestión Comercios) en Mercado Pago Developers.
/// El comercio nunca las ve: van embebidas al compilar el instalador.
pub fn load_mp_app_config() -> Option<MpAppConfig> {
    if let (Some(id), Some(secret)) = (
        option_env!("MP_CLIENT_ID"),
        option_env!("MP_CLIENT_SECRET"),
    ) {
        if !id.is_empty() && !secret.is_empty() {
            let redirect = option_env!("MP_REDIRECT_URI")
                .unwrap_or(DEFAULT_MP_REDIRECT_URI)
                .to_string();
            return Some(MpAppConfig {
                client_id: id.to_string(),
                client_secret: secret.to_string(),
                redirect_uri: redirect,
            });
        }
    }

    #[cfg(mp_oauth_embedded)]
    {
        if let Some(creds) = load_from_json_text(include_str!(concat!(
            env!("OUT_DIR"),
            "/mp_oauth_embedded.json"
        ))) {
            return Some(creds);
        }
    }

    #[cfg(debug_assertions)]
    {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("credentials/mp_oauth.json");
        if let Ok(text) = std::fs::read_to_string(path) {
            if let Some(creds) = load_from_json_text(&text) {
                return Some(creds);
            }
        }
    }

    None
}

pub fn load_mp_app_credentials() -> Option<(String, String)> {
    load_mp_app_config().map(|c| (c.client_id, c.client_secret))
}

pub fn mp_oauth_available() -> bool {
    load_mp_app_config().is_some()
}
