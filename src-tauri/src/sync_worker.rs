use crate::connectivity::is_online;
use crate::db_manager::DbManager;
use crate::fiscal::{
    persist_fiscal_result, request_fiscal_invoice, FiscalEnqueueOverride,
};
use rusqlite::params;
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
        thread::sleep(Duration::from_secs(5));

        let _ = DbManager::with_connection(|conn| {
            conn.execute(
                "UPDATE sync_queue SET status = 'PENDING' WHERE status = 'PROCESSING'",
                [],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        });

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
    let rows: Vec<(i64, String, i64, Option<String>)> = DbManager::with_connection(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, entity_type, entity_id, payload FROM sync_queue
                 WHERE status = 'PENDING' ORDER BY id ASC LIMIT 10",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    })?;

    for (queue_id, entity_type, entity_id, payload) in rows {
        DbManager::with_connection(|conn| {
            conn.execute(
                "UPDATE sync_queue SET status = 'PROCESSING', attempts = attempts + 1 WHERE id = ?1",
                [queue_id],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })?;

        let result = match entity_type.as_str() {
            "fiscal_invoice" => process_fiscal(entity_id, payload.as_deref()),
            other => Err(format!("Tipo de cola desconocido: {other}")),
        };

        match result {
            Ok(()) => {
                DbManager::with_connection(|conn| {
                    conn.execute(
                        "UPDATE sync_queue SET status = 'COMPLETED', processed_at = datetime('now','localtime'), last_error = NULL WHERE id = ?1",
                        [queue_id],
                    )
                    .map_err(|e| e.to_string())?;
                    Ok(())
                })?;
            }
            Err(err) => {
                DbManager::with_connection(|conn| {
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
                    Ok(())
                })?;
            }
        }
    }

    Ok(())
}

fn parse_override(payload: Option<&str>) -> FiscalEnqueueOverride {
    payload
        .and_then(|p| serde_json::from_str::<FiscalEnqueueOverride>(p).ok())
        .unwrap_or_default()
}

fn process_fiscal(sale_id: i64, payload: Option<&str>) -> Result<(), String> {
    let ov = parse_override(payload);
    let fiscal = request_fiscal_invoice(sale_id, ov.clone())?;
    persist_fiscal_result(sale_id, &fiscal, &ov)?;
    Ok(())
}

pub fn retry_failed_fiscal() -> Result<u32, String> {
    let n = DbManager::with_connection(|conn| {
        let n = conn
            .execute(
                "UPDATE sync_queue SET status = 'PENDING', last_error = NULL
                 WHERE entity_type = 'fiscal_invoice' AND status = 'FAILED'",
                [],
            )
            .map_err(|e| e.to_string())?;
        Ok(n as u32)
    })?;

    if n > 0 {
        PENDING_COUNT.fetch_add(n, Ordering::Relaxed);
    }
    Ok(n)
}

pub fn enqueue_fiscal_invoice(sale_id: i64) -> Result<(), String> {
    enqueue_fiscal_invoice_with(sale_id, FiscalEnqueueOverride::default())
}

pub fn enqueue_fiscal_invoice_with(
    sale_id: i64,
    ov: FiscalEnqueueOverride,
) -> Result<(), String> {
    let inserted = DbManager::with_connection(|conn| {
        let ya_encolado: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_queue
                 WHERE entity_type = 'fiscal_invoice' AND entity_id = ?1
                   AND status IN ('PENDING', 'PROCESSING')",
                [sale_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let inserted = if ya_encolado == 0 {
            let mut payload = serde_json::to_value(&ov).unwrap_or_else(|_| serde_json::json!({}));
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("sale_id".into(), serde_json::json!(sale_id));
            }
            let payload_str = payload.to_string();
            conn.execute(
                "INSERT INTO sync_queue (entity_type, entity_id, payload, status) VALUES ('fiscal_invoice', ?1, ?2, 'PENDING')",
                params![sale_id, payload_str],
            )
            .map_err(|e| e.to_string())?;
            true
        } else {
            false
        };

        conn.execute(
            "UPDATE sales SET requires_fiscal = 1, fiscal_status = 'pending' WHERE id = ?1",
            [sale_id],
        )
        .map_err(|e| e.to_string())?;

        Ok(inserted)
    })?;

    if inserted {
        PENDING_COUNT.fetch_add(1, Ordering::Relaxed);
    }
    Ok(())
}

/// Crea una venta de ajuste (NC/ND) y la encola contra el comprobante original.
pub fn emit_fiscal_adjustment(
    parent_sale_id: i64,
    kind: &str,
    amount: Option<f64>,
) -> Result<i64, String> {
    let kind = kind.trim().to_lowercase();
    if kind != "credit" && kind != "debit" {
        return Err("Tipo de ajuste inválido (credit|debit)".into());
    }

    let new_sale_id = DbManager::with_connection(|conn| {
        let (customer_id, total, user_id, payment): (Option<i64>, f64, Option<i64>, String) = conn
            .query_row(
                "SELECT customer_id, total, user_id, payment_method FROM sales
                 WHERE id = ?1 AND voided = 0",
                [parent_sale_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .map_err(|_| format!("Venta {parent_sale_id} no encontrada"))?;

        let has_cae: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM fiscal_documents
                 WHERE sale_id = ?1 AND cae IS NOT NULL AND TRIM(cae) != ''
                   AND (adjustment_kind IS NULL OR TRIM(COALESCE(adjustment_kind,'')) = '')",
                [parent_sale_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if has_cae == 0 {
            return Err("Esa venta no tiene factura con CAE para ajustar.".into());
        }

        let amt = amount.unwrap_or(total).abs();
        let note = if kind == "credit" {
            format!("Nota de crédito sobre venta #{parent_sale_id}")
        } else {
            format!("Nota de débito sobre venta #{parent_sale_id}")
        };

        conn.execute(
            "INSERT INTO sales (customer_id, user_id, subtotal, discount_pct, total, payment_method, note, requires_fiscal, fiscal_status)
             VALUES (?1, ?2, ?3, 0, ?3, ?4, ?5, 1, 'pending')",
            params![customer_id, user_id, amt, payment, note],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    })?;

    let ov = FiscalEnqueueOverride {
        parent_sale_id: Some(parent_sale_id),
        adjustment_kind: Some(kind),
        total: amount.map(|a| a.abs()),
        cbte_tipo: None,
    };
    enqueue_fiscal_invoice_with(new_sale_id, ov)?;
    Ok(new_sale_id)
}
