//! Actualizaciones por licencia: la Permanente lee un latest.json fijo (release `permanente`),
//! el resto el de siempre (tauri.conf.json → releases/latest).

use serde::Serialize;
use tauri::{AppHandle, Url};
use tauri_plugin_updater::{Updater, UpdaterExt};

/// Copia del latest.json de la versión a la que llega la Permanente (hoy v1.3.10), con sus firmas.
/// Para moverla, subir otro latest.json a ese mismo release: no hace falta otra versión de la app.
pub const PERMANENT_UPDATE_ENDPOINT: &str =
    "https://github.com/Walphur/gestion-comercios/releases/download/permanente/latest.json";

#[derive(Serialize)]
pub struct UpdatePeek {
    pub version: String,
    pub current_version: String,
    /// true si es el canal fijo de la licencia Permanente.
    pub pinned: bool,
}

#[derive(Serialize)]
pub struct UpdateCheck {
    pub update: Option<UpdatePeek>,
    pub pinned: bool,
}

async fn permanent_license() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        crate::license::is_permanent_plan(&crate::license::get_license_status())
    })
    .await
    .unwrap_or(false)
}

async fn channel_updater(app: &AppHandle) -> Result<(Updater, bool), String> {
    let pinned = permanent_license().await;
    let mut builder = app.updater_builder();
    if pinned {
        let url = Url::parse(PERMANENT_UPDATE_ENDPOINT).map_err(|e| e.to_string())?;
        builder = builder.endpoints(vec![url]).map_err(|e| e.to_string())?;
    }
    let updater = builder.build().map_err(|e| e.to_string())?;
    Ok((updater, pinned))
}

/// Solo mira si hay una versión para esta licencia (sin descargar).
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateCheck, String> {
    let (updater, pinned) = channel_updater(&app).await?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    Ok(UpdateCheck {
        update: update.map(|u| UpdatePeek {
            version: u.version.clone(),
            current_version: u.current_version.clone(),
            pinned,
        }),
        pinned,
    })
}

/// Descarga e instala la versión de esta licencia. Devuelve la versión instalada (None si no había).
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<Option<String>, String> {
    let (updater, _) = channel_updater(&app).await?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let version = update.version.clone();
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    Ok(Some(version))
}
