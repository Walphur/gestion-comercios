//! Sync LAN — usuarios / empleados (mismo PIN y rol en todas las cajas).

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use super::conflict::{payload_updated_at, ConflictPolicy, LamportDeviceWins};
use super::errors::{LanResult, LanSyncError};
use super::protocol::SyncEvent;

fn accept_remote(
    event: &SyncEvent,
    local_lp: i64,
    local_origin: Option<&str>,
    local_ua: Option<&str>,
    remote_ua: Option<&str>,
) -> bool {
    LamportDeviceWins.should_accept_remote(
        event.lamport,
        &event.origin_device,
        remote_ua,
        local_lp,
        local_origin,
        local_ua,
    )
}

pub fn build_user(conn: &Connection, sync_id: &str) -> LanResult<Value> {
    conn.query_row(
        "SELECT sync_id, username, display_name, role, pin, active, created_at, updated_at
         FROM users WHERE sync_id = ?1",
        [sync_id],
        |r| {
            Ok(json!({
                "sync_id": r.get::<_, String>(0)?,
                "username": r.get::<_, String>(1)?,
                "display_name": r.get::<_, String>(2)?,
                "role": r.get::<_, String>(3)?,
                "pin": r.get::<_, String>(4)?,
                "active": r.get::<_, i64>(5)?,
                "created_at": r.get::<_, Option<String>>(6)?,
                "updated_at": r.get::<_, Option<String>>(7)?,
            }))
        },
    )
    .optional()
    .map_err(LanSyncError::db)?
    .ok_or_else(|| LanSyncError::Database(format!("user sync_id={sync_id} no encontrado")))
}

