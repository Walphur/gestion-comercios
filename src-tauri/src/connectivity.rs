use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

/// Comprueba conectividad sin bloquear la UI (timeout corto).
pub fn is_online() -> bool {
    let addrs: Vec<SocketAddr> = [
        ("1.1.1.1", 53),
        ("8.8.8.8", 53),
    ]
    .iter()
    .filter_map(|(h, p)| format!("{h}:{p}").parse().ok())
    .collect();

    for addr in addrs {
        if TcpStream::connect_timeout(&addr, Duration::from_secs(2)).is_ok() {
            return true;
        }
    }
    false
}
