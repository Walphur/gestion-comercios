//! Production Hardening — pruebas que intentan romper ACK/Deferred/Conflict/cursor.

#[cfg(test)]
mod hardening {
    use rusqlite::{params, Connection};
    use serde_json::json;

    use crate::lan_sync::applier::{apply_event, status_is_ackable, ApplyStatus};
    use crate::lan_sync::outbox::{catchup_cursor, insert_event_store};
    use crate::lan_sync::protocol::SyncEvent;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO settings(key,value) VALUES
              ('lan_sync_applying','0'),
              ('lan_sync_lamport','0'),
              ('lan_sync_catchup_lamport','0'),
              ('lan_sync_catchup_event_id',''),
              ('lan_sync_device_id','caja1');
            CREATE TABLE products (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL, stock REAL NOT NULL DEFAULT 0,
              cost REAL DEFAULT 0, price REAL DEFAULT 0, min_stock REAL DEFAULT 0,
              unit TEXT DEFAULT 'unidad', tax_rate REAL DEFAULT 21, active INTEGER DEFAULT 1,
              sync_id TEXT UNIQUE, created_at TEXT, updated_at TEXT,
              sku TEXT, barcode TEXT, description TEXT,
              category_id INTEGER, supplier_id INTEGER,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_prod_barcode ON products(barcode)
              WHERE barcode IS NOT NULL AND barcode != '';
            CREATE TABLE stock_movements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              product_id INTEGER NOT NULL,
              movement_type TEXT NOT NULL,
              qty REAL NOT NULL,
              reference_type TEXT, reference_id INTEGER,
              sync_id TEXT UNIQUE, device_id TEXT, created_at TEXT
            );
            CREATE TABLE lan_sync_applied (
              event_id TEXT PRIMARY KEY,
              entity_type TEXT NOT NULL,
              applied_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE lan_sync_event_store (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              event_id TEXT NOT NULL UNIQUE,
              entity_type TEXT NOT NULL,
              entity_sync_id TEXT NOT NULL,
              op TEXT NOT NULL,
              payload TEXT,
              lamport INTEGER NOT NULL,
              origin_device TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE lan_sync_conflicts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              event_id TEXT NOT NULL UNIQUE,
              entity_type TEXT NOT NULL,
              entity_sync_id TEXT NOT NULL,
              op TEXT NOT NULL,
              payload TEXT,
              lamport INTEGER NOT NULL,
              origin_device TEXT NOT NULL,
              created_at TEXT NOT NULL,
              reason TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'open',
              resolved_at TEXT,
              resolution TEXT
            );
            CREATE TABLE lan_sync_pending_apply (
              event_id TEXT PRIMARY KEY,
              entity_type TEXT NOT NULL,
              entity_sync_id TEXT NOT NULL,
              op TEXT NOT NULL,
              payload TEXT,
              lamport INTEGER NOT NULL,
              origin_device TEXT NOT NULL,
              created_at TEXT NOT NULL,
              reason TEXT NOT NULL DEFAULT 'deferred',
              updated_at TEXT
            );
            CREATE TABLE categories (
              id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
              sync_id TEXT UNIQUE, created_at TEXT, updated_at TEXT,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE TABLE suppliers (
              id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
              phone TEXT, notes TEXT, sync_id TEXT UNIQUE, created_at TEXT, updated_at TEXT,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE TABLE customers (
              id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
              phone TEXT, document TEXT, email TEXT, credit_limit REAL DEFAULT 0,
              balance REAL DEFAULT 0, notes TEXT, active INTEGER DEFAULT 1,
              sync_id TEXT UNIQUE, created_at TEXT, updated_at TEXT,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE TABLE sales (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subtotal REAL, discount_pct REAL DEFAULT 0, total REAL,
              payment_method TEXT, paid REAL, change_due REAL,
              voided INTEGER DEFAULT 0, customer_id INTEGER,
              sync_id TEXT UNIQUE, created_at TEXT, updated_at TEXT, doc_number TEXT
            );
            CREATE TABLE sale_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sale_id INTEGER, product_id INTEGER, name TEXT,
              qty REAL, unit_price REAL, discount_pct REAL DEFAULT 0,
              line_total REAL, stock_qty REAL, sync_id TEXT UNIQUE
            );
            ",
        )
        .unwrap();
        conn
    }

    fn seed_product(conn: &Connection, sync_id: &str, stock: f64) {
        conn.execute(
            "INSERT INTO products (name, stock, price, sync_id, unit, tax_rate, active, cost, min_stock)
             VALUES ('P', ?1, 1, ?2, 'u', 21, 1, 0, 0)",
            params![stock, sync_id],
        )
        .unwrap();
    }

    fn mov(event_id: &str, product: &str, lamport: i64) -> SyncEvent {
        SyncEvent {
            event_id: event_id.into(),
            entity_type: "stock_movement".into(),
            entity_sync_id: format!("m-{event_id}"),
            op: "upsert".into(),
            payload: json!({
                "sync_id": format!("m-{event_id}"),
                "product_sync_id": product,
                "movement_type": "sale",
                "qty": -1.0,
                "device_id": "peer",
            }),
            lamport,
            origin_device: "peer".into(),
            created_at: "2026-07-14 12:00:00".into(),
        }
    }

    /// Simula política de ACK del cliente/servidor.
    fn ack_ids_for_batch(conn: &Connection, events: &[SyncEvent]) -> Vec<String> {
        let mut acked = Vec::new();
        for e in events {
            let st = apply_event(conn, e).unwrap();
            if status_is_ackable(st) {
                acked.push(e.event_id.clone());
            }
        }
        acked
    }

    #[test]
    fn p1_deferred_never_acked_and_cursor_stays() {
        let conn = setup();
        // Movimiento antes que producto → Deferred
        let deferred = mov("d1", "missing", 5);
        let acked = ack_ids_for_batch(&conn, &[deferred.clone()]);
        assert!(acked.is_empty(), "Deferred no debe ACKearse");
        assert_eq!(
            apply_event(&conn, &deferred).unwrap(),
            ApplyStatus::Deferred
        );
        let (cl, _) = catchup_cursor(&conn);
        assert_eq!(cl, 0, "cursor no avanza por Deferred");
        let applied: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM lan_sync_applied WHERE event_id='d1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(applied, 0);

        // Luego aparece el producto y el mismo evento se aplica
        seed_product(&conn, "missing", 10.0);
        assert_eq!(apply_event(&conn, &deferred).unwrap(), ApplyStatus::Applied);
        let (cl2, eid) = catchup_cursor(&conn);
        assert_eq!(cl2, 5);
        assert_eq!(eid, "d1");
    }

    #[test]
    fn p1_applied_after_deferred_does_not_skip_deferred_via_cursor() {
        let conn = setup();
        seed_product(&conn, "p1", 10.0);
        let deferred = mov("low", "missing", 3);
        let later = mov("high", "p1", 10);

        assert_eq!(apply_event(&conn, &deferred).unwrap(), ApplyStatus::Deferred);
        assert_eq!(apply_event(&conn, &later).unwrap(), ApplyStatus::Applied);

        let (cl, _) = catchup_cursor(&conn);
        // Cursor clampado antes del deferred (lamport 3) → catch-up lo vuelve a pedir.
        assert!(cl < 3, "cursor={cl} no debe saltar el Deferred");
        let pending: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM lan_sync_pending_apply WHERE event_id='low'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pending, 1);
    }

