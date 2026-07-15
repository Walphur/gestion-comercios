use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::db_manager::DbManager;
use crate::settings_util::{read_setting_or, write_setting};

use super::applier::{apply_event, ApplyStatus};
use super::errors::{LanResult, LanSyncError};
use super::models::LanStatus;
use super::outbox::{
    append_log, mark_acked, materialize_pending, pending_count, reclaim_stale_sending, requeue_sending,
};
use super::protocol::{
    Ack, AuthRequest, AuthResponse, CatchupResponse, EventBatch, SyncEvent, WsMessage,
};
use super::state::{set_last_sync_now, set_status, with_state};

pub struct ClientConfig {
    pub host: String,
    pub port: u16,
    pub psk: String,
    pub device_id: String,
    pub device_name: String,
}

struct SessionAuth {
    token: String,
    expires_at: i64,
}

fn http_base(cfg: &ClientConfig) -> String {
    format!("http://{}:{}", cfg.host, cfg.port)
}

fn ws_url(cfg: &ClientConfig, token: &str) -> String {
    format!(
        "ws://{}:{}/v1/ws?token={}",
        cfg.host,
        cfg.port,
        urlencoding::encode(token)
    )
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub async fn authenticate(cfg: &ClientConfig) -> LanResult<AuthResponse> {
    let url = format!("{}/v1/auth", http_base(cfg));
    let body = AuthRequest {
        psk: cfg.psk.clone(),
        device_id: cfg.device_id.clone(),
        device_name: cfg.device_name.clone(),
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(LanSyncError::Auth(format!("{status}: {text}")));
    }
    resp.json::<AuthResponse>()
        .await
        .map_err(|e| LanSyncError::Http(e.to_string()))
}

async fn ensure_auth(cfg: &ClientConfig, auth: &mut SessionAuth) -> LanResult<()> {
    // Renovar si faltan < 5 minutos
    if auth.expires_at > 0 && auth.expires_at - now_unix() > 300 {
        return Ok(());
    }
    let fresh = authenticate(cfg).await?;
    if fresh.token.is_empty() {
        return Err(LanSyncError::Auth("token vacío".into()));
    }
    auth.token = fresh.token;
    auth.expires_at = if fresh.expires_at > 0 {
        fresh.expires_at
    } else {
        now_unix() + 3600
    };
    Ok(())
}

/// Catch-up paginado hasta agotar el event store.
pub async fn fetch_catchup_all(
    cfg: &ClientConfig,
    token: &str,
    since_lamport: i64,
    after_event_id: &str,
) -> LanResult<Vec<SyncEvent>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    let mut all = Vec::new();
    let mut lamport = since_lamport;
    let mut after = after_event_id.to_string();
    loop {
        let url = format!(
            "{}/v1/catchup?since_lamport={lamport}&after_event_id={}&limit=200",
            http_base(cfg),
            urlencoding::encode(&after)
        );
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .map_err(|e| LanSyncError::Http(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(LanSyncError::Http(format!("catchup {}", resp.status())));
        }
        let body: CatchupResponse = resp
            .json()
            .await
            .map_err(|e| LanSyncError::Http(e.to_string()))?;
        if body.events.is_empty() {
            break;
        }
        lamport = body.next_lamport;
        after = body.next_event_id.clone();
        let more = body.has_more;
        all.extend(body.events);
        if !more {
            break;
        }
    }
    Ok(all)
}

pub async fn push_http(cfg: &ClientConfig, token: &str, events: Vec<SyncEvent>) -> LanResult<Ack> {
    let url = format!("{}/v1/events", http_base(cfg));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .json(&EventBatch { events })
        .send()
        .await
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(LanSyncError::Http(format!("push {}", resp.status())));
    }
    resp.json::<Ack>()
        .await
        .map_err(|e| LanSyncError::Http(e.to_string()))
}

pub async fn test_connection(cfg: &ClientConfig) -> LanResult<String> {
    let url = format!("{}/health", http_base(cfg));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(LanSyncError::Http(format!("health {}", resp.status())));
    }
    let auth = authenticate(cfg).await?;
    Ok(format!(
        "OK — servidor {} ({})",
        auth.server_name, auth.server_device_id
    ))
}

