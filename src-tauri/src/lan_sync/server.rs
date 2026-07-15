use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{ConnectInfo, Query, State, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use rand::RngCore;
use serde::Deserialize;
use tokio::sync::{broadcast, Mutex};

use crate::db_manager::DbManager;
use crate::settings_util::{read_setting_or, write_setting};

use super::applier::{apply_event, ApplyStatus};
use super::errors::{LanResult, LanSyncError};
use super::models::ConnectionInfo;
use super::net_guard::is_private_ip;
use super::outbox::{
    append_log, insert_event_store, list_event_store_page, mark_acked, materialize_pending,
};
use super::protocol::{
    Ack, AuthRequest, AuthResponse, CatchupResponse, EventBatch, SyncEvent, WsMessage,
};
use super::models::LanStatus;
use super::state::{set_last_sync_now, with_state};

const TOKEN_TTL_SECS: u64 = 3600;
const WS_BROADCAST_CAPACITY: usize = 16_384;
const CATCHUP_PAGE_SIZE: i64 = 200;

#[derive(Clone)]
struct TokenEntry {
    device_id: String,
    device_name: String,
    expires_at: Instant,
}

#[derive(Clone)]
pub struct ServerInner {
    pub psk: String,
    pub server_device_id: String,
    pub server_name: String,
    pub tokens: Arc<Mutex<HashMap<String, TokenEntry>>>,
    pub events_tx: broadcast::Sender<SyncEvent>,
    pub stop: Arc<AtomicBool>,
}

pub type ServerState = Arc<ServerInner>;

/// Emite un token opaco con nonce aleatorio + expiración.
pub fn issue_token() -> (String, Instant, i64) {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let token = hex::encode(bytes);
    let expires_at = Instant::now() + Duration::from_secs(TOKEN_TTL_SECS);
    let expires_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64 + TOKEN_TTL_SECS as i64)
        .unwrap_or(0);
    (token, expires_at, expires_unix)
}

pub fn build_router(state: ServerState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/auth", post(auth))
        .route("/v1/catchup", get(catchup))
        .route("/v1/events", post(push_events))
        .route("/v1/ws", get(ws_upgrade))
        .with_state(state)
}

async fn health(ConnectInfo(addr): ConnectInfo<SocketAddr>) -> impl IntoResponse {
    if !is_private_ip(addr.ip()) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"ok": false, "error": "IP no privada"})),
        );
    }
    (
        StatusCode::OK,
        Json(serde_json::json!({"ok": true, "service": "waltech-lan-sync"})),
    )
}

async fn auth(
    State(state): State<ServerState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(body): Json<AuthRequest>,
) -> impl IntoResponse {
    if !is_private_ip(addr.ip()) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"ok": false, "error": "IP no privada"})),
        );
    }
    if body.psk != state.psk {
        let _ = DbManager::with_connection(|conn| {
            append_log(
                conn,
                "error",
                Some(&addr.to_string()),
                "Auth fallida (PSK)",
                None,
            )
            .map_err(|e| e.to_string())
        });
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"ok": false, "error": "PSK inválida"})),
        );
    }
    if body.device_id.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"ok": false, "error": "device_id requerido"})),
        );
    }
    let (token, expires_at, expires_unix) = issue_token();
    {
        let mut tokens = state.tokens.lock().await;
        // Invalidar tokens previos del mismo device
        tokens.retain(|_, e| e.device_id != body.device_id && e.expires_at > Instant::now());
        tokens.insert(
            token.clone(),
            TokenEntry {
                device_id: body.device_id.clone(),
                device_name: body.device_name.clone(),
                expires_at,
            },
        );
    }
    let resp = AuthResponse {
        ok: true,
        token,
        server_device_id: state.server_device_id.clone(),
        server_name: state.server_name.clone(),
        expires_at: expires_unix,
    };
    (
        StatusCode::OK,
        Json(serde_json::to_value(resp).unwrap_or_default()),
    )
}

fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(|s| s.trim().to_string())
}

async fn validate_token(state: &ServerState, token: &str) -> Option<(String, String)> {
    let mut tokens = state.tokens.lock().await;
    let Some(entry) = tokens.get(token).cloned() else {
        return None;
    };
    if entry.expires_at <= Instant::now() {
        tokens.remove(token);
        return None;
    }
    Some((entry.device_id, entry.device_name))
}

#[derive(Deserialize)]
struct CatchupQuery {
    since_lamport: Option<i64>,
    after_event_id: Option<String>,
    limit: Option<i64>,
}

