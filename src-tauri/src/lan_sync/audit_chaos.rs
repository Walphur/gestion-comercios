//! Auditoría QA post-fixes — Sync LAN confiabilidad.
//! Objetivo: demostrar que los bugs críticos anteriores quedaron cerrados.

#[cfg(test)]
mod audit {
    use rusqlite::{params, Connection};
    use serde_json::json;

    use crate::lan_sync::applier::{apply_event, ApplyStatus};
    use crate::lan_sync::conflict::{ConflictPolicy, LamportDeviceWins};
    use crate::lan_sync::outbox::{list_event_store_all_since, list_event_store_page};
    use crate::lan_sync::protocol::SyncEvent;
    use crate::lan_sync::server::issue_token;

    fn setup_node(device: &str) -> Connection {
        let conn = Connection::open_in_memory().expect("mem db");
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO settings(key,value) VALUES
              ('lan_sync_applying','0'),
              ('lan_sync_lamport','0'),
              ('lan_sync_device_id','DEVICE');
            CREATE TABLE categories (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              sync_id TEXT UNIQUE, created_at TEXT, updated_at TEXT,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE TABLE suppliers (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              phone TEXT, notes TEXT,
              sync_id TEXT UNIQUE, created_at TEXT, updated_at TEXT,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE TABLE customers (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL, phone TEXT, document TEXT, email TEXT,
              credit_limit REAL DEFAULT 0, balance REAL DEFAULT 0,
              notes TEXT, active INTEGER DEFAULT 1,
              sync_id TEXT UNIQUE, created_at TEXT, updated_at TEXT,
              sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
            );
            CREATE TABLE customer_balance_movements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sync_id TEXT NOT NULL UNIQUE,
              customer_id INTEGER NOT NULL,
              device_id TEXT NOT NULL,
              delta REAL NOT NULL,
              reason TEXT, reference_type TEXT, reference_id INTEGER,
              created_at TEXT
            );
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
            CREATE TABLE sales (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subtotal REAL, discount_pct REAL DEFAULT 0, total REAL,
              payment_method TEXT, paid REAL, change_due REAL,
              voided INTEGER DEFAULT 0, customer_id INTEGER,
              sync_id TEXT UNIQUE, created_at TEXT, updated_at TEXT,
              doc_number TEXT
            );
            CREATE TABLE sale_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sale_id INTEGER, product_id INTEGER, name TEXT,
              qty REAL, unit_price REAL, discount_pct REAL DEFAULT 0,
              line_total REAL, stock_qty REAL, sync_id TEXT UNIQUE
            );
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
            CREATE TABLE lan_sync_outbox (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              event_id TEXT NOT NULL UNIQUE,
              entity_type TEXT NOT NULL,
              entity_sync_id TEXT NOT NULL,
              op TEXT NOT NULL,
              payload TEXT,
              lamport INTEGER NOT NULL DEFAULT 0,
              origin_device TEXT NOT NULL,
              created_at TEXT DEFAULT (datetime('now')),
              status TEXT NOT NULL DEFAULT 'pending',
              last_error TEXT,
              acked_at TEXT,
              entity_local_id INTEGER,
              attempt_count INTEGER DEFAULT 0,
              sending_at TEXT,
              next_retry_at TEXT
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
            ",
        )
        .unwrap();
        conn.execute(
            "UPDATE settings SET value = ?1 WHERE key = 'lan_sync_device_id'",
            [device],
        )
        .unwrap();
        conn
    }

    fn integrity_ok(conn: &Connection) {
        let s: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(s, "ok");
    }

    fn stock_of(conn: &Connection, sync_id: &str) -> f64 {
        conn.query_row(
            "SELECT stock FROM products WHERE sync_id = ?1",
            [sync_id],
            |r| r.get(0),
        )
        .unwrap()
    }

    fn seed_product(conn: &Connection, sync_id: &str, name: &str, stock: f64, price: f64) {
        conn.execute(
            "INSERT INTO products (name, stock, price, sync_id, updated_at, sync_lamport, sync_origin)
             VALUES (?1,?2,?3,?4,'2026-07-14 10:00:00',0,'seed')",
            params![name, stock, price, sync_id],
        )
        .unwrap();
    }