fn apply_events_local(events: &[SyncEvent]) -> LanResult<Vec<String>> {
    let mut remaining: Vec<SyncEvent> = events.to_vec();
    let mut acked: Vec<String> = Vec::new();
    let mut parked: std::collections::HashSet<String> = std::collections::HashSet::new();
    for _round in 0..12 {
        if remaining.is_empty() {
            break;
        }
        let (progress, next, newly_acked) = DbManager::with_connection(|conn| {
            let mut next = Vec::new();
            let mut newly_acked = Vec::new();
            let mut progress = false;
            for e in &remaining {
                if parked.contains(&e.event_id) {
                    continue;
                }
                if e.origin_device == read_setting_or(conn, "lan_sync_device_id", "") {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO lan_sync_applied (event_id, entity_type) VALUES (?1, ?2)",
                        rusqlite::params![e.event_id, e.entity_type],
                    );
                    let _ = crate::lan_sync::outbox::advance_catchup_cursor(conn, e);
                    newly_acked.push(e.event_id.clone());
                    progress = true;
                    continue;
                }
                match apply_event(conn, e).map_err(|err| err.to_string())? {
                    ApplyStatus::Deferred => next.push(e.clone()),
                    ApplyStatus::ConflictParked => {
                        // Terminal para este lote: sin ACK. Reintento en próximo catch-up/WS.
                        parked.insert(e.event_id.clone());
                        progress = true;
                        let _ = append_log(
                            conn,
                            "in",
                            Some(&e.origin_device),
                            &format!("conflict {} {}", e.entity_type, e.entity_sync_id),
                            Some(&e.event_id),
                        );
                    }
                    ApplyStatus::Applied | ApplyStatus::AlreadyApplied => {
                        progress = true;
                        newly_acked.push(e.event_id.clone());
                        let _ = append_log(
                            conn,
                            "in",
                            Some(&e.origin_device),
                            &format!("{} {}", e.entity_type, e.entity_sync_id),
                            Some(&e.event_id),
                        );
                    }
                }
            }
            Ok((progress, next, newly_acked))
        })?;
        acked.extend(newly_acked);
        if !progress {
            break;
        }
        remaining = next;
    }
    // Deferred quedan fuera de `acked` → el origen los reenvía; el cursor no avanzó por ellos.
    Ok(acked)
}

fn catchup_since() -> (i64, String) {
    DbManager::with_connection(|conn| Ok(crate::lan_sync::outbox::catchup_cursor(conn)))
        .unwrap_or((0, String::new()))
}

async fn run_full_catchup(cfg: &ClientConfig, token: &str) -> LanResult<()> {
    let (lamport, after) = catchup_since();
    // Re-pedir desde el último aplicado (sin -1 sobre reloj) para no saltar Deferred.
    let catchup = fetch_catchup_all(cfg, token, lamport, &after).await?;
    let _acked = apply_events_local(&catchup)?;
    Ok(())
}

/// Loop cliente con reconnect + backoff.
pub async fn run_client(cfg: ClientConfig, stop: Arc<AtomicBool>) {
    let mut backoff_secs: u64 = 1;
    while !stop.load(Ordering::SeqCst) {
        set_status(LanStatus::Connecting);
        match run_client_session(&cfg, stop.clone()).await {
            Ok(()) => {
                backoff_secs = 1;
            }
            Err(e) => {
                with_state(|s| {
                    s.status = LanStatus::Error;
                    s.last_error = Some(e.to_string());
                });
                let _ = DbManager::with_connection(|conn| {
                    append_log(conn, "error", Some(&cfg.host), &e.to_string(), None)
                        .map_err(|e| e.to_string())
                });
            }
        }
        if stop.load(Ordering::SeqCst) {
            break;
        }
        set_status(LanStatus::Disconnected);
        for _ in 0..(backoff_secs * 10) {
            if stop.load(Ordering::SeqCst) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        backoff_secs = (backoff_secs * 2).min(30);
    }
    set_status(LanStatus::Disconnected);
}

async fn run_client_session(cfg: &ClientConfig, stop: Arc<AtomicBool>) -> LanResult<()> {
    let auth_resp = authenticate(cfg).await?;
    if auth_resp.token.is_empty() {
        return Err(LanSyncError::Auth("token vacío".into()));
    }
    let mut auth = SessionAuth {
        token: auth_resp.token,
        expires_at: if auth_resp.expires_at > 0 {
            auth_resp.expires_at
        } else {
            now_unix() + 3600
        },
    };

    set_status(LanStatus::Syncing);
    run_full_catchup(cfg, &auth.token).await?;

    let url = ws_url(cfg, &auth.token);
    let (ws, _) = connect_async(&url)
        .await
        .map_err(|e| LanSyncError::Network(format!("ws connect: {e}")))?;
    let (mut sink, mut stream) = ws.split();

    set_status(LanStatus::Connected);
    with_state(|s| {
        s.last_error = None;
        s.server_host = format!("{}:{}", cfg.host, cfg.port);
    });

    let hello = WsMessage::Hello(super::protocol::Hello {
        device_id: cfg.device_id.clone(),
        device_name: cfg.device_name.clone(),
    });
    sink
        .send(Message::Text(serde_json::to_string(&hello)?))
        .await
        .map_err(|e| LanSyncError::Network(e.to_string()))?;

    let mut drain_tick = tokio::time::interval(Duration::from_secs(1));
    let mut renew_tick = tokio::time::interval(Duration::from_secs(60));

    loop {
        if stop.load(Ordering::SeqCst) {
            break;
        }
        tokio::select! {
            _ = renew_tick.tick() => {
                // Renovación de token en background (próxima reconexión usa auth fresco).
                let _ = ensure_auth(cfg, &mut auth).await;
            }
            _ = drain_tick.tick() => {
                let _ = DbManager::with_connection(|conn| {
                    reclaim_stale_sending(conn).map_err(|e| e.to_string())
                });
                let events = DbManager::with_connection(|conn| {
                    materialize_pending(conn, 40).map_err(|e| e.to_string())
                })?;
                if !events.is_empty() {
                    set_status(LanStatus::Syncing);
                    let ids: Vec<String> = events.iter().map(|e| e.event_id.clone()).collect();
                    let batch = WsMessage::EventBatch(EventBatch { events: events.clone() });
                    if let Err(e) = sink
                        .send(Message::Text(serde_json::to_string(&batch)?))
                        .await
                    {
                        let _ = DbManager::with_connection(|conn| {
                            requeue_sending(conn, &ids).map_err(|err| err.to_string())
                        });
                        return Err(LanSyncError::Network(e.to_string()));
                    }
                    for e in &events {
                        let _ = DbManager::with_connection(|conn| {
                            append_log(
                                conn,
                                "out",
                                Some(&cfg.host),
                                &format!("{} {}", e.entity_type, e.entity_sync_id),
                                Some(&e.event_id),
                            )
                            .map_err(|e| e.to_string())
                        });
                    }
                }
                let pending = DbManager::with_connection(|conn| {
                    pending_count(conn).map_err(|e| e.to_string())
                })
                .unwrap_or(0);
                with_state(|s| {
                    s.pending = pending;
                    if s.status == LanStatus::Syncing && pending == 0 {
                        s.status = LanStatus::Connected;
                    }
                });
            }
            msg = stream.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        handle_ws_text(cfg, &auth.token, &mut sink, &text).await?;
                    }
                    Some(Ok(Message::Ping(p))) => {
                        let _ = sink.send(Message::Pong(p)).await;
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        return Err(LanSyncError::Network("WS cerrado".into()));
                    }
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        return Err(LanSyncError::Network(e.to_string()));
                    }
                }
            }
        }
    }
    Ok(())
}

