//! Reconcilia `products.stock` con `stock_movements` y garantiza `sync_id` de catálogo.
//!
//! El catálogo importado solía setear `products.stock` sin movimiento: las cajas
//! recibían el producto en 0. Acá se inserta el delta faltante (sin tocar el stock
//! local) para que el trigger CDC lo encole.
//!
//! Además: productos/categorías/etc. importados **antes** de activar Sync LAN
//! quedaban con `sync_id` NULL. El snapshot inventaba `imported-prod-{id}` solo
//! en la caja, y el hub al materializar asignaba otro UUID → movimientos y
//! precios no aplicaban (Dependency / identidad rota).

use rusqlite::Connection;

use super::errors::{LanResult, LanSyncError};

/// Asigna `sync_id` estable a filas de catálogo que todavía no tienen.
///
/// Usa el mismo esquema que el import de snapshot (`imported-prod-{id}`, etc.)
/// para no romper cajas que ya importaron con ese fallback.
pub fn ensure_catalog_sync_ids(conn: &Connection) -> LanResult<u64> {
    let mut n = 0u64;
    // Products / categories / suppliers / customers / brands
    for (table, prefix) in [
        ("products", "imported-prod-"),
        ("categories", "imported-cat-"),
        ("suppliers", "imported-sup-"),
        ("customers", "imported-cust-"),
        ("brands", "imported-brand-"),
    ] {
        if !table_has_column(conn, table, "sync_id") {
            continue;
        }
        let sql = format!(
            "UPDATE {table}
             SET sync_id = '{prefix}' || id
             WHERE sync_id IS NULL OR TRIM(sync_id) = ''"
        );
        n += conn.execute(&sql, []).map_err(LanSyncError::db)? as u64;
    }
    Ok(n)
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> bool {
    let mut stmt = match conn.prepare(&format!("PRAGMA table_info({table})")) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let rows = stmt.query_map([], |r| r.get::<_, String>(1));
    let Ok(rows) = rows else {
        return false;
    };
    for row in rows.flatten() {
        if row == column {
            return true;
        }
    }
    false
}

/// Inserta un `stock_movement` por cada producto cuyo stock no cuadra con la suma
/// de movimientos. Idempotente: si ya cuadra, no inserta nada.
pub fn reconcile_stock_movements_for_lan(conn: &Connection) -> LanResult<u64> {
    // Identidad primero: sin sync_id el outbox no puede armar product_sync_id.
    let _ = ensure_catalog_sync_ids(conn)?;
    let n = conn
        .execute(
            "INSERT INTO stock_movements
               (product_id, movement_type, qty, reference_type, reference_id, sync_id)
             SELECT
               p.id,
               'adjustment',
               (p.stock - COALESCE((
                  SELECT SUM(m.qty) FROM stock_movements m WHERE m.product_id = p.id
               ), 0)),
               'catalog_stock_seed',
               p.id,
               lower(hex(randomblob(16)))
             FROM products p
             WHERE p.active = 1
               AND ABS(
                 p.stock - COALESCE((
                   SELECT SUM(m.qty) FROM stock_movements m WHERE m.product_id = p.id
                 ), 0)
               ) > 0.0001",
            [],
        )
        .map_err(LanSyncError::db)? as u64;
    Ok(n)
}

/// Reparación one-shot v2: identidad de catálogo + gaps de stock.
/// Se dispara con flag distinto a v1 para PCs que ya corrieron el seed viejo
/// sin backfill de sync_id.
pub fn repair_catalog_for_lan_v2(conn: &Connection) -> LanResult<(u64, u64)> {
    let ids = ensure_catalog_sync_ids(conn)?;
    let movs = reconcile_stock_movements_for_lan(conn)?;
    Ok((ids, movs))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE products (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              stock REAL NOT NULL DEFAULT 0,
              active INTEGER NOT NULL DEFAULT 1,
              sync_id TEXT
            );
            CREATE TABLE categories (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              sync_id TEXT
            );
            CREATE TABLE stock_movements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              product_id INTEGER NOT NULL,
              movement_type TEXT NOT NULL,
              qty REAL NOT NULL,
              reference_type TEXT,
              reference_id INTEGER,
              sync_id TEXT
            );
            ",
        )
        .unwrap();
        conn
    }

    #[test]
    fn seeds_import_gap_without_changing_local_stock() {
        let conn = setup();
        conn.execute(
            "INSERT INTO products (name, stock) VALUES ('Catálogo A', 10)",
            [],
        )
        .unwrap();
        let n = reconcile_stock_movements_for_lan(&conn).unwrap();
        assert_eq!(n, 1);
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert!((stock - 10.0).abs() < f64::EPSILON);
        let qty: f64 = conn
            .query_row("SELECT qty FROM stock_movements WHERE product_id=1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert!((qty - 10.0).abs() < f64::EPSILON);
        assert_eq!(reconcile_stock_movements_for_lan(&conn).unwrap(), 0);
    }

    #[test]
    fn reconciles_after_sale_without_initial_seed() {
        let conn = setup();
        conn.execute(
            "INSERT INTO products (name, stock) VALUES ('Catálogo B', 8)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO stock_movements (product_id, movement_type, qty, sync_id)
             VALUES (1, 'sale', -2, 'sale1')",
            [],
        )
        .unwrap();
        let n = reconcile_stock_movements_for_lan(&conn).unwrap();
        assert_eq!(n, 1);
        let seed: f64 = conn
            .query_row(
                "SELECT qty FROM stock_movements WHERE reference_type='catalog_stock_seed'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!((seed - 10.0).abs() < f64::EPSILON);
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert!((stock - 8.0).abs() < f64::EPSILON);
    }

    #[test]
    fn skips_when_already_consistent() {
        let conn = setup();
        conn.execute(
            "INSERT INTO products (name, stock) VALUES ('Manual', 5)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO stock_movements (product_id, movement_type, qty, sync_id)
             VALUES (1, 'adjustment', 5, 'create1')",
            [],
        )
        .unwrap();
        assert_eq!(reconcile_stock_movements_for_lan(&conn).unwrap(), 0);
    }

    #[test]
    fn backfills_null_sync_ids_like_snapshot_fallback() {
        let conn = setup();
        conn.execute(
            "INSERT INTO products (name, stock) VALUES ('Sin id', 3)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO categories (name) VALUES ('Golosinas')",
            [],
        )
        .unwrap();
        let n = ensure_catalog_sync_ids(&conn).unwrap();
        assert!(n >= 2);
        let psid: String = conn
            .query_row("SELECT sync_id FROM products WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(psid, "imported-prod-1");
        let csid: String = conn
            .query_row("SELECT sync_id FROM categories WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(csid, "imported-cat-1");
        assert_eq!(ensure_catalog_sync_ids(&conn).unwrap(), 0);
    }
}
