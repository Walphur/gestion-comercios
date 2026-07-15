use std::sync::{Arc, Mutex};

use super::models::{ConnectionInfo, LanRole, LanStatus, LanUiStatus};

#[derive(Debug, Clone)]
pub struct RuntimeState {
    pub role: LanRole,
    pub status: LanStatus,
    pub clients: Vec<ConnectionInfo>,
    pub last_sync_at: Option<String>,
    pub pending: u64,
    pub last_error: Option<String>,
    pub local_ip: Option<String>,
    pub port: u16,
    pub device_id: String,
    pub device_name: String,
    pub server_host: String,
    pub enabled: bool,
}

impl Default for RuntimeState {
    fn default() -> Self {
        Self {
            role: LanRole::Off,
            status: LanStatus::Disconnected,
            clients: Vec::new(),
            last_sync_at: None,
            pending: 0,
            last_error: None,
            local_ip: detect_local_ip(),
            port: 48765,
            device_id: String::new(),
            device_name: String::new(),
            server_host: String::new(),
            enabled: false,
        }
    }
}

impl RuntimeState {
    pub fn to_ui(&self) -> LanUiStatus {
        LanUiStatus {
            enabled: self.enabled,
            role: self.role.as_str().to_string(),
            status: self.status.as_str().to_string(),
            device_id: self.device_id.clone(),
            device_name: self.device_name.clone(),
            local_ip: self.local_ip.clone(),
            port: self.port,
            server_host: self.server_host.clone(),
            clients_connected: self.clients.len(),
            pending: self.pending,
            last_sync_at: self.last_sync_at.clone(),
            last_error: self.last_error.clone(),
            clients: self.clients.clone(),
        }
    }
}

pub type SharedState = Arc<Mutex<RuntimeState>>;

static GLOBAL: std::sync::OnceLock<SharedState> = std::sync::OnceLock::new();

pub fn global_state() -> SharedState {
    GLOBAL
        .get_or_init(|| Arc::new(Mutex::new(RuntimeState::default())))
        .clone()
}

pub fn with_state<F, T>(f: F) -> T
where
    F: FnOnce(&mut RuntimeState) -> T,
{
    let state = global_state();
    let mut guard = state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    f(&mut guard)
}

pub fn detect_local_ip() -> Option<String> {
    local_ip_address::local_ip()
        .ok()
        .map(|ip| ip.to_string())
}

pub fn set_error(msg: impl Into<String>) {
    with_state(|s| {
        s.status = LanStatus::Error;
        s.last_error = Some(msg.into());
    });
}

pub fn set_status(status: LanStatus) {
    with_state(|s| {
        s.status = status;
        if status != LanStatus::Error {
            s.last_error = None;
        }
    });
}

pub fn set_last_sync_now() {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    with_state(|s| {
        s.last_sync_at = Some(now);
    });
}
