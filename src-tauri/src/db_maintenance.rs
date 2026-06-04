use crate::database::open_exclusive;
use crate::product_search;
use rusqlite::{params, Connection};
use serde::Serialize;

const BATCH_SIZE: i64 = 2000;

#[derive(Serialize)]
pub struct CatalogProductCounts {
    pub supermarket: u32,
    pub legacy: u32,
}

pub fn count_catalog_products() -> Result<CatalogProductCounts, String> {
    let conn = open_exclusive()?;
    let supermarket: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM products WHERE active = 1 AND catalog_source = 'supermarket'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let legacy: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM products WHERE active = 1 AND catalog_source IS NULL
             AND barcode IS NOT NULL AND length(trim(barcode)) >= 8",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(CatalogProductCounts {
        supermarket: supermarket as u32,
        legacy: legacy as u32,
    })
}

fn open_for_maintenance() -> Result<Connection, String> {
    open_exclusive()
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

    // Importaciones viejas sin catalog_source (ej. 229 productos de un Excel/CSV parcial).
    if include_legacy || total == 0 {
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