pub fn apply_user(conn: &Connection, event: &SyncEvent) -> LanResult<()> {
    let p = &event.payload;
    let username = p
        .get("username")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_lowercase();
    if username.is_empty() {
        return Err(LanSyncError::Protocol("user sin username".into()));
    }
    let display_name = p
        .get("display_name")
        .and_then(|v| v.as_str())
        .unwrap_or(username.as_str());
    let role = p.get("role").and_then(|v| v.as_str()).unwrap_or("cashier");
    let pin = p.get("pin").and_then(|v| v.as_str()).unwrap_or("0000");
    let active = p.get("active").and_then(|v| v.as_i64()).unwrap_or(1);
    let updated_at = payload_updated_at(p);
    let created_at = p.get("created_at").and_then(|v| v.as_str());

    let existing: Option<(i64, Option<String>, i64, Option<String>)> = conn
        .query_row(
            "SELECT id, updated_at, COALESCE(sync_lamport, 0), sync_origin
             FROM users WHERE sync_id = ?1",
            [&event.entity_sync_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    if let Some((id, local_ua, local_lp, local_origin)) = existing {
        if !accept_remote(
            event,
            local_lp,
            local_origin.as_deref(),
            local_ua.as_deref(),
            updated_at,
        ) {
            return Ok(());
        }
        // No desactivar el admin local id=1 si llega active=0 remoto por error.
        let active_final = if id == 1 && active == 0 { 1 } else { active };
        conn.execute(
            "UPDATE users SET username = ?1, display_name = ?2, role = ?3, pin = ?4, active = ?5,
             updated_at = COALESCE(?6, datetime('now','localtime')),
             sync_lamport = ?7, sync_origin = ?8
             WHERE id = ?9",
            params![
                username,
                display_name,
                role,
                pin,
                active_final,
                updated_at,
                event.lamport,
                event.origin_device,
                id
            ],
        )
        .map_err(LanSyncError::db)?;
        return Ok(());
    }

    // Unificar por username (admin/cajero seed en cada PC).
    let by_name: Option<(i64, Option<String>, i64, Option<String>)> = conn
        .query_row(
            "SELECT id, updated_at, COALESCE(sync_lamport, 0), sync_origin
             FROM users WHERE lower(username) = ?1",
            [&username],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(LanSyncError::db)?;

    if let Some((id, local_ua, local_lp, local_origin)) = by_name {
        if !accept_remote(
            event,
            local_lp,
            local_origin.as_deref(),
            local_ua.as_deref(),
            updated_at,
        ) {
            // Igual adoptamos sync_id para no duplicar.
            conn.execute(
                "UPDATE users SET sync_id = ?1 WHERE id = ?2 AND (sync_id IS NULL OR sync_id = '' OR sync_id != ?1)",
                params![event.entity_sync_id, id],
            )
            .map_err(LanSyncError::db)?;
            return Ok(());
        }
        let active_final = if id == 1 && active == 0 { 1 } else { active };
        conn.execute(
            "UPDATE users SET sync_id = ?1, display_name = ?2, role = ?3, pin = ?4, active = ?5,
             updated_at = COALESCE(?6, datetime('now','localtime')),
             sync_lamport = ?7, sync_origin = ?8
             WHERE id = ?9",
            params![
                event.entity_sync_id,
                display_name,
                role,
                pin,
                active_final,
                updated_at,
                event.lamport,
                event.origin_device,
                id
            ],
        )
        .map_err(LanSyncError::db)?;
        return Ok(());
    }

    conn.execute(
        "INSERT INTO users (username, display_name, role, pin, active, sync_id, created_at, updated_at,
         sync_lamport, sync_origin)
         VALUES (?1,?2,?3,?4,?5,?6,
                 COALESCE(?7, datetime('now','localtime')),
                 COALESCE(?8, datetime('now','localtime')), ?9, ?10)",
        params![
            username,
            display_name,
            role,
            pin,
            active,
            event.entity_sync_id,
            created_at,
            updated_at,
            event.lamport,
            event.origin_device
        ],
    )
    .map_err(LanSyncError::db)?;
    Ok(())
}

/// Encola usuarios existentes una vez (al iniciar servidor LAN).
pub fn enqueue_existing_users_once(conn: &Connection) -> LanResult<u64> {
    use crate::settings_util::{read_setting_flag, write_setting_flag};
    if read_setting_flag(conn, "lan_sync_users_enqueued") {
        return Ok(0);
    }
    let n = conn
        .execute(
            "UPDATE users SET pin = pin WHERE sync_id IS NOT NULL AND TRIM(sync_id) != ''",
            [],
        )
        .map_err(LanSyncError::db)? as u64;
    write_setting_flag(conn, "lan_sync_users_enqueued", true).map_err(LanSyncError::db)?;
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO settings VALUES ('lan_sync_applying','0');
            CREATE TABLE users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              display_name TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'cashier',
              pin TEXT NOT NULL,
              active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT,
              updated_at TEXT,
              sync_id TEXT UNIQUE,
              sync_lamport INTEGER DEFAULT 0,
              sync_origin TEXT
            );
            INSERT INTO users (id, username, display_name, role, pin, sync_id, updated_at)
            VALUES (1, 'admin', 'Administrador', 'admin', '1234', 'seed-user-admin', '2026-01-01');
            ",
        )
        .unwrap();
        conn
    }

    fn ev(payload: Value) -> SyncEvent {
        SyncEvent {
            event_id: "e1".into(),
            entity_type: "user".into(),
            entity_sync_id: payload["sync_id"].as_str().unwrap_or("u1").into(),
            op: "upsert".into(),
            payload,
            lamport: 5,
            origin_device: "caja2".into(),
            created_at: "2026-08-26".into(),
        }
    }

    #[test]
    fn merges_seed_admin_by_username_and_updates_pin() {
        let conn = setup();
        let event = ev(json!({
            "sync_id": "seed-user-admin",
            "username": "admin",
            "display_name": "Dueño",
            "role": "admin",
            "pin": "9999",
            "active": 1,
            "updated_at": "2026-08-26"
        }));
        apply_user(&conn, &event).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM users WHERE username='admin'", [], |r| r.get(0))
            .unwrap();
        let (pin, name): (String, String) = conn
            .query_row(
                "SELECT pin, display_name FROM users WHERE username='admin'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(pin, "9999");
        assert_eq!(name, "Dueño");
    }

    #[test]
    fn inserts_new_cashier() {
        let conn = setup();
        let event = ev(json!({
            "sync_id": "user-maria",
            "username": "maria",
            "display_name": "María",
            "role": "cashier",
            "pin": "4321",
            "active": 1,
            "updated_at": "2026-08-26"
        }));
        apply_user(&conn, &event).unwrap();
        let pin: String = conn
            .query_row("SELECT pin FROM users WHERE sync_id='user-maria'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(pin, "4321");
    }
}
