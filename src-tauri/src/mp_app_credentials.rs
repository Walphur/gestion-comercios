use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// URL HTTPS pública registrada en Mercado Pago Developers (redirect OAuth).
pub const DEFAULT_MP_REDIRECT_URI: &str =
    "https://walphur.github.io/gestion-comercios/oauth/callback.html";

const APP_DATA_DIR: &str = "com.gestioncomercios.app";

static RESOURCE_DIR: OnceLock<PathBuf> = OnceLock::new();

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

/// Registra la carpeta de recursos del instalador (llamar desde `setup` de Tauri).
pub fn register_install_resource_dir(path: PathBuf) {
    let _ = RESOURCE_DIR.set(path);
}

fn strip_json_bom(text: &str) -> &str {
    text.strip_prefix('\u{feff}').unwrap_or(text)
}

fn is_placeholder_credential(value: &str) -> bool {
    let v = value.trim();
    v.is_empty()
        || v.contains("TU_APP_ID")
        || v.contains("TU_CLIENT_SECRET")
        || v.eq_ignore_ascii_case("TEST")
}

fn parse_creds_json(text: &str) -> Option<MpAppConfig> {
    let text = strip_json_bom(text.trim());
    if text.is_empty() || text == "{}" {
        return None;
    }
    let creds: FileCreds = serde_json::from_str(text).ok()?;
    if is_placeholder_credential(&creds.client_id)
        || is_placeholder_credential(&creds.client_secret)
    {
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

    if let Some(dir) = RESOURCE_DIR.get() {
        paths.push(dir.join("mp_oauth.json"));
    }

    paths.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("credentials/mp_oauth.json"));

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            paths.push(dir.join("mp_oauth.json"));
            paths.push(dir.join("credentials/mp_oauth.json"));
            paths.push(dir.join("resources/mp_oauth.json"));
            // NSIS / Tauri updater layout
            paths.push(dir.join("_up_/resources/mp_oauth.json"));
        }
    }

    paths.extend(app_data_mp_oauth_paths());
    paths
}

fn first_valid_credential_file() -> Option<PathBuf> {
    for path in runtime_credential_paths() {
        if load_from_file(&path).is_some() {
            return Some(path);
        }
    }
    None
}

fn load_embedded_creds() -> Option<MpAppConfig> {
    #[cfg(mp_oauth_embedded)]
    {
        if let Some(creds) = parse_creds_json(include_str!(concat!(
            env!("OUT_DIR"),
            "/mp_oauth_embedded.json"
        ))) {
            return Some(creds);
        }
    }
    None
}

/// Copia credenciales embebidas o del instalador a AppData si aún no están.
pub fn sync_mp_oauth_to_app_storage() {
    if load_mp_app_config().is_none() {
        return;
    }
    let Some(dest) = app_data_mp_oauth_paths().into_iter().next() else {
        return;
    };
    if load_from_file(&dest).is_some() {
        return;
    }
    let Some(source) = first_valid_credential_file() else {
        return;
    };
    if let Some(parent) = dest.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::copy(&source, &dest);
}

/// Credenciales de la app integradora (Gestión Comercios) en Mercado Pago Developers.
pub fn load_mp_app_config() -> Option<MpAppConfig> {
    if let (Some(id), Some(secret)) = (option_env!("MP_CLIENT_ID"), option_env!("MP_CLIENT_SECRET"))
    {
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

    if let Some(creds) = load_embedded_creds() {
        return Some(creds);
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