    fn ev_mov(mov_sync: &str, product_sync: &str, qty: f64, lamport: i64, device: &str) -> SyncEvent {
        SyncEvent {
            event_id: format!("e-{mov_sync}"),
            entity_type: "stock_movement".into(),
            entity_sync_id: mov_sync.into(),
            op: "upsert".into(),
            payload: json!({
                "product_sync_id": product_sync,
                "qty": qty,
                "movement_type": "sale",
                "device_id": device
            }),
            lamport,
            origin_device: device.into(),
            created_at: "2026-07-14 12:00:00".into(),
        }
    }

    fn ev_bal(
        mov_sync: &str,
        cust_sync: &str,
        delta: f64,
        lamport: i64,
        device: &str,
    ) -> SyncEvent {
        SyncEvent {
            event_id: format!("eb-{mov_sync}"),
            entity_type: "customer_balance_movement".into(),
            entity_sync_id: mov_sync.into(),
            op: "upsert".into(),
            payload: json!({
                "customer_sync_id": cust_sync,
                "delta": delta,
                "device_id": device,
                "reason": "fiado"
            }),
            lamport,
            origin_device: device.into(),
            created_at: "2026-07-14 12:00:00".into(),
        }
    }

    #[test]
    fn audit_stock_parallel_deltas_correct() {
        let oficina = setup_node("of");
        let caja1 = setup_node("c1");
        let caja2 = setup_node("c2");
        for c in [&oficina, &caja1, &caja2] {
            seed_product(c, "prod-qa", "Gaseosa", 100.0, 500.0);
        }
        let m1 = ev_mov("m1", "prod-qa", -20.0, 1, "c1");
        let m2 = ev_mov("m2", "prod-qa", -30.0, 2, "c2");
        let m3 = ev_mov("m3", "prod-qa", 50.0, 3, "of");
        for e in [&m1, &m2, &m3] {
            for c in [&oficina, &caja1, &caja2] {
                assert_eq!(apply_event(c, e).unwrap(), ApplyStatus::Applied);
            }
        }
        for c in [&oficina, &caja1, &caja2] {
            assert!((stock_of(c, "prod-qa") - 100.0).abs() < f64::EPSILON);
            integrity_ok(c);
        }
    }

    #[test]
    fn audit_balance_deltas_sum_to_1500() {
        let caja = setup_node("caja");
        caja.execute(
            "INSERT INTO customers (name, balance, sync_id) VALUES ('Juan', 0, 'cust1')",
            [],
        )
        .unwrap();
        assert_eq!(
            apply_event(&caja, &ev_bal("b1", "cust1", 1000.0, 1, "c1")).unwrap(),
            ApplyStatus::Applied
        );
        assert_eq!(
            apply_event(&caja, &ev_bal("b2", "cust1", 500.0, 2, "c2")).unwrap(),
            ApplyStatus::Applied
        );
        let bal: f64 = caja
            .query_row("SELECT balance FROM customers WHERE sync_id='cust1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(
            (bal - 1500.0).abs() < f64::EPSILON,
            "balance={bal}, esperado 1500"
        );
        integrity_ok(&caja);
    }

    #[test]
    fn audit_catchup_paginates_all_events() {
        let hub = setup_node("hub");
        for i in 1..=650 {
            let e = SyncEvent {
                event_id: format!("e{i}"),
                entity_type: "product".into(),
                entity_sync_id: format!("p{i}"),
                op: "upsert".into(),
                payload: json!({
                    "name": format!("P{i}"),
                    "price": 1.0,
                    "updated_at": "2026-07-14 12:00:00",
                    "unit": "u", "tax_rate": 21, "active": 1, "cost": 0, "min_stock": 0
                }),
                lamport: i,
                origin_device: "hub".into(),
                created_at: "2026-07-14 12:00:00".into(),
            };
            apply_event(&hub, &e).unwrap();
            crate::lan_sync::outbox::insert_event_store(&hub, &e).unwrap();
        }
        let page1 = list_event_store_page(&hub, 0, "", 200).unwrap();
        assert!(page1.has_more);
        assert_eq!(page1.events.len(), 200);
        let all = list_event_store_all_since(&hub, 0).unwrap();
        assert_eq!(all.len(), 650, "catch-up debe traer TODOS los eventos");
        integrity_ok(&hub);
    }

