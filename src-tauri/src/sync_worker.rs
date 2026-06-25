use crate::connectivity::is_online;
use crate::db_manager::DbManager;
use crate::fiscal::{persist_fiscal_result, request_fiscal_invoice};
use rusqlite::{params, Connection};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::thread;
use std::time::Duration;

static WORKER_RUNNING: AtomicBool = AtomicBool::new(false);
static ONLINE_FLAG: AtomicBool = AtomicBool::new(false);
static PENDING_COUNT: AtomicU32 = AtomicU32::new(0);

pub struct SyncStatus {
    pub online: bool,
    pub pending_count: u32,
    pub worker_active: bool,
}

pub fn get_sync_status() -> SyncStatus {
    SyncStatus {
        online: ONLINE_FLAG.load(Ordering::Relaxed),
        pending_count: PENDING_COUNT.load(Ordering::Relaxed),
        worker_active: WORKER_RUNNING.load(Ordering::Relaxed),
    }
}

pub fn spawn_sync_worker(interval_secs: u64) {
    if WORKER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    thread::spawn(move || {
        // Espera a que el plugin SQL cree/migre la base en el primer arranque.
        thread::sleep(Duration::from_secs(5));
        loop {
            let online = is_online();
            ONLINE_FLAG.store(online, Ordering::Relaxed);

            if online {
                if let Err(e) = process_pending_queue() {
                    eprintln!("[sync_worker] error: {e}");
                }
            }

            if let Ok(n) = count_pending() {
                PENDING_COUNT.store(n, Ordering::Relaxed);
            }

            thread::sleep(Duration::from_secs(interval_secs.max(5)));
        }
    });
}

fn count_pending() -> Result<u32, String> {
    DbManager::with_connection(|conn| {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_queue WHERE status = 'PENDING'",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(n as u32)
    })
}

fn process_pending_queue() -> Result<(), String> {
    DbManager::with_connection(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, entity_type, entity_id FROM sync_queue
                 WHERE status = 'PENDING' ORDER BY id ASC LIMIT 10",
            )
            .map_err(|e| e.to_string())?;

        let rows: Vec<(i64, String, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        for (queue_id, entity_type, entity_id) in rows {
            conn.execute(
                "UPDATE sync_queue SET status = 'PROCESSING', attempts = attempts + 1 WHERE id = ?1",
                [queue_id],
            )
            .map_err(|e| e.to_string())?;

            let result = match entity_type.as_str() {
                "fiscal_invoice" => process_fiscal(conn, entity_id),
                other => Err(format!("Tipo de cola desconocido: {other}")),
            };

            match result {
                Ok(()) => {
                    conn.execute(
                        "UPDATE sync_queue SET status = 'COMPLETED', processed_at = datetime('now','localtime'), last_error = NULL WHERE id = ?1",
                        [queue_id],
                    )
                    .map_err(|e| e.to_string())?;
                }
                Err(err) => {
                    conn.execute(
                        "UPDATE sync_queue SET status = 'FAILED', last_error = ?2, processed_at = datetime('now','localtime') WHERE id = ?1",
                        params![queue_id, err],
                    )
                    .map_err(|e| e.to_string())?;
                    conn.execute(
                        "UPDATE sales SET fiscal_status = 'failed' WHERE id = ?1",
                        [entity_id],
                    )
                    .ok();
                }
            }
        }

        Ok(())
    })
}

fn process_fiscal(conn: &Connection, sale_id: i64) -> Result<(), String> {
    let fiscal = request_fiscal_invoice(conn, sale_id)?;
    persist_fiscal_result(conn, sale_id, &fiscal)?;
    Ok(())
}

/// Encola facturación electrónica para una venta (llamado desde comando Tauri / venta).
pub fn enqueue_fiscal_invoice(sale_id: i64) -> Result<(), String> {
    DbManager::with_connection(|conn| {
        let payload = serde_json::json!({ "sale_id": sale_id }).to_string();

        conn.execute(
            "INSERT INTO sync_queue (entity_type, entity_id, payload, status) VALUES ('fiscal_invoice', ?1, ?2, 'PENDING')",
            params![sale_id, payload],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE sales SET requires_fiscal = 1, fiscal_status = 'pending' WHERE id = ?1",
            [sale_id],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    })?;
    PENDING_COUNT.fetch_add(1, Ordering::Relaxed);
    Ok(())
}
