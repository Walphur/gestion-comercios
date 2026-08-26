//! Reconcilia `products.stock` con `stock_movements` para Sync LAN.
//!
//! El catálogo importado solía setear `products.stock` sin movimiento: las cajas
//! recibían el producto en 0. Acá se inserta el delta faltante (sin tocar el stock
//! local) para que el trigger CDC lo encole.

use rusqlite::Connection;

use super::errors::{LanResult, LanSyncError};

/// Inserta un `stock_movement` por cada producto cuyo stock no cuadra con la suma
/// de movimientos. Idempotente: si ya cuadra, no inserta nada.
pub fn reconcile_stock_movements_for_lan(conn: &Connection) -> LanResult<u64> {
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
              active INTEGER NOT NULL DEFAULT 1
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
}
