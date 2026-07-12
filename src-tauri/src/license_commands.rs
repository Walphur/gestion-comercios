use crate::license::{
    activate_license, get_license_status, get_machine_id, refresh_license_online,
    skip_trial_offer, start_trial_license, LicenseStatus,
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
