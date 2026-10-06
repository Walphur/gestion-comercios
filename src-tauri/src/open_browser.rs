/// Abre un enlace en la sesión del usuario.
///
/// WalQo se instala para toda la PC. Si el proceso abre el navegador él mismo
/// (PowerShell, rundll32 o el opener de Tauri), Windows lo lanza oculto y parece
/// que no pasó nada, aunque el comando haya respondido OK.
/// `explorer.exe` corre como el usuario que está en la pantalla y muestra la ventana.
pub fn open_url_for_user(url: &str) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() || url.contains('"') || url.contains('\n') || url.contains('\r') {
        return Err("Enlace inválido.".into());
    }
    let https = url.starts_with("https://");
    let whatsapp = url.starts_with("whatsapp://");
    if !https && !whatsapp {
        return Err("Enlace inválido.".into());
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("explorer.exe");
        cmd.raw_arg(format!("\"{url}\""));
        cmd.spawn()
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

pub fn open_https_in_browser(url: &str) -> Result<(), String> {
    let url = url.trim();
    if !url.starts_with("https://") {
        return Err("Enlace inválido.".into());
    }
    open_url_for_user(url)
}
