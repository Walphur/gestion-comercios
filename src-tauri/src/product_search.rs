use rusqlite::{params_from_iter, Connection};

const FTS_AU_TRIGGER: &str = r#"
CREATE TRIGGER IF NOT EXISTS products_fts_au AFTER UPDATE ON products
BEGIN
    INSERT INTO products_fts(products_fts, rowid, name, barcode, sku)
    VALUES ('delete', old.id, old.name, COALESCE(old.barcode, ''), COALESCE(old.sku, ''));
    INSERT INTO products_fts(rowid, name, barcode, sku)
    SELECT new.id, new.name, COALESCE(new.barcode, ''), COALESCE(new.sku, '')
    WHERE new.active = 1;
END;
"#;

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

pub fn recreate_products_fts(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "DROP TRIGGER IF EXISTS products_fts_ai;
         DROP TRIGGER IF EXISTS products_fts_ad;
         DROP TRIGGER IF EXISTS products_fts_au;
         DROP TABLE IF EXISTS products_fts;",
    )
    .map_err(|e| e.to_string())?;

    conn.execute_batch(
        "CREATE VIRTUAL TABLE products_fts USING fts5(
            name,
            barcode,
            sku,
            content='products',
            content_rowid='id',
            tokenize='unicode61 remove_diacritics 2'
        );",
    )
    .map_err(|e| e.to_string())?;

    conn.execute_batch(
        "CREATE TRIGGER products_fts_ai AFTER INSERT ON products
         WHEN new.active = 1
         BEGIN
             INSERT INTO products_fts(rowid, name, barcode, sku)
             VALUES (new.id, new.name, COALESCE(new.barcode, ''), COALESCE(new.sku, ''));
         END;
         CREATE TRIGGER products_fts_ad AFTER DELETE ON products
         BEGIN
             INSERT INTO products_fts(products_fts, rowid, name, barcode, sku)
             VALUES ('delete', old.id, old.name, COALESCE(old.barcode, ''), COALESCE(old.sku, ''));
         END;",
    )
    .map_err(|e| e.to_string())?;
    create_fts_au_trigger(conn)?;
    rebuild_products_fts(conn)
}

pub fn rebuild_products_fts_safe(conn: &Connection) -> Result<(), String> {
    if rebuild_products_fts(conn).is_err() {
        recreate_products_fts(conn)?;
    }
    Ok(())
}

pub fn create_fts_au_trigger(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(FTS_AU_TRIGGER)
        .map_err(|e| e.to_string())
}

pub fn drop_fts_au_trigger(conn: &Connection) -> Result<(), String> {
    conn.execute("DROP TRIGGER IF EXISTS products_fts_au", [])
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Quita filas del índice de búsqueda al desactivar productos.
pub fn sync_fts_deactivated_ids(conn: &Connection, ids: &[i64]) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{i}")).collect();
    let sql = format!(
        "DELETE FROM products_fts WHERE rowid IN ({})",
        placeholders.join(",")
    );
    if conn
        .execute(&sql, params_from_iter(ids.iter()))
        .is_err()
    {
        rebuild_products_fts_safe(conn)?;
    }
    Ok(())
}
