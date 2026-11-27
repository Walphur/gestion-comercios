//! Actualizaciones: suscripción y prueba usan releases/latest.
//! Permanente (pago único) no recibe versiones nuevas: update_check / update_install
//! no ofrecen ni instalan nada. Los límites del plan siguen en planEntitlements / license.rs.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::license::{get_license_status, is_permanent_plan};

#[derive(Serialize)]
pub struct UpdatePeek {
    pub version: String,
    pub current_version: String,
    /// true = canal/plan sin actualizaciones (Permanente).
    pub pinned: bool,
}

#[derive(Serialize)]
pub struct UpdateCheck {
    pub update: Option<UpdatePeek>,
    pub pinned: bool,
}

fn permanente_blocks_updates() -> bool {
    is_permanent_plan(&get_license_status())
}

/// Solo mira si hay una versión nueva (sin descargar).
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateCheck, String> {
    if permanente_blocks_updates() {
        return Ok(UpdateCheck {
            update: None,
            pinned: true,
        });
    }
    let updater = app.updater_builder().build().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    Ok(UpdateCheck {
        update: update.map(|u| UpdatePeek {
            version: u.version.clone(),
            current_version: u.current_version.clone(),
            pinned: false,
        }),
        pinned: false,
    })
}

/// Descarga e instala la versión nueva. Devuelve la versión instalada (None si no había).
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<Option<String>, String> {
    if permanente_blocks_updates() {
        return Ok(None);
    }
    let updater = app.updater_builder().build().map_err(|e| e.to_string())?;
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