async fn catchup(
    State(state): State<ServerState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(q): Query<CatchupQuery>,
) -> impl IntoResponse {
    if !is_private_ip(addr.ip()) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"ok": false})),
        );
    }
    let Some(token) = extract_bearer(&headers) else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"ok": false})),
        );
    };
    if validate_token(&state, &token).await.is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"ok": false})),
        );
    }
    let since = q.since_lamport.unwrap_or(0);
    let after = q.after_event_id.unwrap_or_default();
    let limit = q.limit.unwrap_or(CATCHUP_PAGE_SIZE);
    let page = match DbManager::with_connection(|conn| {
        list_event_store_page(conn, since, &after, limit).map_err(|e| e.to_string())
    }) {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"ok": false, "error": e})),
            );
        }
    };
    let resp = CatchupResponse {
        events: page.events,
        has_more: page.has_more,
        next_lamport: page.next_lamport,
        next_event_id: page.next_event_id,
    };
    (
        StatusCode::OK,
        Json(serde_json::to_value(resp).unwrap_or_default()),
    )
}

async fn push_events(
    State(state): State<ServerState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(batch): Json<EventBatch>,
) -> impl IntoResponse {
    if !is_private_ip(addr.ip()) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"ok": false})),
        );
    }
    let Some(token) = extract_bearer(&headers) else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"ok": false})),
        );
    };
    let Some((peer_id, _)) = validate_token(&state, &token).await else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"ok": false})),
        );
    };

    match ingest_batch(&state, &peer_id, batch.events).await {
        Ok(acked) => (
            StatusCode::OK,
            Json(serde_json::to_value(Ack { event_ids: acked }).unwrap_or_default()),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"ok": false, "error": e.to_string()})),
        ),
    }
}

async fn ingest_batch(
    state: &ServerState,
    peer_id: &str,
    events: Vec<SyncEvent>,
) -> LanResult<Vec<String>> {
    // Varias pasadas para dependencias (movimiento antes que producto).
    let mut pending = events;
    let mut acked = Vec::new();
    let mut conflicted: std::collections::HashSet<String> = std::collections::HashSet::new();
    for _round in 0..8 {
        if pending.is_empty() {
            break;
        }
        let batch = std::mem::take(&mut pending);
        let before = batch.len();
        let mut still = Vec::new();
        for event in batch {
            if conflicted.contains(&event.event_id) {
                continue;
            }
            let eid = event.event_id.clone();
            let status = DbManager::with_connection(|conn| {
                let st = apply_event(conn, &event).map_err(|e| e.to_string())?;
                match st {
                    ApplyStatus::Applied | ApplyStatus::AlreadyApplied => {
                        insert_event_store(conn, &event).map_err(|e| e.to_string())?;
                        append_log(
                            conn,
                            "in",
                            Some(peer_id),
                            &format!("{} {}", event.entity_type, event.entity_sync_id),
                            Some(&event.event_id),
                        )
                        .map_err(|e| e.to_string())?;
                        Ok(st)
                    }
                    ApplyStatus::ConflictParked => {
                        append_log(
                            conn,
                            "in",
                            Some(peer_id),
                            &format!("conflict {} {}", event.entity_type, event.entity_sync_id),
                            Some(&event.event_id),
                        )
                        .map_err(|e| e.to_string())?;
                        Ok(st)
                    }
                    ApplyStatus::Deferred => Ok(st),
                }
            })?;
            match status {
                ApplyStatus::Deferred => still.push(event),
                ApplyStatus::ConflictParked => {
                    // Sin ACK ni event_store: permanece pendiente en el origen.
                    conflicted.insert(eid);
                }
                ApplyStatus::Applied | ApplyStatus::AlreadyApplied => {
                    let _ = state.events_tx.send(event);
                    acked.push(eid);
                }
            }
        }
        if still.len() == before && !still.is_empty() {
            break;
        }
        pending = still;
    }
    set_last_sync_now();
    with_state(|s| {
        s.status = super::models::LanStatus::Connected;
    });
    let _ = DbManager::with_connection(|conn| {
        write_setting(
            conn,
            "lan_sync_last_ok_at",
            &chrono::Local::now()
                .format("%Y-%m-%d %H:%M:%S")
                .to_string(),
        )
    });
    Ok(acked)
}

#[derive(Deserialize)]
struct WsQuery {
    token: String,
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<ServerState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(q): Query<WsQuery>,
) -> impl IntoResponse {
    if !is_private_ip(addr.ip()) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Some((device_id, device_name)) = validate_token(&state, &q.token).await else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    ws.on_upgrade(move |socket| handle_ws(socket, state, addr, device_id, device_name))
}

