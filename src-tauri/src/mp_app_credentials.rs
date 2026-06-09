use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct FileCreds {
    client_id: String,
    client_secret: String,
}

fn parse_creds_json(text: &str) -> Option<(String, String)> {
    let creds: FileCreds = serde_json::from_str(text).ok()?;
    if creds.client_id.trim().is_empty() || creds.client_secret.trim().is_empty() {
        return None;
    }
    Some((
        creds.client_id.trim().to_string(),
        creds.client_secret.trim().to_string(),
    ))
}

/// Credenciales de la app integradora (Gestión Comercios) en Mercado Pago Developers.
/// El comercio nunca las ve: van embebidas al compilar el instalador.
pub fn load_mp_app_credentials() -> Option<(String, String)> {
    if let (Some(id), Some(secret)) = (
        option_env!("MP_CLIENT_ID"),
        option_env!("MP_CLIENT_SECRET"),
    ) {
        if !id.is_empty() && !secret.is_empty() {
            return Some((id.to_string(), secret.to_string()));
        }
    }

    #[cfg(mp_oauth_embedded)]
    {
        if let Some(creds) = parse_creds_json(include_str!(concat!(
            env!("OUT_DIR"),
            "/mp_oauth_embedded.json"
        ))) {
            return Some(creds);
        }
    }

    // Solo desarrollo local (no existe en el .exe instalado del cliente).
    #[cfg(debug_assertions)]
    {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("credentials/mp_oauth.json");
        if let Ok(text) = std::fs::read_to_string(path) {
            if let Some(creds) = parse_creds_json(&text) {
                return Some(creds);
            }
        }
    }

    None
}

pub fn mp_oauth_available() -> bool {
    load_mp_app_credentials().is_some()
}
