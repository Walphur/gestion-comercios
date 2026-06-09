use crate::database::open_exclusive;
use crate::product_search;
use rusqlite::{params, Connection};
use serde::Serialize;

const BATCH_SIZE: i64 = 2000;

#[derive(Serialize)]
pub struct CatalogProductCounts {
    pub supermarket: u32,
    /// Siempre 0: ya no se mezclan importaciones Excel con el catálogo masivo.
    pub legacy: u32,
}

#[derive(Serialize)]
pub struct RecoverableProductCounts {
    pub inactive_imports: u32,
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
    Ok(CatalogProductCounts {
        supermarket: supermarket as u32,
        legacy: 0,
    })
}

pub fn count_recoverable_products() -> Result<RecoverableProductCounts, String> {
    let conn = open_exclusive()?;
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM products
             WHERE active = 0
             AND COALESCE(catalog_source, '') NOT IN ('demo', 'supermarket')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(RecoverableProductCounts {
        inactive_imports: n as u32,
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

/// Solo quita el catálogo masivo (~190k). Nunca toca Excel/CSV ni productos cargados a mano.
pub fn remove_supermarket_catalog_safe(
    _include_legacy: bool,
    _demo_barcodes: &[&str],
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

    tx.commit().map_err(|e| e.to_string())?;

    product_search::rebuild_products_fts(&conn)?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| e.to_string())?;

    Ok(total)
}

/// Recupera productos desactivados por error (p. ej. «Quitar catálogo» borró un Excel).
pub fn reactivate_import_products() -> Result<u32, String> {
    let conn = open_for_maintenance()?;
    let n = conn
        .execute(
            "UPDATE products SET active = 1,
                    catalog_source = CASE
                      WHEN catalog_source IS NULL OR trim(catalog_source) = '' THEN 'import'
                      ELSE catalog_source
                    END,
                    updated_at = datetime('now','localtime')
             WHERE active = 0
             AND COALESCE(catalog_source, '') NOT IN ('demo', 'supermarket')",
            [],
        )
        .map_err(|e| e.to_string())? as u32;
    if n > 0 {
        product_search::rebuild_products_fts(&conn)?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| e.to_string())?;
    }
    Ok(n)
}
