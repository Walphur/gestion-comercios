use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use crate::db_manager::DbManager;
use crate::settings_util::{write_setting, write_setting_flag};

use super::discovery;
use super::errors::LanResult;
use super::models::{LanRole, LanStatus};
use super::outbox::{ensure_device_id, pending_count};
use super::state::{detect_local_ip, set_status, with_state};

struct RuntimeHandles {
    stop: Arc<AtomicBool>,
    join: Option<thread::JoinHandle<()>>,
}

static HANDLES: Mutex<Option<RuntimeHandles>> = Mutex::new(None);

fn stop_current() {
    let mut guard = HANDLES
        .lock()
        .unwrap_or_else(|p| p.into_inner());
    if let Some(h) = guard.take() {
        h.stop.store(true, Ordering::SeqCst);
        if let Some(j) = h.join {
            let _ = j.join();
        }
    }
}

pub fn start_server() -> LanResult<()> {
    stop_current();
    let (port, psk, device_id, name) = super::server::read_server_config()?;

    DbManager::with_connection(|conn| {
        ensure_device_id(conn).map_err(|e| e.to_string())?;
        write_setting_flag(conn, "lan_sync_enabled", true)?;
        write_setting(conn, "lan_sync_role", "server")?;
        write_setting(conn, "lan_sync_device_id", &device_id)?;
        Ok(())
    })?;

    let stop = Arc::new(AtomicBool::new(false));
    let stop_disc = stop.clone();
    let disc_id = device_id.clone();
    let disc_name = name.clone();
    let disc_port = port;

    with_state(|s| {
        s.enabled = true;
        s.role = LanRole::Server;
        s.port = port;
        s.device_id = device_id.clone();
        s.device_name = name.clone();
        s.local_ip = detect_local_ip();
        s.status = LanStatus::Connected;
        s.last_error = None;
        s.clients.clear();
    });

    // Discovery announce (hilo std)
    let announce_stop = stop_disc.clone();
    thread::spawn(move || {
        discovery::announce_loop(disc_port, disc_id, disc_name, announce_stop);
    });

    let join_stop = stop.clone();
    let join = thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
        {
            Ok(r) => r,
            Err(e) => {
                super::state::set_error(format!("tokio runtime: {e}"));
                return;
            }
        };
        let result = rt.block_on(super::server::run_server(
            port,
            psk,
            device_id,
            name,
            join_stop.clone(),
        ));
        if let Err(e) = result {
            if !join_stop.load(Ordering::SeqCst) {
                super::state::set_error(e.to_string());
            }
        }
        set_status(LanStatus::Disconnected);
    });

    let mut guard = HANDLES.lock().unwrap_or_else(|p| p.into_inner());
    *guard = Some(RuntimeHandles {
        stop,
        join: Some(join),
    });
    Ok(())
}

pub fn stop_server() -> LanResult<()> {
    stop_current();
    DbManager::with_connection(|conn| {
        write_setting_flag(conn, "lan_sync_enabled", false)?;
        write_setting(conn, "lan_sync_role", "off")?;
        Ok(())
    })?;
    with_state(|s| {
        s.enabled = false;
        s.role = LanRole::Off;
        s.status = LanStatus::Disconnected;
        s.clients.clear();
    });
    Ok(())
}

pub fn start_client() -> LanResult<()> {
    stop_current();
    let cfg = super::client::read_client_config()?;

    DbManager::with_connection(|conn| {
        ensure_device_id(conn).map_err(|e| e.to_string())?;
        write_setting_flag(conn, "lan_sync_enabled", true)?;
        write_setting(conn, "lan_sync_role", "client")?;
        write_setting(conn, "lan_sync_server_host", &format!("{}:{}", cfg.host, cfg.port))?;
        Ok(())
    })?;

    let stop = Arc::new(AtomicBool::new(false));
    with_state(|s| {
        s.enabled = true;
        s.role = LanRole::Client;
        s.port = cfg.port;
        s.device_id = cfg.device_id.clone();
        s.device_name = cfg.device_name.clone();
        s.server_host = format!("{}:{}", cfg.host, cfg.port);
        s.local_ip = detect_local_ip();
        s.status = LanStatus::Connecting;
        s.last_error = None;
    });

    let join_stop = stop.clone();
    let join = thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
        {
            Ok(r) => r,
            Err(e) => {
                super::state::set_error(format!("tokio runtime: {e}"));
                return;
            }
        };
        rt.block_on(super::client::run_client(cfg, join_stop));
    });

    let mut guard = HANDLES.lock().unwrap_or_else(|p| p.into_inner());
    *guard = Some(RuntimeHandles {
        stop,
        join: Some(join),
    });
    Ok(())
}

pub fn stop_client() -> LanResult<()> {
    stop_current();
    DbManager::with_connection(|conn| {
        write_setting_flag(conn, "lan_sync_enabled", false)?;
        write_setting(conn, "lan_sync_role", "off")?;
        Ok(())
    })?;
    with_state(|s| {
        s.enabled = false;
        s.role = LanRole::Off;
        s.status = LanStatus::Disconnected;
    });
    Ok(())
}

pub fn refresh_pending() {
    let n = DbManager::with_connection(|conn| pending_count(conn).map_err(|e| e.to_string()))
        .unwrap_or(0);
    with_state(|s| s.pending = n);
}

/// Autostart al levantar la app si estaba habilitado.
pub fn try_autostart() {
    let role = DbManager::with_connection(|conn| {
        use crate::settings_util::{read_setting_flag, read_setting_or};
        if !read_setting_flag(conn, "lan_sync_enabled") {
            return Ok("off".to_string());
        }
        Ok(read_setting_or(conn, "lan_sync_role", "off"))
    })
    .unwrap_or_else(|_| "off".into());

    match role.as_str() {
        "server" => {
            if let Err(e) = start_server() {
                super::state::set_error(e.to_string());
            }
        }
        "client" => {
            if let Err(e) = start_client() {
                super::state::set_error(e.to_string());
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::super::conflict::{ConflictPolicy, LamportDeviceWins};

    #[test]
    fn engine_conflict_smoke() {
        let p = LamportDeviceWins;
        assert!(p.should_accept_remote(2, "b", Some("b"), 1, Some("a"), Some("a")));
    }
}
