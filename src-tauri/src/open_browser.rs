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
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .creation_flags(CREATE_NO_WINDOW)
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
