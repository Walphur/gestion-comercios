use crate::license::{
    activate_license, get_bi_auth, get_license_status, get_machine_id, push_owner_portal_snapshot,
    push_workshop_portal_snapshot,
    refresh_license_online, skip_trial_offer, start_trial_license, BiAuthResponse, LicenseStatus,
};

#[tauri::command]
pub fn license_get_status() -> LicenseStatus {
    get_license_status()
}

#[tauri::command]
pub fn license_get_machine_id() -> String {
    get_machine_id()
}

#[tauri::command]
pub fn license_activate(key: String) -> LicenseStatus {
    activate_license(key)
}

#[tauri::command]
pub fn license_refresh() -> LicenseStatus {
    refresh_license_online()
}

#[tauri::command]
pub fn license_start_trial() -> LicenseStatus {
    start_trial_license()
}

#[tauri::command]
pub fn license_skip_trial_offer() -> LicenseStatus {
    skip_trial_offer()
}

#[tauri::command]
pub fn license_get_bi_auth() -> Result<BiAuthResponse, String> {
    get_bi_auth()
}

#[tauri::command]
pub fn owner_portal_push(snapshot: serde_json::Value) -> Result<(), String> {
    push_owner_portal_snapshot(snapshot)
}

#[tauri::command]
pub fn workshop_portal_push(snapshot: serde_json::Value) -> Result<(), String> {
    push_workshop_portal_snapshot(snapshot)
}
