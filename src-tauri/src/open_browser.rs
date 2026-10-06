/// Abre un https en el navegador por defecto y lo trae al frente.
/// El opener de Tauri en Windows a veces responde OK y la ventana queda detrás de WalQo.
pub fn open_https_in_browser(url: &str) -> Result<(), String> {
    let url = url.trim();
    if !url.starts_with("https://") || url.contains('"') || url.contains('\n') || url.contains('\r')
    {
        return Err("Enlace inválido.".into());
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        // Comillas simples: el & de la URL de Mercado Pago no se parte en otro comando.
        let script = format!("Start-Process '{url}'");
        let status = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("No se pudo abrir el navegador: {e}"))?;
        if status.success() {
            return Ok(());
        }
        std::process::Command::new("explorer.exe")
            .arg(url)
            .spawn()
            .map_err(|e| format!("No se pudo abrir el navegador: {e}"))?;
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("No se pudo abrir el navegador: {e}"))?;
        Ok(())
    }
}
