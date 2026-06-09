use serde::Deserialize;
use std::path::{Path, PathBuf};

/// URL HTTPS pública registrada en Mercado Pago Developers (redirect OAuth).
pub const DEFAULT_MP_REDIRECT_URI: &str =
    "https://walphur.github.io/gestion-comercios/oauth/callback.html";

const APP_DATA_DIR: &str = "com.gestioncomercios.app";

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

fn is_placeholder_credential(value: &str) -> bool {
    let v = value.trim();
    v.is_empty()
        || v.contains("TU_APP_ID")
        || v.contains("TU_CLIENT_SECRET")
        || v.eq_ignore_ascii_case("TEST")
}

fn parse_creds_json(text: &str) -> Option<MpAppConfig> {
    let creds: FileCreds = serde_json::from_str(text).ok()?;
    if is_placeholder_credential(&creds.client_id) || is_placeholder_credential(&creds.client_secret) {
        return None;
    }
    Some(MpAppConfig {
        client_id: creds.client_id.trim().to_string(),
        client_secret: creds.client_secret.trim().to_string(),
        redirect_uri: creds
            .redirect_uri
            .filter(|u| !u.trim().is_empty())
            .map(|u| u.trim().to_string())
            .unwrap_or_else(|| DEFAULT_MP_REDIRECT_URI.to_string()),
    })
}

fn load_from_file(path: &Path) -> Option<MpAppConfig> {
    let text = std::fs::read_to_string(path).ok()?;
    parse_creds_json(&text)
}

fn app_data_mp_oauth_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(base) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        let root = base.join(APP_DATA_DIR);
        paths.push(root.join("mp_oauth.json"));
        paths.push(root.join("credentials/mp_oauth.json"));
    }
    if let Some(base) = std::env::var_os("APPDATA").map(PathBuf::from) {
        let root = base.join(APP_DATA_DIR);
        paths.push(root.join("mp_oauth.json"));
    }
    paths
}

fn runtime_credential_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // Proyecto / build local primero (evita AppData viejo con placeholders).
    paths.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("credentials/mp_oauth.json"),
    );

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            paths.push(dir.join("mp_oauth.json"));
            paths.push(dir.join("credentials/mp_oauth.json"));
        }
    }

    paths.extend(app_data_mp_oauth_paths());
    paths
}

/// Copia credenciales del proyecto a AppData (útil al desarrollar en esta PC).
pub fn sync_mp_oauth_to_app_storage() {
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("credentials/mp_oauth.json");
    if !source.is_file() {
        return;
    }
    let Ok(text) = std::fs::read_to_string(&source) else {
        return;
    };
    if parse_creds_json(&text).is_none() {
        return;
    }
    let Some(dest) = app_data_mp_oauth_paths().into_iter().next() else {
        return;
    };
    if let Some(parent) = dest.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::copy(&source, &dest);
}

/// Credenciales de la app integradora (Gestión Comercios) en Mercado Pago Developers.
/// El comercio nunca las ve: van embebidas al compilar el instalador o en AppData del dev.
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
        if let Some(creds) = parse_creds_json(include_str!(concat!(
            env!("OUT_DIR"),
            "/mp_oauth_embedded.json"
        ))) {
            return Some(creds);
        }
    }

    for path in runtime_credential_paths() {
        if let Some(creds) = load_from_file(&path) {
            return Some(creds);
        }
    }

    None
}

pub fn mp_oauth_available() -> bool {
    load_mp_app_config().is_some()
}
