use std::net::{Ipv4Addr, SocketAddr, UdpSocket};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use super::errors::{LanResult, LanSyncError};

pub const DISCOVERY_PORT: u16 = 48766;
pub const DISCOVERY_PREFIX: &str = "WALTECH_LAN|v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoverResult {
    pub host: String,
    pub port: u16,
    pub device_id: String,
    pub name: String,
}

/// Anuncio periódico UDP (servidor). Cancela cuando `stop` es true.
pub fn announce_loop(
    tcp_port: u16,
    device_id: String,
    name: String,
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
) {
    use std::sync::atomic::Ordering;
    let msg = format!("{DISCOVERY_PREFIX}|{tcp_port}|{device_id}|{name}");
    let payload = msg.into_bytes();

    while !stop.load(Ordering::SeqCst) {
        if let Ok(sock) = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)) {
            let _ = sock.set_broadcast(true);
            let _ = sock.send_to(&payload, (Ipv4Addr::BROADCAST, DISCOVERY_PORT));
        }
        for _ in 0..20 {
            if stop.load(Ordering::SeqCst) {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
}

/// Escucha anuncios por `timeout` y deduplica por device_id.
pub fn discover(timeout: Duration) -> LanResult<Vec<DiscoverResult>> {
    let sock = UdpSocket::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, DISCOVERY_PORT)))
        .map_err(|e| LanSyncError::Network(format!("UDP bind {DISCOVERY_PORT}: {e}")))?;
    sock.set_read_timeout(Some(Duration::from_millis(250)))
        .map_err(LanSyncError::from)?;
    sock.set_broadcast(true).map_err(LanSyncError::from)?;

    let deadline = Instant::now() + timeout;
    let mut found: Vec<DiscoverResult> = Vec::new();

    let mut buf = [0u8; 1024];
    while Instant::now() < deadline {
        match sock.recv_from(&mut buf) {
            Ok((n, addr)) => {
                if let Some(mut d) = parse_announce(&buf[..n]) {
                    if d.host.is_empty() || d.host == "0.0.0.0" {
                        d.host = addr.ip().to_string();
                    }
                    if !found.iter().any(|x| x.device_id == d.device_id) {
                        found.push(d);
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock
                || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => return Err(LanSyncError::from(e)),
        }
    }
    Ok(found)
}

fn parse_announce(bytes: &[u8]) -> Option<DiscoverResult> {
    let s = std::str::from_utf8(bytes).ok()?.trim();
    // WALTECH_LAN|v1|{tcp_port}|{device_id}|{name}
    let parts: Vec<&str> = s.splitn(5, '|').collect();
    if parts.len() < 5 {
        return None;
    }
    if parts[0] != "WALTECH_LAN" || parts[1] != "v1" {
        return None;
    }
    let port: u16 = parts[2].parse().ok()?;
    Some(DiscoverResult {
        host: String::new(),
        port,
        device_id: parts[3].to_string(),
        name: parts[4].to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ok() {
        let d = parse_announce(b"WALTECH_LAN|v1|48765|abc123|Caja 1").unwrap();
        assert_eq!(d.port, 48765);
        assert_eq!(d.device_id, "abc123");
        assert_eq!(d.name, "Caja 1");
    }
}
