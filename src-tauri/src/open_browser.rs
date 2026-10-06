/// Abre un enlace en el navegador que el usuario está viendo.
///
/// El intento anterior llamaba a `explorer.exe` sin espacio antes de la URL
/// (`explorer.exe"https://..."`). Windows igual arrancaba el Explorador, respondía OK,
/// y no le pasaba el enlace. Por eso pegarlo a mano funcionaba y solo no se abría.
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
        // `start` es el que usa Windows para el navegador por defecto y deja la ventana adelante.
        // ShellExecute queda de respaldo si cmd no arranca.
        if start_via_cmd(url).is_ok() {
            return Ok(());
        }
        return shell_execute_open(url);
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

#[cfg(windows)]
fn shell_execute_open(url: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: *mut core::ffi::c_void,
            verb: *const u16,
            file: *const u16,
            params: *const u16,
            dir: *const u16,
            show: i32,
        ) -> isize;
    }

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    let verb = wide("open");
    let file = wide(url);
    // SW_SHOWNORMAL = 1. El & de la URL no pasa por cmd, así que no se corta.
    let code = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        )
    };
    if code <= 32 {
        Err(format!("Windows no abrió el enlace (código {code})."))
    } else {
        Ok(())
    }
}

#[cfg(windows)]
fn start_via_cmd(url: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // raw_arg no agrega el espacio: hay que ponerlo. Las comillas evitan que cmd corte en cada &.
    let mut cmd = std::process::Command::new("cmd.exe");
    cmd.raw_arg(format!(" /c start \"\" \"{url}\""));
    cmd.spawn()
        .map_err(|e| format!("No se pudo abrir el navegador: {e}"))?;
    Ok(())
}
