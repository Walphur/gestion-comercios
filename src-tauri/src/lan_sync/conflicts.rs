//! Cola de conflictos Sync LAN — no detiene la sincronización.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::errors::{LanResult, LanSyncError};
use super::protocol::SyncEvent;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictRow {
    pub id: i64,
    pub event_id: String,
    pub entity_type: String,
    pub entity_sync_id: String,
    pub op: String,
    pub payload: Option<String>,
    pub lamport: i64,
    pub origin_device: String,
    pub created_at: String,
    pub reason: String,
    pub status: String,
}

pub fn park_conflict(conn: &Connection, event: &SyncEvent, reason: &str) -> LanResult<()> {
    let payload = serde_json::to_string(&event.payload)?;
    conn.execute(
        "INSERT INTO lan_sync_conflicts
         (event_id, entity_type, entity_sync_id, op, payload, lamport, origin_device, created_at, reason, status)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'open')
         ON CONFLICT(event_id) DO UPDATE SET
           reason = excluded.reason,
           status = 'open',
           resolved_at = NULL,
           resolution = NULL",
        params![
            event.event_id,
            event.entity_type,
            event.entity_sync_id,
            event.op,
            payload,
            event.lamport,
            event.origin_device,
            event.created_at,
            reason,
        ],
    )
    .map_err(LanSyncError::db)?;
    Ok(())
}

pub fn list_open_conflicts(conn: &Connection, limit: i64) -> LanResult<Vec<ConflictRow>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, event_id, entity_type, entity_sync_id, op, payload, lamport,
                    origin_device, created_at, reason, status
             FROM lan_sync_conflicts
             WHERE status = 'open'
             ORDER BY id ASC
             LIMIT ?1",
        )
        .map_err(LanSyncError::db)?;
    let rows = stmt
        .query_map([limit], |r| {
            Ok(ConflictRow {
                id: r.get(0)?,
                event_id: r.get(1)?,
                entity_type: r.get(2)?,
                entity_sync_id: r.get(3)?,
                op: r.get(4)?,
                payload: r.get(5)?,
                lamport: r.get(6)?,
                origin_device: r.get(7)?,
                created_at: r.get(8)?,
                reason: r.get(9)?,
                status: r.get(10)?,
            })
        })
        .map_err(LanSyncError::db)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(LanSyncError::db)?);
    }
    Ok(out)
}

pub fn open_conflict_count(conn: &Connection) -> LanResult<u64> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM lan_sync_conflicts WHERE status = 'open'",
            [],
            |r| r.get(0),
        )
        .map_err(LanSyncError::db)?;
    Ok(n as u64)
}

pub fn load_conflict_event(conn: &Connection, conflict_id: i64) -> LanResult<Option<SyncEvent>> {
    let row: Option<(String, String, String, String, Option<String>, i64, String, String)> = conn
        .query_row(
            "SELECT event_id, entity_type, entity_sync_id, op, payload, lamport, origin_device, created_at
             FROM lan_sync_conflicts WHERE id = ?1 AND status = 'open'",
            [conflict_id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                ))
            },
        )
        .optional()
        .map_err(LanSyncError::db)?;
    let Some((event_id, entity_type, entity_sync_id, op, payload_str, lamport, origin, created)) =
        row
    else {
        return Ok(None);
    };
    let payload = payload_str
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(serde_json::Value::Null);
    Ok(Some(SyncEvent {
        event_id,
        entity_type,
        entity_sync_id,
        op,
        payload,
        lamport,
        origin_device: origin,
        created_at: created,
    }))
}

pub fn mark_conflict_resolved(conn: &Connection, conflict_id: i64, resolution: &str) -> LanResult<()> {
    conn.execute(
        "UPDATE lan_sync_conflicts
         SET status = 'resolved', resolved_at = datetime('now','localtime'), resolution = ?1
         WHERE id = ?2",
        params![resolution, conflict_id],
    )
    .map_err(LanSyncError::db)?;
    Ok(())
}

pub fn mark_conflict_discarded(conn: &Connection, conflict_id: i64) -> LanResult<()> {
    conn.execute(
        "UPDATE lan_sync_conflicts
         SET status = 'discarded', resolved_at = datetime('now','localtime'), resolution = 'discard_remote'
         WHERE id = ?1",
        [conflict_id],
    )
    .map_err(LanSyncError::db)?;
    Ok(())
}
