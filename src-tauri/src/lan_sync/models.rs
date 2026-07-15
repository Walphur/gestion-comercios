use serde::{Deserialize, Serialize};

/// Rol Sync LAN de esta PC.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LanRole {
    Off,
    Server,
    Client,
}

impl LanRole {
    pub fn as_str(self) -> &'static str {
        match self {
            LanRole::Off => "off",
            LanRole::Server => "server",
            LanRole::Client => "client",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "server" => LanRole::Server,
            "client" => LanRole::Client,
            _ => LanRole::Off,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LanStatus {
    Disconnected,
    Connecting,
    Connected,
    Syncing,
    Error,
}

impl LanStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            LanStatus::Disconnected => "disconnected",
            LanStatus::Connecting => "connecting",
            LanStatus::Connected => "connected",
            LanStatus::Syncing => "syncing",
            LanStatus::Error => "error",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionInfo {
    pub device_id: String,
    pub device_name: String,
    pub remote_addr: String,
    pub connected_at: String,
}

/// Estado expuesto a la UI / comandos Tauri.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanUiStatus {
    pub enabled: bool,
    pub role: String,
    pub status: String,
    pub device_id: String,
    pub device_name: String,
    pub local_ip: Option<String>,
    pub port: u16,
    pub server_host: String,
    pub clients_connected: usize,
    pub pending: u64,
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
    pub clients: Vec<ConnectionInfo>,
}
