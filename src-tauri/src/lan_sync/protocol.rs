use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Evento de sincronización CDC (mismo shape en wire y outbox).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SyncEvent {
    pub event_id: String,
    pub entity_type: String,
    pub entity_sync_id: String,
    pub op: String,
    pub payload: Value,
    pub lamport: i64,
    pub origin_device: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthRequest {
    pub psk: String,
    pub device_id: String,
    pub device_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub ok: bool,
    pub token: String,
    pub server_device_id: String,
    pub server_name: String,
    /// Unix epoch seconds — el cliente debe renovar antes.
    #[serde(default)]
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventBatch {
    pub events: Vec<SyncEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ack {
    pub event_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hello {
    pub device_id: String,
    pub device_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ping {
    pub ts: Option<String>,
}

/// Mensajes JSON sobre WebSocket (tag `type`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsMessage {
    Hello(Hello),
    Ping(Ping),
    Pong(Ping),
    EventBatch(EventBatch),
    Ack(Ack),
    /// El peer se atrasó en el broadcast: forzar catch-up paginado.
    CatchupRequired { since_lamport: i64 },
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatchupResponse {
    pub events: Vec<SyncEvent>,
    #[serde(default)]
    pub has_more: bool,
    /// Cursor: último lamport de esta página (0 si vacía).
    #[serde(default)]
    pub next_lamport: i64,
    /// Cursor: último event_id de esta página.
    #[serde(default)]
    pub next_event_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatchupCursor {
    pub since_lamport: i64,
    #[serde(default)]
    pub after_event_id: String,
}
