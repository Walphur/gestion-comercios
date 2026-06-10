use crate::license::{activate_license, get_license_status, get_machine_id, refresh_license_online, LicenseStatus};

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