    #[test]
    fn audit_outbox_reclaim_sending_to_pending() {
        let conn = setup_node("c1");
        conn.execute(
            "INSERT INTO lan_sync_outbox
             (event_id, entity_type, entity_sync_id, op, lamport, origin_device, status, sending_at)
             VALUES ('e1','product','p1','upsert',1,'c1','sending', datetime('now','localtime','-120 seconds'))",
            [],
        )
        .unwrap();
        let n = crate::lan_sync::outbox::reclaim_stale_sending(&conn).unwrap();
        assert!(n >= 1);
        let st: String = conn
            .query_row(
                "SELECT status FROM lan_sync_outbox WHERE event_id='e1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(st, "pending");
    }

    #[test]
    fn audit_ack_idempotent() {
        let conn = setup_node("c1");
        conn.execute(
            "INSERT INTO lan_sync_outbox
             (event_id, entity_type, entity_sync_id, op, lamport, origin_device, status)
             VALUES ('e1','product','p1','upsert',1,'c1','sending')",
            [],
        )
        .unwrap();
        crate::lan_sync::outbox::mark_acked(&conn, &["e1".into()]).unwrap();
        crate::lan_sync::outbox::mark_acked(&conn, &["e1".into()]).unwrap();
        let st: String = conn
            .query_row(
                "SELECT status FROM lan_sync_outbox WHERE event_id='e1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(st, "acked");
    }

    #[test]
    fn audit_movement_before_product_deferred_then_ok() {
        let conn = setup_node("c1");
        let mov = ev_mov("mx", "later", -1.0, 1, "c1");
        assert_eq!(apply_event(&conn, &mov).unwrap(), ApplyStatus::Deferred);
        seed_product(&conn, "later", "X", 10.0, 1.0);
        assert_eq!(apply_event(&conn, &mov).unwrap(), ApplyStatus::Applied);
        assert!((stock_of(&conn, "later") - 9.0).abs() < f64::EPSILON);
    }

    #[test]
    fn audit_duplicate_barcode_goes_to_conflicts() {
        let conn = setup_node("c1");
        seed_product(&conn, "p-a", "A", 1.0, 1.0);
        conn.execute(
            "UPDATE products SET barcode='779000' WHERE sync_id='p-a'",
            [],
        )
        .unwrap();
        let e = SyncEvent {
            event_id: "dup".into(),
            entity_type: "product".into(),
            entity_sync_id: "p-b".into(),
            op: "upsert".into(),
            payload: json!({
                "name":"B","barcode":"779000","price":2.0,
                "updated_at":"2026-07-14 13:00:00",
                "unit":"u","tax_rate":21,"active":1,"cost":0,"min_stock":0
            }),
            lamport: 2,
            origin_device: "c2".into(),
            created_at: "2026-07-14 13:00:00".into(),
        };
        assert_eq!(apply_event(&conn, &e).unwrap(), ApplyStatus::ConflictParked);
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM lan_sync_conflicts WHERE status='open'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn audit_lamport_beats_wall_clock() {
        let p = LamportDeviceWins;
        // Reloj remoto "más nuevo" pero lamport menor → NO gana
        assert!(!p.should_accept_remote(
            5,
            "caja",
            Some("2099-01-01 00:00:00"),
            10,
            Some("of"),
            Some("2020-01-01 00:00:00")
        ));
        assert!(p.should_accept_remote(
            11,
            "caja",
            Some("2020-01-01 00:00:00"),
            10,
            Some("of"),
            Some("2099-01-01 00:00:00")
        ));
    }

    #[test]
    fn audit_tokens_are_unique_with_expiry() {
        let (t1, exp1, unix1) = issue_token();
        let (t2, exp2, unix2) = issue_token();
        assert_ne!(t1, t2);
        assert!(exp1.elapsed().as_secs() < 5 || exp1 > std::time::Instant::now());
        assert!(unix1 > 0 && unix2 > 0);
        let _ = exp2;
    }

    #[test]
    fn audit_numbering_per_device_no_collision_format() {
        let conn = setup_node("c1");
        conn.execute_batch(
            "
            CREATE TABLE document_sequences (
              device_code TEXT NOT NULL, doc_type TEXT NOT NULL, next_value INTEGER NOT NULL DEFAULT 1,
              PRIMARY KEY (device_code, doc_type)
            );
            INSERT OR REPLACE INTO settings(key,value) VALUES ('lan_sync_device_code','CJ01');
            ",
        )
        .unwrap();
        let a = crate::lan_sync::numbering::next_doc_number(
            &conn,
            crate::lan_sync::numbering::doc_type::SALE,
        )
        .unwrap();
        let b = crate::lan_sync::numbering::next_doc_number(
            &conn,
            crate::lan_sync::numbering::doc_type::SALE,
        )
        .unwrap();
        assert_eq!(a, "CJ01-V-00000001");
        assert_eq!(b, "CJ01-V-00000002");
    }
}
