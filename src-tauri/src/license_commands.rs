use crate::license::{
    activate_license, get_bi_auth, get_license_status, get_machine_id, push_menu_portal_snapshot,
    push_owner_portal_snapshot, push_workshop_portal_snapshot, recover_admin_pin,
    refresh_license_online, skip_trial_offer, start_trial_license, BiAuthResponse, LicenseStatus,
};

/// `reqwest::blocking` entra en pánico dentro de un hilo del runtime async; todo lo que
/// pueda salir a la red tiene que correr acá.
pub(crate) async fn run_blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("No se pudo completar la operación: {e}"))
}

#[tauri::command]
pub async fn license_get_status() -> Result<LicenseStatus, String> {
    run_blocking(get_license_status).await
}

#[tauri::command(async)]
pub fn license_get_machine_id() -> String {
    get_machine_id()
}

#[tauri::command]
pub async fn license_activate(key: String) -> Result<LicenseStatus, String> {
    run_blocking(move || activate_license(key)).await
}

#[tauri::command]
pub async fn license_refresh() -> Result<LicenseStatus, String> {
    run_blocking(refresh_license_online).await
}

#[tauri::command]
pub async fn license_start_trial() -> Result<LicenseStatus, String> {
    run_blocking(start_trial_license).await
}

#[tauri::command]
pub async fn license_skip_trial_offer() -> Result<LicenseStatus, String> {
    run_blocking(skip_trial_offer).await
}

#[tauri::command]
pub async fn license_get_bi_auth() -> Result<BiAuthResponse, String> {
    run_blocking(get_bi_auth).await?
}

#[tauri::command]
pub async fn owner_portal_push(snapshot: serde_json::Value) -> Result<(), String> {
    run_blocking(move || push_owner_portal_snapshot(snapshot)).await?
}

#[tauri::command]
pub async fn workshop_portal_push(snapshot: serde_json::Value) -> Result<(), String> {
    run_blocking(move || push_workshop_portal_snapshot(snapshot)).await?
}

#[tauri::command]
pub async fn menu_portal_push(snapshot: serde_json::Value) -> Result<(), String> {
    run_blocking(move || push_menu_portal_snapshot(snapshot)).await?
}

#[tauri::command]
pub async fn menu_portal_orders(
    action: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::license::menu_portal_orders_request(&action, payload)
    })
    .await
    .map_err(|e| format!("No se pudo consultar los pedidos: {e}"))?
}

#[tauri::command]
pub async fn license_recover_admin_pin(license_key: String, new_pin: String) -> Result<(), String> {
    run_blocking(move || recover_admin_pin(license_key, new_pin)).await?
}
