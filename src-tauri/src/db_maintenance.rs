use crate::db_manager::DbManager;
use crate::product_search::{rebuild_products_fts, sync_fts_deactivated_ids};
use rusqlite::{params, params_from_iter, Transaction};
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
    DbManager::with_connection(|conn| {
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
    })
}

pub fn count_recoverable_products() -> Result<RecoverableProductCounts, String> {
    DbManager::with_connection(|conn| {
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
    })
}

fn deactivate_supermarket_batch(tx: &Transaction<'_>, limit: i64) -> Result<u32, String> {
    let ids: Vec<i64> = tx
        .prepare(
            "SELECT id FROM products
             WHERE active = 1 AND catalog_source = 'supermarket'
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?
        .query_map(params![limit], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    if ids.is_empty() {
        return Ok(0);
    }

    let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{i}")).collect();
    let update_sql = format!(
        "UPDATE products SET active = 0, updated_at = datetime('now','localtime')
         WHERE id IN ({})",
        placeholders.join(",")
    );
    let n = tx
        .execute(&update_sql, params_from_iter(ids.iter()))
        .map_err(|e| e.to_string())? as u32;
    if n > 0 {
        sync_fts_deactivated_ids(tx, &ids)?;
    }
    Ok(n)
}

/// Solo quita el catálogo masivo (~190k). Nunca toca Excel/CSV ni productos cargados a mano.
pub fn remove_supermarket_catalog_safe(
    _include_legacy: bool,
    _demo_barcodes: &[&str],
) -> Result<u32, String> {
    let total = DbManager::with_transaction(|tx| {
        let mut total = 0u32;
        loop {
            let n = deactivate_supermarket_batch(tx, BATCH_SIZE)?;
            if n == 0 {
                break;
            }
            total += n;
        }
        Ok(total)
    })?;

    if total > 0 {
        DbManager::with_connection(|conn| rebuild_products_fts(conn))?;
    }
    Ok(total)
}

fn deactivate_product_chunk(tx: &Transaction<'_>, ids: &[i64]) -> Result<u32, String> {
    if ids.is_empty() {
        return Ok(0);
    }
    let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{i}")).collect();
    let sql = format!(
        "UPDATE products SET active = 0, updated_at = datetime('now','localtime')
         WHERE id IN ({}) AND active = 1",
        placeholders.join(",")
    );
    let n = tx
        .execute(&sql, params_from_iter(ids.iter()))
        .map_err(|e| e.to_string())? as u32;
    if n > 0 {
        sync_fts_deactivated_ids(tx, ids)?;
    }
    Ok(n)
}

/// Oculta productos del listado (borrado lógico) en una transacción atómica.
pub fn deactivate_products(ids: Vec<i64>) -> Result<u32, String> {
    if ids.is_empty() {
        return Ok(0);
    }
    DbManager::with_transaction(|tx| {
        let mut total = 0u32;
        for chunk in ids.chunks(400) {
            total += deactivate_product_chunk(tx, chunk)?;
        }
        Ok(total)
    })
}

/// Recupera productos desactivados por error (p. ej. «Quitar catálogo» borró un Excel).
pub fn reactivate_import_products() -> Result<u32, String> {
    let n = DbManager::with_transaction(|tx| {
        let n = tx
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
        Ok(n)
    })?;

    if n > 0 {
        DbManager::with_connection(|conn| rebuild_products_fts(conn))?;
    }
    Ok(n)
}
