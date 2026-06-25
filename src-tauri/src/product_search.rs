use rusqlite::{params, params_from_iter, Connection};

const FTS_DDL: &str = r#"
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
    name,
    barcode,
    sku,
    tokenize='unicode61 remove_diacritics 2'
);
"#;

/// Reconstruye el índice FTS5 desde la tabla products (solo activos).
pub fn rebuild_products_fts(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM products_fts", [])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO products_fts(rowid, name, barcode, sku)
         SELECT id, name, COALESCE(barcode, ''), COALESCE(sku, '')
         FROM products WHERE active = 1",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Recrea la tabla FTS autónoma (sin content= ni triggers).
pub fn recreate_products_fts(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "DROP TRIGGER IF EXISTS products_fts_ai;
         DROP TRIGGER IF EXISTS products_fts_ad;
         DROP TRIGGER IF EXISTS products_fts_au;
         DROP TABLE IF EXISTS products_fts;",
    )
    .map_err(|e| e.to_string())?;
    conn.execute_batch(FTS_DDL).map_err(|e| e.to_string())?;
    rebuild_products_fts(conn)
}

pub fn rebuild_products_fts_safe(conn: &Connection) -> Result<(), String> {
    if rebuild_products_fts(conn).is_err() {
        recreate_products_fts(conn)?;
    }
    Ok(())
}

fn upsert_product_fts(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM products_fts WHERE rowid = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO products_fts(rowid, name, barcode, sku)
         SELECT id, name, COALESCE(barcode, ''), COALESCE(sku, '')
         FROM products WHERE id = ?1 AND active = 1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sincroniza el índice FTS para productos creados o editados desde JS.
pub fn sync_products_fts_ids(conn: &Connection, ids: &[i64]) -> Result<(), String> {
    for id in ids {
        upsert_product_fts(conn, *id)?;
    }
    Ok(())
}

/// Quita filas del índice al desactivar productos (dentro de la misma transacción).
pub fn sync_fts_deactivated_ids(conn: &Connection, ids: &[i64]) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{i}")).collect();
    let sql = format!(
        "DELETE FROM products_fts WHERE rowid IN ({})",
        placeholders.join(",")
    );
    conn.execute(&sql, params_from_iter(ids.iter()))
        .map_err(|e| e.to_string())?;
    Ok(())
}