async fn handle_ws_text<S>(
    cfg: &ClientConfig,
    token: &str,
    sink: &mut S,
    text: &str,
) -> LanResult<()>
where
    S: SinkExt<Message> + Unpin,
    S::Error: std::fmt::Display,
{
    let ws_msg: WsMessage = serde_json::from_str(text)?;
    match ws_msg {
        WsMessage::EventBatch(batch) => {
            let ids = apply_events_local(&batch.events)?;
            // Solo ACK de eventos realmente aplicados (nunca Deferred / Conflict).
            if !ids.is_empty() {
                let ack = WsMessage::Ack(Ack { event_ids: ids });
                sink
                    .send(Message::Text(serde_json::to_string(&ack)?))
                    .await
                    .map_err(|e| LanSyncError::Network(e.to_string()))?;
            }
            set_last_sync_now();
            let _ = DbManager::with_connection(|conn| {
                write_setting(
                    conn,
                    "lan_sync_last_ok_at",
                    &chrono::Local::now()
                        .format("%Y-%m-%d %H:%M:%S")
                        .to_string(),
                )
            });
        }
        WsMessage::Ack(ack) => {
            DbManager::with_connection(|conn| {
                mark_acked(conn, &ack.event_ids).map_err(|e| e.to_string())?;
                Ok(())
            })?;
            set_last_sync_now();
        }
        WsMessage::CatchupRequired { .. } => {
            set_status(LanStatus::Syncing);
            run_full_catchup(cfg, token).await?;
            set_status(LanStatus::Connected);
        }
        WsMessage::Ping(p) => {
            let pong = WsMessage::Pong(p);
            sink
                .send(Message::Text(serde_json::to_string(&pong)?))
                .await
                .map_err(|e| LanSyncError::Network(e.to_string()))?;
        }
        WsMessage::Error { message } => {
            with_state(|s| s.last_error = Some(message));
        }
        WsMessage::Hello(_) | WsMessage::Pong(_) => {
            let _ = cfg;
        }
    }
    Ok(())
}

pub fn read_client_config() -> LanResult<ClientConfig> {
    DbManager::with_connection(|conn| {
        let host = read_setting_or(conn, "lan_sync_server_host", "");
        if host.trim().is_empty() {
            return Err("Configurá la IP/host del servidor LAN".into());
        }
        let (host, port_override) = if let Some((h, p)) = host.rsplit_once(':') {
            if p.chars().all(|c| c.is_ascii_digit()) {
                (h.to_string(), p.parse::<u16>().ok())
            } else {
                (host.clone(), None)
            }
        } else {
            (host, None)
        };
        let port: u16 = port_override.unwrap_or_else(|| {
            read_setting_or(conn, "lan_sync_port", "48765")
                .parse()
                .unwrap_or(48765)
        });
        let psk = read_setting_or(conn, "lan_sync_psk", "");
        if psk.trim().is_empty() {
            return Err("Configurá la contraseña LAN (PSK)".into());
        }
        let device_id = super::outbox::ensure_device_id(conn).map_err(|e| e.to_string())?;
        let device_name = read_setting_or(conn, "lan_sync_device_name", "Caja");
        Ok(ClientConfig {
            host,
            port,
            psk,
            device_id,
            device_name,
        })
    })
    .map_err(LanSyncError::Config)
}