    #[test]
    fn p1_only_ack_applied_in_mixed_batch() {
        let conn = setup();
        seed_product(&conn, "ok", 5.0);
        let deferred = mov("x", "nope", 1);
        let ok = mov("y", "ok", 2);
        let acked = ack_ids_for_batch(&conn, &[deferred, ok]);
        assert_eq!(acked, vec!["y".to_string()]);
    }

    #[test]
    fn p2_conflict_not_applied_not_ackable_cursor_stays() {
        let conn = setup();
        seed_product(&conn, "p-a", 1.0);
        conn.execute(
            "UPDATE products SET barcode='779' WHERE sync_id='p-a'",
            [],
        )
        .unwrap();
        let conflict = SyncEvent {
            event_id: "c1".into(),
            entity_type: "product".into(),
            entity_sync_id: "p-b".into(),
            op: "upsert".into(),
            payload: json!({
                "name":"B","barcode":"779","price":2.0,
                "updated_at":"2026-07-14 13:00:00",
                "unit":"u","tax_rate":21,"active":1,"cost":0,"min_stock":0
            }),
            lamport: 7,
            origin_device: "peer".into(),
            created_at: "2026-07-14 13:00:00".into(),
        };
        let acked = ack_ids_for_batch(&conn, &[conflict.clone()]);
        assert!(acked.is_empty());
        assert!(!status_is_ackable(ApplyStatus::ConflictParked));
        let applied: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM lan_sync_applied WHERE event_id='c1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(applied, 0);
        let open: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM lan_sync_conflicts WHERE status='open'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(open, 1);
        let (cl, _) = catchup_cursor(&conn);
        assert_eq!(cl, 0);

        // Reentrega idempotente: sigue sin applied
        assert_eq!(
            apply_event(&conn, &conflict).unwrap(),
            ApplyStatus::ConflictParked
        );
        let open2: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM lan_sync_conflicts WHERE status='open'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(open2, 1);
    }

