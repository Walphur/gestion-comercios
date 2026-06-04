use crate::db_path::get_db_path;
use crate::product_search;
use rusqlite::{params, Connection};
use std::time::Duration;

const BATCH_SIZE: i64 = 2000;

fn open_for_maintenance() -> Result<Connection, String> {
    let path = get_db_path()?;
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    conn.busy_timeout(Duration::from_secs(120))
        .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA wal_checkpoint(TRUNCATE);
         PRAGMA synchronous=NORMAL;",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn deactivate_supermarket_batch(conn: &Connection) -> Result<u32, String> {
    let n = conn
        .execute(
            "UPDATE products SET active = 0, updated_at = datetime('now','localtime')
             WHERE id IN (
               SELECT id FROM products
               WHERE active = 1 AND catalog_source = 'supermarket'
               LIMIT ?1
             )",
            params![BATCH_SIZE],
        )
        .map_err(|e| e.to_string())? as u32;
    if n > 0 {
        conn.execute(
            "DELETE FROM products_fts WHERE rowid IN (
               SELECT id FROM products
               WHERE active = 0 AND catalog_source = 'supermarket'
             )",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(n)
}

fn deactivate_legacy_batch(conn: &Connection, demo_list: &str) -> Result<u32, String> {
    let sql = format!(
        "UPDATE products SET active = 0, updated_at = datetime('now','localtime')
         WHERE id IN (
           SELECT id FROM products
           WHERE active = 1 AND catalog_source IS NULL AND barcode IS NOT NULL
           AND barcode NOT IN ({demo_list})
           LIMIT {BATCH_SIZE}
         )"
    );
    let n = conn.execute(&sql, []).map_err(|e| e.to_string())? as u32;
    Ok(n)
}

/// Quita catálogo supermercado con transacción y lotes (evita bloquear/corromper la BD).
pub fn remove_supermarket_catalog_safe(
    include_legacy: bool,
    demo_barcodes: &[&str],
) -> Result<u32, String> {
    let conn = open_for_maintenance()?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;

    let mut total = 0u32;
    loop {
        let n = deactivate_supermarket_batch(&tx)?;
        if n == 0 {
            break;
        }
        total += n;
    }

    if include_legacy && total == 0 {
        let demo_list: String = demo_barcodes
            .iter()
            .map(|b| format!("'{b}'"))
            .collect::<Vec<_>>()
            .join(",");
        loop {
            let n = deactivate_legacy_batch(&tx, &demo_list)?;
            if n == 0 {
                break;
            }
            total += n;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    product_search::rebuild_products_fts(&conn)?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| e.to_string())?;

    Ok(total)
}
