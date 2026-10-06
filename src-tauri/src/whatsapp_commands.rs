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

#[tauri::command]
pub fn open_https_link(url: String) -> Result<(), String> {
    crate::open_browser::open_https_in_browser(url.trim())
}

/// Abre WhatsApp (app o navegador) al frente. `start` de Windows se come el `&` del enlace.
#[tauri::command]
pub fn open_whatsapp_link(url: String) -> Result<(), String> {
    let url = url.trim();
    let allowed = url.starts_with("whatsapp://send")
        || url.starts_with("https://wa.me/")
        || url.starts_with("https://api.whatsapp.com/")
        || url.starts_with("https://web.whatsapp.com/");
    if !allowed || url.contains('"') || url.contains('\n') || url.contains('\r') {
        return Err("Enlace de WhatsApp inválido.".into());
    }

    #[cfg(windows)]
    {
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map_err(|e| format!("No se pudo abrir WhatsApp: {e}"))?;
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("No se pudo abrir WhatsApp: {e}"))?;
        Ok(())
    }
}
