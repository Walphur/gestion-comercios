use serde::{Deserialize, Serialize};

use crate::db_manager::DbManager;
use crate::settings_util::{read_setting_or, write_setting};

use super::applier::apply_event_force;
use super::conflicts::{
    list_open_conflicts, load_conflict_event, mark_conflict_discarded, mark_conflict_resolved,
    open_conflict_count, ConflictRow,
};
use super::discovery::{self, DiscoverResult};
use super::engine;
use super::models::LanUiStatus;
use super::numbering;
use super::outbox::{ensure_device_id, pending_count};
use super::state::{detect_local_ip, with_state};

#[derive(Debug, Deserialize)]
pub struct LanSyncConfigInput {
    pub role: Option<String>,
    pub port: Option<u16>,
    pub psk: Option<String>,
    pub device_name: Option<String>,
    pub server_host: Option<String>,
    pub device_code: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LanSyncLogRow {
    pub id: i64,
    pub at: String,
    pub direction: String,
    pub peer: Option<String>,
    pub summary: String,
    pub detail: Option<String>,
}

#[tauri::command]
pub fn lan_sync_get_status() -> Result<LanUiStatus, String> {
    engine::refresh_pending();
    with_state(|s| {
        if s.local_ip.is_none() {
            s.local_ip = detect_local_ip();
        }
        if s.device_id.is_empty() {
            let _ = DbManager::with_connection(|conn| {
                s.device_id = ensure_device_id(conn).map_err(|e| e.to_string())?;
                s.device_name = read_setting_or(conn, "lan_sync_device_name", "");
                s.port = read_setting_or(conn, "lan_sync_port", "48765")
                    .parse()
                    .unwrap_or(48765);
                s.server_host = read_setting_or(conn, "lan_sync_server_host", "");
                s.enabled =
                    crate::settings_util::read_setting_flag(conn, "lan_sync_enabled");
                let role = read_setting_or(conn, "lan_sync_role", "off");
                s.role = super::models::LanRole::parse(&role);
                Ok(())
            });
        }
        Ok(s.to_ui())
    })
}

#[tauri::command]
pub fn lan_sync_save_config(cfg: LanSyncConfigInput) -> Result<LanUiStatus, String> {
    DbManager::with_connection(|conn| {
        ensure_device_id(conn).map_err(|e| e.to_string())?;
        let _ = numbering::ensure_device_code(conn);
        if let Some(ref role) = cfg.role {
            write_setting(conn, "lan_sync_role", role)?;
        }
        if let Some(port) = cfg.port {
            write_setting(conn, "lan_sync_port", &port.to_string())?;
        }
        if let Some(ref psk) = cfg.psk {
            write_setting(conn, "lan_sync_psk", psk)?;
        }
        if let Some(ref name) = cfg.device_name {
            write_setting(conn, "lan_sync_device_name", name)?;
        }
        if let Some(ref host) = cfg.server_host {
            write_setting(conn, "lan_sync_server_host", host)?;
        }
        if let Some(ref code) = cfg.device_code {
            if !code.trim().is_empty() {
                numbering::set_device_code(conn, code).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })?;
    with_state(|s| {
        if let Some(port) = cfg.port {
            s.port = port;
        }
        if let Some(ref name) = cfg.device_name {
            s.device_name = name.clone();
        }
        if let Some(ref host) = cfg.server_host {
            s.server_host = host.clone();
        }
        if let Some(ref role) = cfg.role {
            s.role = super::models::LanRole::parse(role);
        }
    });
    lan_sync_get_status()
}

#[tauri::command]
pub fn lan_sync_start_server() -> Result<LanUiStatus, String> {
    engine::start_server().map_err(|e| e.to_string())?;
    lan_sync_get_status()
}

#[tauri::command]
pub fn lan_sync_stop_server() -> Result<LanUiStatus, String> {
    engine::stop_server().map_err(|e| e.to_string())?;
    lan_sync_get_status()
}

#[tauri::command]
pub fn lan_sync_connect() -> Result<LanUiStatus, String> {
    engine::start_client().map_err(|e| e.to_string())?;
    lan_sync_get_status()
}

#[tauri::command]
pub fn lan_sync_disconnect() -> Result<LanUiStatus, String> {
    engine::stop_client().map_err(|e| e.to_string())?;
    lan_sync_get_status()
}

#[tauri::command]
pub fn lan_sync_discover(timeout_secs: Option<u64>) -> Result<Vec<DiscoverResult>, String> {
    let secs = timeout_secs.unwrap_or(3).clamp(1, 15);
    discovery::discover(std::time::Duration::from_secs(secs)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn lan_sync_test_connection() -> Result<String, String> {
    let cfg = super::client::read_client_config().map_err(|e| e.to_string())?;
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;
    rt.block_on(super::client::test_connection(&cfg))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn lan_sync_list_logs(limit: Option<i64>) -> Result<Vec<LanSyncLogRow>, String> {
    let lim = limit.unwrap_or(100).clamp(1, 500);
    DbManager::with_connection(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, at, direction, peer, summary, detail
                 FROM lan_sync_log ORDER BY id DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([lim], |r| {
                Ok(LanSyncLogRow {
                    id: r.get(0)?,
                    at: r.get(1)?,
                    direction: r.get(2)?,
                    peer: r.get(3)?,
                    summary: r.get(4)?,
                    detail: r.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
}

#[tauri::command]
pub fn lan_sync_pending_count() -> Result<u64, String> {
    DbManager::with_connection(|conn| pending_count(conn).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn lan_sync_list_conflicts(limit: Option<i64>) -> Result<Vec<ConflictRow>, String> {
    let lim = limit.unwrap_or(100).clamp(1, 500);
    DbManager::with_connection(|conn| list_open_conflicts(conn, lim).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn lan_sync_conflict_count() -> Result<u64, String> {
    DbManager::with_connection(|conn| open_conflict_count(conn).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn lan_sync_resolve_conflict(conflict_id: i64, action: String) -> Result<String, String> {
    DbManager::with_connection(|conn| {
        match action.as_str() {
            "retry" => {
                let Some(event) =
                    load_conflict_event(conn, conflict_id).map_err(|e| e.to_string())?
                else {
                    return Err("Conflicto no encontrado o ya resuelto".into());
                };
                match apply_event_force(conn, &event).map_err(|e| e.to_string())? {
                    super::applier::ApplyStatus::Applied
                    | super::applier::ApplyStatus::AlreadyApplied => {
                        mark_conflict_resolved(conn, conflict_id, "retry_ok")
                            .map_err(|e| e.to_string())?;
                        Ok("Conflicto reaplicado".into())
                    }
                    super::applier::ApplyStatus::Deferred => {
                        Err("Aún falta una dependencia (producto/cliente). Reintentá más tarde.".into())
                    }
                    super::applier::ApplyStatus::ConflictParked => {
                        Err("Sigue en conflicto. Revisá barcode/nombre único.".into())
                    }
                }
            }
            "discard" => {
                let Some(event) =
                    load_conflict_event(conn, conflict_id).map_err(|e| e.to_string())?
                else {
                    return Err("Conflicto no encontrado".into());
                };
                // Descarte explícito: marca applied + libera pendiente/cursor.
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO lan_sync_applied (event_id, entity_type) VALUES (?1, ?2)",
                    rusqlite::params![event.event_id, event.entity_type],
                );
                crate::lan_sync::outbox::advance_catchup_cursor(conn, &event)
                    .map_err(|e| e.to_string())?;
                mark_conflict_discarded(conn, conflict_id).map_err(|e| e.to_string())?;
                Ok("Evento remoto descartado".into())
            }
            _ => Err("Acción inválida (retry|discard)".into()),
        }
    })
}

#[tauri::command]
pub fn lan_sync_get_device_code() -> Result<String, String> {
    DbManager::with_connection(|conn| {
        ensure_device_id(conn).map_err(|e| e.to_string())?;
        numbering::ensure_device_code(conn).map_err(|e| e.to_string())
    })
}