    #[test]
    fn p2_discard_marks_applied_then_ackable() {
        let conn = setup();
        seed_product(&conn, "p-a", 1.0);
        conn.execute(
            "UPDATE products SET barcode='779' WHERE sync_id='p-a'",
            [],
        )
        .unwrap();
        let conflict = SyncEvent {
            event_id: "c2".into(),
            entity_type: "product".into(),
            entity_sync_id: "p-b".into(),
            op: "upsert".into(),
            payload: json!({
                "name":"B","barcode":"779","price":2.0,
                "updated_at":"2026-07-14 13:00:00",
                "unit":"u","tax_rate":21,"active":1,"cost":0,"min_stock":0
            }),
            lamport: 2,
            origin_device: "peer".into(),
            created_at: "2026-07-14 13:00:00".into(),
        };
        assert_eq!(
            apply_event(&conn, &conflict).unwrap(),
            ApplyStatus::ConflictParked
        );
        // Descarte explícito (como UI)
        conn.execute(
            "INSERT OR IGNORE INTO lan_sync_applied (event_id, entity_type) VALUES ('c2','product')",
            [],
        )
        .unwrap();
        assert_eq!(
            apply_event(&conn, &conflict).unwrap(),
            ApplyStatus::AlreadyApplied
        );
        assert!(status_is_ackable(ApplyStatus::AlreadyApplied));
    }

    #[test]
    fn p5_sale_void_updates_existing_sale() {
        let conn = setup();
        let create = SyncEvent {
            event_id: "s1".into(),
            entity_type: "sale".into(),
            entity_sync_id: "sale-1".into(),
            op: "upsert".into(),
            payload: json!({
                "sync_id":"sale-1","subtotal":100,"discount_pct":0,"total":100,
                "payment_method":"efectivo","voided":0,
                "items":[{"sync_id":"i1","name":"X","qty":1,"unit_price":100,
                          "discount_pct":0,"line_total":100}]
            }),
            lamport: 1,
            origin_device: "peer".into(),
            created_at: "2026-07-14 12:00:00".into(),
        };
        assert_eq!(apply_event(&conn, &create).unwrap(), ApplyStatus::Applied);
        let void_ev = SyncEvent {
            event_id: "s1-void".into(),
            entity_type: "sale".into(),
            entity_sync_id: "sale-1".into(),
            op: "void".into(),
            payload: json!({
                "sync_id":"sale-1","subtotal":100,"discount_pct":0,"total":100,
                "payment_method":"efectivo","voided":1,
                "items":[{"sync_id":"i1","name":"X","qty":1,"unit_price":100,
                          "discount_pct":0,"line_total":100}]
            }),
            lamport: 2,
            origin_device: "peer".into(),
            created_at: "2026-07-14 12:01:00".into(),
        };
        assert_eq!(apply_event(&conn, &void_ev).unwrap(), ApplyStatus::Applied);
        let voided: i64 = conn
            .query_row(
                "SELECT voided FROM sales WHERE sync_id='sale-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(voided, 1);
    }

    #[test]
    fn p1_event_store_insert_only_when_ackable() {
        let conn = setup();
        let deferred = mov("z", "gone", 1);
        assert_eq!(apply_event(&conn, &deferred).unwrap(), ApplyStatus::Deferred);
        // Política server: no insertar deferred en event_store
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM lan_sync_event_store", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
        seed_product(&conn, "gone", 3.0);
        assert_eq!(apply_event(&conn, &deferred).unwrap(), ApplyStatus::Applied);
        insert_event_store(&conn, &deferred).unwrap();
        let n2: i64 = conn
            .query_row("SELECT COUNT(*) FROM lan_sync_event_store", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n2, 1);
    }
}
