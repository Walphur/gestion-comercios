use std::path::PathBuf;
use std::sync::OnceLock;

/// URL HTTPS pública registrada en Mercado Pago Developers (redirect OAuth).
pub const DEFAULT_MP_REDIRECT_URI: &str =
    "https://walphur.github.io/gestion-comercios/oauth/callback.html";

/// App de WalQo en Mercado Pago Developers. Es público (viaja en la URL de autorización);
/// la clave secreta vive en el servidor de licencias, que hace el intercambio de tokens.
const DEFAULT_MP_CLIENT_ID: &str = "6376098001748609";

const APP_DATA_DIR: &str = "com.gestioncomercios.app";

static RESOURCE_DIR: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, Clone)]
pub struct MpAppConfig {
    pub client_id: String,
    pub redirect_uri: String,
}

/// Registra la carpeta de recursos del instalador (llamar desde `setup` de Tauri).
pub fn register_install_resource_dir(path: PathBuf) {
    let _ = RESOURCE_DIR.set(path);
}

fn non_empty(value: Option<&'static str>) -> Option<&'static str> {
    value.map(str::trim).filter(|v| !v.is_empty())
}

pub fn load_mp_app_config() -> MpAppConfig {
    MpAppConfig {
        client_id: non_empty(option_env!("MP_CLIENT_ID"))
            .unwrap_or(DEFAULT_MP_CLIENT_ID)
            .to_string(),
        redirect_uri: non_empty(option_env!("MP_REDIRECT_URI"))
            .unwrap_or(DEFAULT_MP_REDIRECT_URI)
            .to_string(),
    }
}

pub fn mp_oauth_available() -> bool {
    true
}

/// Las versiones anteriores instalaban un `mp_oauth.json` con la clave secreta de la app
/// y lo copiaban a AppData. Ya no se usa: se borra donde haya quedado.
pub fn remove_legacy_mp_oauth_files() {
    let mut paths = Vec::new();
    if let Some(dir) = RESOURCE_DIR.get() {
        paths.push(dir.join("mp_oauth.json"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            paths.push(dir.join("mp_oauth.json"));
            paths.push(dir.join("credentials/mp_oauth.json"));
            paths.push(dir.join("resources/mp_oauth.json"));
            paths.push(dir.join("_up_/resources/mp_oauth.json"));
        }
    }
    for var in ["LOCALAPPDATA", "APPDATA"] {
        if let Some(base) = std::env::var_os(var).map(PathBuf::from) {
            let root = base.join(APP_DATA_DIR);
            paths.push(root.join("mp_oauth.json"));
            paths.push(root.join("credentials/mp_oauth.json"));
        }
    }
    for path in paths {
        let _ = std::fs::remove_file(path);
    }
}
