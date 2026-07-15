//! Tests P6: anulación restaura product_batches al estado previo.

#[cfg(test)]
mod batch_void_tests {
    use rusqlite::{params, Connection};

    /// Simula deduct FIFO + restore desde movimientos (misma lógica que stock.ts).
    fn deduct_fifo(conn: &Connection, product_id: i64, qty: f64, sale_id: i64) {
        let mut remaining = qty;
        let mut stmt = conn
            .prepare(
                "SELECT id, qty FROM product_batches WHERE product_id=?1 AND qty>0
                 ORDER BY CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at ASC",
            )
            .unwrap();
        let batches: Vec<(i64, f64)> = stmt
            .query_map([product_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        for (bid, bqty) in batches {
            if remaining <= 0.0 {
                break;
            }
            let take = remaining.min(bqty);
            conn.execute(
                "UPDATE product_batches SET qty = qty - ?1 WHERE id = ?2",
                params![take, bid],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO stock_movements (product_id, batch_id, movement_type, qty, reference_type, reference_id)
                 VALUES (?1,?2,'sale',?3,'sale',?4)",
                params![product_id, bid, -take, sale_id],
            )
            .unwrap();
            remaining -= take;
        }
        conn.execute(
            "UPDATE products SET stock = (SELECT COALESCE(SUM(qty),0) FROM product_batches WHERE product_id=?1) WHERE id=?1",
            [product_id],
        )
        .unwrap();
    }

    fn restore_from_sale_movements(conn: &Connection, product_id: i64, qty: f64, sale_id: i64) {
        let mut stmt = conn
            .prepare(
                "SELECT batch_id, ABS(qty) FROM stock_movements
                 WHERE product_id=?1 AND reference_type='sale' AND reference_id=?2
                   AND batch_id IS NOT NULL AND qty < 0
                 ORDER BY id ASC",
            )
            .unwrap();
        let rows: Vec<(i64, f64)> = stmt
            .query_map(params![product_id, sale_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        let mut restored = 0.0;
        for (bid, q) in rows {
            if restored >= qty {
                break;
            }
            let give = (qty - restored).min(q);
            conn.execute(
                "UPDATE product_batches SET qty = qty + ?1 WHERE id = ?2",
                params![give, bid],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO stock_movements (product_id, batch_id, movement_type, qty, reference_type, reference_id)
                 VALUES (?1,?2,'void',?3,'sale_void',?4)",
                params![product_id, bid, give, sale_id],
            )
            .unwrap();
            restored += give;
        }
        conn.execute(
            "UPDATE products SET stock = (SELECT COALESCE(SUM(qty),0) FROM product_batches WHERE product_id=?1) WHERE id=?1",
            [product_id],
        )
        .unwrap();
    }

    #[test]
    fn p6_void_restores_exact_batch_quantities() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, stock REAL, track_batches INTEGER);
            CREATE TABLE product_batches (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              product_id INTEGER, qty REAL, expires_at TEXT
            );
            CREATE TABLE stock_movements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              product_id INTEGER, batch_id INTEGER,
              movement_type TEXT, qty REAL,
              reference_type TEXT, reference_id INTEGER
            );
            INSERT INTO products VALUES (1,'Leche',15,1);
            INSERT INTO product_batches (product_id, qty, expires_at) VALUES
              (1, 10, '2026-08-01'),
              (1, 5, '2026-09-01');
            ",
        )
        .unwrap();

        deduct_fifo(&conn, 1, 12.0, 99);
        // FIFO: -10 del lote1, -2 del lote2 → quedan 0 y 3
        let b1: f64 = conn
            .query_row("SELECT qty FROM product_batches WHERE id=1", [], |r| r.get(0))
            .unwrap();
        let b2: f64 = conn
            .query_row("SELECT qty FROM product_batches WHERE id=2", [], |r| r.get(0))
            .unwrap();
        assert!((b1 - 0.0).abs() < f64::EPSILON);
        assert!((b2 - 3.0).abs() < f64::EPSILON);

        restore_from_sale_movements(&conn, 1, 12.0, 99);
        let b1r: f64 = conn
            .query_row("SELECT qty FROM product_batches WHERE id=1", [], |r| r.get(0))
            .unwrap();
        let b2r: f64 = conn
            .query_row("SELECT qty FROM product_batches WHERE id=2", [], |r| r.get(0))
            .unwrap();
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert!((b1r - 10.0).abs() < f64::EPSILON, "lote1={b1r}");
        assert!((b2r - 5.0).abs() < f64::EPSILON, "lote2={b2r}");
        assert!((stock - 15.0).abs() < f64::EPSILON);
    }
}
