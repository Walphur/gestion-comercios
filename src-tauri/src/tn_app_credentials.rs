use std::path::PathBuf;
use std::sync::OnceLock;

/// Redirect HTTPS registrado en el panel de partners de Tienda Nube.
pub const DEFAULT_TN_REDIRECT_URI: &str =
    "https://walphur.github.io/gestion-comercios/oauth/tn-callback.html";

/// App de WalQo en partners.tiendanube.com. Es público (va en la URL de instalación);
/// la clave secreta vive en el servidor de licencias, que hace el intercambio de tokens.
const DEFAULT_TN_CLIENT_ID: &str = "42955";

const APP_DATA_DIR: &str = "com.gestioncomercios.app";

static RESOURCE_DIR: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, Clone)]
pub struct TnAppConfig {
    pub client_id: String,
    pub redirect_uri: String,
}

pub fn register_install_resource_dir(path: PathBuf) {
    let _ = RESOURCE_DIR.set(path);
}

fn non_empty(value: Option<&'static str>) -> Option<&'static str> {
    value.map(str::trim).filter(|v| !v.is_empty())
}

pub fn load_tn_app_config() -> TnAppConfig {
    TnAppConfig {
        client_id: non_empty(option_env!("TN_CLIENT_ID"))
            .unwrap_or(DEFAULT_TN_CLIENT_ID)
            .to_string(),
        redirect_uri: non_empty(option_env!("TN_REDIRECT_URI"))
            .unwrap_or(DEFAULT_TN_REDIRECT_URI)
            .to_string(),
    }
}

pub fn tn_oauth_available() -> bool {
    true
}

/// Las versiones anteriores instalaban un `tn_oauth.json` con la clave secreta de la app
/// y lo copiaban a AppData. Ya no se usa: se borra donde haya quedado.
pub fn remove_legacy_tn_oauth_files() {
    let mut paths = Vec::new();
    if let Some(dir) = RESOURCE_DIR.get() {
        paths.push(dir.join("tn_oauth.json"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            paths.push(dir.join("tn_oauth.json"));
            paths.push(dir.join("credentials/tn_oauth.json"));
            paths.push(dir.join("resources/tn_oauth.json"));
            paths.push(dir.join("_up_/resources/tn_oauth.json"));
        }
    }
    for var in ["LOCALAPPDATA", "APPDATA"] {
        if let Some(base) = std::env::var_os(var).map(PathBuf::from) {
            let root = base.join(APP_DATA_DIR);
            paths.push(root.join("tn_oauth.json"));
            paths.push(root.join("credentials/tn_oauth.json"));
        }
    }
    for path in paths {
        let _ = std::fs::remove_file(path);
    }
}
