use rusqlite::Connection;

/// Reconstruye el índice FTS5 tras importaciones masivas.
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
