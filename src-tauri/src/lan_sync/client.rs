use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::db_manager::DbManager;
use crate::settings_util::{read_setting_or, write_setting};

use super::applier::apply_event;
use super::errors::{LanResult, LanSyncError};
use super::models::LanStatus;
use super::outbox::{
    append_log, mark_acked, materialize_pending, pending_count,
};
use super::protocol::{
    Ack, AuthRequest, AuthResponse, CatchupResponse, EventBatch, SyncEvent, WsMessage,
};
use super::server::make_token;
use super::state::{set_last_sync_now, set_status, with_state};

pub struct ClientConfig {
    pub host: String,
    pub port: u16,
    pub psk: String,
    pub device_id: String,
    pub device_name: String,
}

fn http_base(cfg: &ClientConfig) -> String {
    format!("http://{}:{}", cfg.host, cfg.port)
}

fn ws_url(cfg: &ClientConfig, token: &str) -> String {
    format!("ws://{}:{}/v1/ws?token={}", cfg.host, cfg.port, urlencoding::encode(token))
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

pub async fn fetch_catchup(cfg: &ClientConfig, token: &str, since_lamport: i64) -> LanResult<Vec<SyncEvent>> {
    let url = format!(
        "{}/v1/catchup?since_lamport={since_lamport}",
        http_base(cfg)
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
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
    Ok(body.events)
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

fn apply_events_local(events: &[SyncEvent]) -> LanResult<()> {
    DbManager::with_connection(|conn| {
        for e in events {
            if e.origin_device
                == read_setting_or(conn, "lan_sync_device_id", "")
            {
                // Evento propio retransmitido: marcar applied sin reaplicar
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO lan_sync_applied (event_id, entity_type) VALUES (?1, ?2)",
                    rusqlite::params![e.event_id, e.entity_type],
                );
                continue;
            }
            apply_event(conn, e).map_err(|e| e.to_string())?;
            append_log(
                conn,
                "in",
                Some(&e.origin_device),
                &format!("{} {}", e.entity_type, e.entity_sync_id),
                Some(&e.event_id),
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .map_err(LanSyncError::Database)
}

fn local_since_lamport() -> i64 {
    DbManager::with_connection(|conn| {
        Ok(read_setting_or(conn, "lan_sync_lamport", "0")
            .parse()
            .unwrap_or(0))
    })
    .unwrap_or(0)
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
    let auth = authenticate(cfg).await?;
    let token = if auth.token.is_empty() {
        make_token(&cfg.psk, &cfg.device_id)
    } else {
        auth.token
    };

    set_status(LanStatus::Syncing);
    let since = local_since_lamport().saturating_sub(1);
    let catchup = fetch_catchup(cfg, &token, since).await?;
    apply_events_local(&catchup)?;

    let url = ws_url(cfg, &token);
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

    loop {
        if stop.load(Ordering::SeqCst) {
            break;
        }
        tokio::select! {
            _ = drain_tick.tick() => {
                let events = DbManager::with_connection(|conn| {
                    materialize_pending(conn, 40).map_err(|e| e.to_string())
                })?;
                if !events.is_empty() {
                    set_status(LanStatus::Syncing);
                    let batch = WsMessage::EventBatch(EventBatch { events: events.clone() });
                    sink
                        .send(Message::Text(serde_json::to_string(&batch)?))
                        .await
                        .map_err(|e| LanSyncError::Network(e.to_string()))?;
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
                        handle_ws_text(cfg, &mut sink, &text).await?;
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
            apply_events_local(&batch.events)?;
            let ids: Vec<String> = batch.events.iter().map(|e| e.event_id.clone()).collect();
            let ack = WsMessage::Ack(Ack { event_ids: ids });
            sink
                .send(Message::Text(serde_json::to_string(&ack)?))
                .await
                .map_err(|e| LanSyncError::Network(e.to_string()))?;
            set_last_sync_now();
            let _ = DbManager::with_connection(|conn| {
                write_setting(
                    conn,
                    "lan_sync_last_ok_at",
                    &chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
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
        // host puede ser "192.168.0.10" o "192.168.0.10:48765"
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
