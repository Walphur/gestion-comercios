//! Pruebas ACID: fallos a mitad de operación de venta → ROLLBACK completo.
//! Simula power-loss / excepción mid-write sin dejar registros parciales.

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection, OptionalExtension};

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO settings VALUES ('lan_sync_device_code','CJ01'), ('lan_sync_device_id','abcd');
            CREATE TABLE document_sequences (
              device_code TEXT NOT NULL, doc_type TEXT NOT NULL, next_value INTEGER NOT NULL DEFAULT 1,
              PRIMARY KEY (device_code, doc_type)
            );
            CREATE TABLE customers (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL, balance REAL NOT NULL DEFAULT 0, credit_limit REAL DEFAULT 0, active INTEGER DEFAULT 1
            );
            CREATE TABLE customer_balance_movements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sync_id TEXT NOT NULL UNIQUE,
              customer_id INTEGER NOT NULL,
              device_id TEXT NOT NULL,
              delta REAL NOT NULL,
              reason TEXT, reference_type TEXT, reference_id INTEGER
            );
            CREATE TABLE products (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL, stock REAL NOT NULL DEFAULT 0, active INTEGER DEFAULT 1
            );
            CREATE TABLE cash_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL
            );
            CREATE TABLE sales (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subtotal REAL, discount_pct REAL, total REAL,
              payment_method TEXT, paid REAL, change_due REAL,
              voided INTEGER DEFAULT 0, customer_id INTEGER,
              cash_session_id INTEGER, doc_number TEXT, user_id INTEGER
            );
            CREATE TABLE sale_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sale_id INTEGER NOT NULL, product_id INTEGER, name TEXT,
              qty REAL, unit_price REAL, discount_pct REAL, line_total REAL, stock_qty REAL
            );
            CREATE TABLE stock_movements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              product_id INTEGER NOT NULL, movement_type TEXT, qty REAL,
              reference_type TEXT, reference_id INTEGER, user_id INTEGER
            );
            CREATE TABLE cash_movements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              cash_session_id INTEGER, user_id INTEGER, type TEXT, amount REAL, concept TEXT
            );
            INSERT INTO cash_sessions(status) VALUES ('open');
            INSERT INTO products(name, stock) VALUES ('Gaseosa', 100);
            INSERT INTO customers(name, balance, credit_limit) VALUES ('Juan', 0, 10000);
            ",
        )
        .unwrap();
        conn
    }

    fn integrity_ok(conn: &Connection) {
        let s: String = conn
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .unwrap();
        assert_eq!(s, "ok");
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    /// Replica el patrón JS: BEGIN IMMEDIATE … trabajo … COMMIT / ROLLBACK.
    fn try_sale_with_fail_after(
        conn: &Connection,
        fail_after: &str,
    ) -> Result<(), String> {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

        // 1. Reservar número
        let next: i64 = tx
            .query_row(
                "SELECT next_value FROM document_sequences WHERE device_code='CJ01' AND doc_type='V'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or(1);
        tx.execute(
            "INSERT INTO document_sequences (device_code, doc_type, next_value) VALUES ('CJ01','V',?1)
             ON CONFLICT(device_code, doc_type) DO UPDATE SET next_value = excluded.next_value",
            [next + 1],
        )
        .map_err(|e| e.to_string())?;
        let doc = format!("CJ01-V-{next:08}");
        if fail_after == "doc_number" {
            return Err("simulated fail after doc_number".into());
        }

        // 2. Cabecera
        tx.execute(
            "INSERT INTO sales (subtotal, discount_pct, total, payment_method, paid, change_due,
             cash_session_id, customer_id, doc_number)
             VALUES (100,0,100,'fiado',NULL,NULL,1,1,?1)",
            [&doc],
        )
        .map_err(|e| e.to_string())?;
        let sale_id = tx.last_insert_rowid();
        if fail_after == "sale_header" {
            return Err("simulated fail after sale_header".into());
        }

        // 3. Ítem
        tx.execute(
            "INSERT INTO sale_items (sale_id, product_id, name, qty, unit_price, discount_pct, line_total, stock_qty)
             VALUES (?1, 1, 'Gaseosa', 1, 100, 0, 100, 1)",
            [sale_id],
        )
        .map_err(|e| e.to_string())?;
        if fail_after == "first_item" {
            return Err("simulated fail after first_item".into());
        }

        // 4. Stock
        tx.execute(
            "UPDATE products SET stock = stock - 1 WHERE id = 1",
            [],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id)
             VALUES (1,'sale',-1,'sale',?1)",
            [sale_id],
        )
        .map_err(|e| e.to_string())?;
        if fail_after == "stock" {
            return Err("simulated fail after stock".into());
        }

        // 5. Balance cliente
        tx.execute(
            "INSERT INTO customer_balance_movements (sync_id, customer_id, device_id, delta, reason, reference_type, reference_id)
             VALUES ('m1',1,'CJ01',100,'fiado','sale',?1)",
            [sale_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE customers SET balance = (
               SELECT COALESCE(SUM(delta),0) FROM customer_balance_movements WHERE customer_id=1
             ) WHERE id=1",
            [],
        )
        .map_err(|e| e.to_string())?;
        if fail_after == "customer" {
            return Err("simulated fail after customer".into());
        }

        // 6. Movimiento de caja (ingreso registro)
        tx.execute(
            "INSERT INTO cash_movements (cash_session_id, type, amount, concept)
             VALUES (1,'income',0,'venta')",
            [],
        )
        .map_err(|e| e.to_string())?;
        if fail_after == "cash" {
            return Err("simulated fail after cash".into());
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    fn assert_empty_business_state(conn: &Connection) {
        assert_eq!(count(conn, "SELECT COUNT(*) FROM sales"), 0);
        assert_eq!(count(conn, "SELECT COUNT(*) FROM sale_items"), 0);
        assert_eq!(count(conn, "SELECT COUNT(*) FROM stock_movements"), 0);
        assert_eq!(count(conn, "SELECT COUNT(*) FROM customer_balance_movements"), 0);
        assert_eq!(count(conn, "SELECT COUNT(*) FROM cash_movements"), 0);
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert!((stock - 100.0).abs() < f64::EPSILON);
        let bal: f64 = conn
            .query_row("SELECT balance FROM customers WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert!(bal.abs() < f64::EPSILON);
        integrity_ok(conn);
    }

    #[test]
    fn rollback_after_sale_header() {
        let conn = setup();
        assert!(try_sale_with_fail_after(&conn, "sale_header").is_err());
        assert_empty_business_state(&conn);
    }

    #[test]
    fn rollback_after_first_item() {
        let conn = setup();
        assert!(try_sale_with_fail_after(&conn, "first_item").is_err());
        assert_empty_business_state(&conn);
    }

    #[test]
    fn rollback_during_stock() {
        let conn = setup();
        assert!(try_sale_with_fail_after(&conn, "stock").is_err());
        assert_empty_business_state(&conn);
    }

    #[test]
    fn rollback_during_customer_balance() {
        let conn = setup();
        assert!(try_sale_with_fail_after(&conn, "customer").is_err());
        assert_empty_business_state(&conn);
    }

    #[test]
    fn rollback_during_cash() {
        let conn = setup();
        assert!(try_sale_with_fail_after(&conn, "cash").is_err());
        assert_empty_business_state(&conn);
    }

    #[test]
    fn commit_full_sale_leaves_consistent_state() {
        let conn = setup();
        try_sale_with_fail_after(&conn, "none").unwrap();
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM sales"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM sale_items"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM stock_movements"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM customer_balance_movements"), 1);
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert!((stock - 99.0).abs() < f64::EPSILON);
        let bal: f64 = conn
            .query_row("SELECT balance FROM customers WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert!((bal - 100.0).abs() < f64::EPSILON);
        integrity_ok(&conn);
    }

    #[test]
    fn dropped_tx_without_commit_is_rollback() {
        // Simula cierre inesperado del proceso: Transaction dropea sin commit.
        let conn = setup();
        {
            let tx = conn.unchecked_transaction().unwrap();
            tx.execute(
                "INSERT INTO sales (subtotal, discount_pct, total, payment_method, cash_session_id)
                 VALUES (50,0,50,'efectivo',1)",
                [],
            )
            .unwrap();
            tx.execute(
                "UPDATE products SET stock = stock - 5 WHERE id = 1",
                [],
            )
            .unwrap();
            // drop sin commit = rollback
        }
        assert_empty_business_state(&conn);
    }
}
