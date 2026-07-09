use crate::whatsapp_turnos::{
    get_whatsapp_turnos_config, get_whatsapp_turnos_status, register_whatsapp_turnos,
    run_whatsapp_turnos_sync_once, save_whatsapp_turnos_config, WhatsAppTurnosConfig,
    WhatsAppTurnosStatus,
};

#[tauri::command]
pub fn whatsapp_turnos_get_config() -> Result<WhatsAppTurnosConfig, String> {
    get_whatsapp_turnos_config()
}

#[tauri::command]
pub fn whatsapp_turnos_save_config(
    enabled: bool,
    phone_number_id: String,
    access_token: Option<String>,
    reminder_hours: u32,
    template_name: String,
    template_lang: String,
) -> Result<WhatsAppTurnosConfig, String> {
    save_whatsapp_turnos_config(
        enabled,
        phone_number_id,
        access_token,
        reminder_hours,
        template_name,
        template_lang,
    )
}

#[tauri::command]
pub fn whatsapp_turnos_register(business_name: String) -> Result<WhatsAppTurnosConfig, String> {
    register_whatsapp_turnos(business_name)
}

#[tauri::command]
pub fn whatsapp_turnos_get_status() -> WhatsAppTurnosStatus {
    get_whatsapp_turnos_status()
}

#[tauri::command]
pub fn whatsapp_turnos_sync_now() -> Result<WhatsAppTurnosStatus, String> {
    run_whatsapp_turnos_sync_once()
}