async fn handle_ws(
    socket: WebSocket,
    state: ServerState,
    addr: SocketAddr,
    device_id: String,
    device_name: String,
) {
    let connected_at = chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    with_state(|s| {
        s.clients.push(ConnectionInfo {
            device_id: device_id.clone(),
            device_name: device_name.clone(),
            remote_addr: addr.to_string(),
            connected_at,
        });
        s.status = LanStatus::Connected;
    });

    let (mut sink, mut stream) = socket.split();
    let mut rx = state.events_tx.subscribe();
    let my_device = device_id.clone();

    loop {
        if state.stop.load(Ordering::SeqCst) {
            break;
        }
        tokio::select! {
            msg = stream.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                            match ws_msg {
                                WsMessage::EventBatch(batch) => {
                                    match ingest_batch(&state, &device_id, batch.events).await {
                                        Ok(ids) => {
                                            let ack = WsMessage::Ack(Ack { event_ids: ids });
                                            if let Ok(t) = serde_json::to_string(&ack) {
                                                let _ = sink.send(Message::Text(t)).await;
                                            }
                                        }
                                        Err(e) => {
                                            let err = WsMessage::Error { message: e.to_string() };
                                            if let Ok(t) = serde_json::to_string(&err) {
                                                let _ = sink.send(Message::Text(t)).await;
                                            }
                                        }
                                    }
                                }
                                WsMessage::Ack(ack) => {
                                    let _ = DbManager::with_connection(|conn| {
                                        mark_acked(conn, &ack.event_ids).map_err(|e| e.to_string())
                                    });
                                }
                                WsMessage::Ping(p) => {
                                    let pong = WsMessage::Pong(p);
                                    if let Ok(t) = serde_json::to_string(&pong) {
                                        let _ = sink.send(Message::Text(t)).await;
                                    }
                                }
                                WsMessage::Hello(_)
                                | WsMessage::Pong(_)
                                | WsMessage::CatchupRequired { .. }
                                | WsMessage::Error { .. } => {}
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
            event = rx.recv() => {
                match event {
                    Ok(ev) => {
                        if ev.origin_device == my_device {
                            continue;
                        }
                        let batch = WsMessage::EventBatch(EventBatch { events: vec![ev] });
                        if let Ok(t) = serde_json::to_string(&batch) {
                            if sink.send(Message::Text(t)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        // Forzar catch-up completo en el cliente.
                        let msg = WsMessage::CatchupRequired { since_lamport: 0 };
                        if let Ok(t) = serde_json::to_string(&msg) {
                            let _ = sink.send(Message::Text(t)).await;
                        }
                        // Re-suscribirse limpia el lag interno
                        rx = state.events_tx.subscribe();
                    }
                    Err(_) => break,
                }
            }
        }
    }

    with_state(|s| {
        s.clients.retain(|c| c.device_id != device_id);
    });
}

/// Drena outbox local del hub hacia el event_store + broadcast.
pub fn drain_hub_outbox(state: &ServerState) -> LanResult<usize> {
    let events = DbManager::with_connection(|conn| {
        let evs = materialize_pending(conn, 50).map_err(|e| e.to_string())?;
        for e in &evs {
            insert_event_store(conn, e).map_err(|e| e.to_string())?;
            append_log(
                conn,
                "out",
                None,
                &format!("{} {}", e.entity_type, e.entity_sync_id),
                Some(&e.event_id),
            )
            .map_err(|e| e.to_string())?;
        }
        let ids: Vec<String> = evs.iter().map(|e| e.event_id.clone()).collect();
        mark_acked(conn, &ids).map_err(|e| e.to_string())?;
        Ok(evs)
    })?;

    let n = events.len();
    for e in events {
        let _ = state.events_tx.send(e);
    }
    if n > 0 {
        set_last_sync_now();
    }
    let pending = DbManager::with_connection(|conn| {
        super::outbox::pending_count(conn).map_err(|e| e.to_string())
    })
    .unwrap_or(0);
    with_state(|s| s.pending = pending);
    Ok(n)
}

pub async fn run_server(
    bind_port: u16,
    psk: String,
    server_device_id: String,
    server_name: String,
    stop: Arc<AtomicBool>,
) -> LanResult<()> {
    let (events_tx, _) = broadcast::channel(WS_BROADCAST_CAPACITY);
    let state = Arc::new(ServerInner {
        psk,
        server_device_id,
        server_name,
        tokens: Arc::new(Mutex::new(HashMap::new())),
        events_tx,
        stop: stop.clone(),
    });

    let app = build_router(state.clone());
    let addr = SocketAddr::from(([0, 0, 0, 0], bind_port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| LanSyncError::Network(format!("bind {addr}: {e}")))?;

    let drain_state = state.clone();
    let drain_stop = stop.clone();
    tokio::spawn(async move {
        while !drain_stop.load(Ordering::SeqCst) {
            let _ = drain_hub_outbox(&drain_state);
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    });

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async move {
        while !stop.load(Ordering::SeqCst) {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
    })
    .await
    .map_err(|e| LanSyncError::Network(e.to_string()))?;

    Ok(())
}

pub fn read_server_config() -> LanResult<(u16, String, String, String)> {
    DbManager::with_connection(|conn| {
        let port: u16 = read_setting_or(conn, "lan_sync_port", "48765")
            .parse()
            .unwrap_or(48765);
        let psk = read_setting_or(conn, "lan_sync_psk", "");
        let device_id = super::outbox::ensure_device_id(conn).map_err(|e| e.to_string())?;
        let name = read_setting_or(conn, "lan_sync_device_name", "Servidor");
        if psk.trim().is_empty() {
            return Err("Configurá una contraseña LAN (PSK) antes de iniciar el servidor".into());
        }
        Ok((port, psk, device_id, name))
    })
    .map_err(LanSyncError::Config)
}
