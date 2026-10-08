//! Abre los puertos de la sincronización en el firewall de Windows.
//! Sin eso la principal anuncia y la caja no la ve, aunque estén en el mismo Wi-Fi.

#[cfg(windows)]
use std::process::Command;

#[cfg(windows)]
use base64::Engine;

/// TCP de datos + UDP de búsqueda. Si faltan las reglas, pide permiso de administrador una vez.
pub fn ensure_lan_firewall(tcp_port: u16, prompt: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        ensure_windows(tcp_port, prompt)
    }
    #[cfg(not(windows))]
    {
        let _ = (tcp_port, prompt);
        Ok(())
    }
}

#[cfg(windows)]
fn ensure_windows(tcp_port: u16, prompt: bool) -> Result<(), String> {
    let udp = super::discovery::DISCOVERY_PORT;
    if rule_present("WalQo sincronizacion LAN") && rule_present("WalQo busqueda LAN") {
        return Ok(());
    }
    let aviso = "Windows puede estar bloqueando a las otras PCs. Apretá «Empezar a compartir» o «Conectar» y, cuando Windows pida permiso de administrador, apretá Sí.";
    if !prompt {
        return Err(aviso.into());
    }
    let script = format!(
        r#"$ErrorActionPreference = 'Continue'
netsh advfirewall firewall delete rule name="WalQo sincronizacion LAN" | Out-Null
netsh advfirewall firewall delete rule name="WalQo busqueda LAN" | Out-Null
netsh advfirewall firewall add rule name="WalQo sincronizacion LAN" dir=in action=allow protocol=TCP localport={tcp_port} profile=any
if ($LASTEXITCODE -ne 0) {{ exit $LASTEXITCODE }}
netsh advfirewall firewall add rule name="WalQo busqueda LAN" dir=in action=allow protocol=UDP localport={udp} profile=any
exit $LASTEXITCODE
"#
    );
    run_elevated(&script)?;
    if rule_present("WalQo sincronizacion LAN") && rule_present("WalQo busqueda LAN") {
        return Ok(());
    }
    Err(aviso.into())
}

#[cfg(windows)]
fn rule_present(name: &str) -> bool {
    Command::new("netsh")
        .args([
            "advfirewall",
            "firewall",
            "show",
            "rule",
            &format!("name={name}"),
        ])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(windows)]
fn run_elevated(script: &str) -> Result<(), String> {
    let utf16: Vec<u8> = script
        .encode_utf16()
        .flat_map(|u| u.to_le_bytes())
        .collect();
    let enc = base64::engine::general_purpose::STANDARD.encode(utf16);
    let launcher = format!(
        "Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','{enc}'"
    );
    let out = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &launcher,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    let detail = format!("{stderr} {stdout}").trim().to_string();
    if detail.is_empty() {
        Err("no se pudo abrir el firewall".into())
    } else {
        Err(detail)
    }
}
