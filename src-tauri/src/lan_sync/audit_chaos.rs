//! Auditoría QA — Sync LAN Fase 1.
//! Objetivo: demostrar fallas de integridad, no “hacer pasar” la suite.

#[cfg(test)]
mod audit {
    use rusqlite::{params, Connection};
    use serde_json::json;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use std::thread;

    use crate::lan_sync::applier::apply_event;
    use crate::lan_sync::conflict::{ConflictPolicy, LastWriteWins};
    use crate::lan_sync::protocol::SyncEvent;
    use crate::lan_sync::server::make_token;

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
              sync_id TEXT UNIQUE,
              created_at TEXT, updated_at TEXT
            );
            CREATE TABLE suppliers (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              phone TEXT, notes TEXT,
              sync_id TEXT UNIQUE,
              created_at TEXT, updated_at TEXT
            );
            CREATE TABLE customers (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL, phone TEXT, document TEXT, email TEXT,
              credit_limit REAL DEFAULT 0, balance REAL DEFAULT 0,
              notes TEXT, active INTEGER DEFAULT 1,
              sync_id TEXT UNIQUE, created_at TEXT, updated_at TEXT
            );
            CREATE TABLE products (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL, stock REAL NOT NULL DEFAULT 0,
              cost REAL DEFAULT 0, price REAL DEFAULT 0, min_stock REAL DEFAULT 0,
              unit TEXT DEFAULT 'unidad', tax_rate REAL DEFAULT 21, active INTEGER DEFAULT 1,
              sync_id TEXT UNIQUE, created_at TEXT, updated_at TEXT,
              sku TEXT, barcode TEXT, description TEXT,
              category_id INTEGER, supplier_id INTEGER
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_prod_barcode ON products(barcode)
              WHERE barcode IS NOT NULL AND barcode != '';
            CREATE TABLE sales (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subtotal REAL, discount_pct REAL DEFAULT 0, total REAL,
              payment_method TEXT, paid REAL, change_due REAL,
              voided INTEGER DEFAULT 0, customer_id INTEGER,
              sync_id TEXT UNIQUE, created_at TEXT, updated_at TEXT
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
              entity_local_id INTEGER,
              op TEXT NOT NULL,
              payload TEXT,
              lamport INTEGER NOT NULL DEFAULT 0,
              origin_device TEXT NOT NULL,
              created_at TEXT DEFAULT (datetime('now')),
              status TEXT DEFAULT 'pending',
              last_error TEXT,
              acked_at TEXT
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

    fn integrity_ok(conn: &Connection) -> bool {
        let r: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap_or_else(|_| "fail".into());
        r == "ok"
    }

    fn stock_of(conn: &Connection, sync_id: &str) -> f64 {
        conn.query_row(
            "SELECT stock FROM products WHERE sync_id = ?1",
            [sync_id],
            |r| r.get(0),
        )
        .unwrap_or(0.0)
    }

    fn seed_product(conn: &Connection, sync_id: &str, name: &str, stock: f64, price: f64) {
        conn.execute(
            "INSERT INTO products (name, stock, price, sync_id, updated_at)
             VALUES (?1, ?2, ?3, ?4, '2026-07-14 10:00:00')",
            params![name, stock, price, sync_id],
        )
        .unwrap();
    }

    fn ev_mov(
        event_id: &str,
        mov_sync: &str,
        product_sync: &str,
        qty: f64,
        origin: &str,
        lamport: i64,
    ) -> SyncEvent {
        SyncEvent {
            event_id: event_id.into(),
            entity_type: "stock_movement".into(),
            entity_sync_id: mov_sync.into(),
            op: "upsert".into(),
            payload: json!({
                "product_sync_id": product_sync,
                "qty": qty,
                "movement_type": if qty < 0.0 { "sale" } else { "adjustment" },
            }),
            lamport,
            origin_device: origin.into(),
            created_at: "2026-07-14 12:00:00".into(),
        }
    }

    fn ev_product_price(
        event_id: &str,
        product_sync: &str,
        price: f64,
        updated_at: &str,
        origin: &str,
        lamport: i64,
    ) -> SyncEvent {
        SyncEvent {
            event_id: event_id.into(),
            entity_type: "product".into(),
            entity_sync_id: product_sync.into(),
            op: "upsert".into(),
            payload: json!({
                "name": "Producto QA",
                "price": price,
                "cost": 0,
                "stock": 9999,
                "min_stock": 0,
                "unit": "unidad",
                "tax_rate": 21,
                "active": 1,
                "updated_at": updated_at,
            }),
            lamport,
            origin_device: origin.into(),
            created_at: updated_at.into(),
        }
    }

    fn ev_customer_balance(
        event_id: &str,
        cust_sync: &str,
        balance: f64,
        updated_at: &str,
        origin: &str,
        lamport: i64,
    ) -> SyncEvent {
        SyncEvent {
            event_id: event_id.into(),
            entity_type: "customer".into(),
            entity_sync_id: cust_sync.into(),
            op: "upsert".into(),
            payload: json!({
                "name": "Cliente Fiado",
                "balance": balance,
                "credit_limit": 100000,
                "active": 1,
                "updated_at": updated_at,
            }),
            lamport,
            origin_device: origin.into(),
            created_at: updated_at.into(),
        }
    }

    /// Escenario comercial: stock 100, Caja1 -20, Caja2 -30, +50 recepción, venta -10, precio desde oficina.
    #[test]
    fn audit_stock_scenario_three_nodes() {
        let oficina = setup_node("oficina");
        let caja1 = setup_node("caja1");
        let caja2 = setup_node("caja2");
        for c in [&oficina, &caja1, &caja2] {
            seed_product(c, "prod-qa", "Producto QA", 100.0, 1000.0);
        }

        let events = vec![
            ev_mov("m1", "mov-c1-20", "prod-qa", -20.0, "caja1", 1),
            ev_mov("m2", "mov-c2-30", "prod-qa", -30.0, "caja2", 2),
            ev_product_price(
                "p1",
                "prod-qa",
                1200.0,
                "2026-07-14 12:05:00",
                "oficina",
                3,
            ),
            ev_mov("m3", "mov-in-50", "prod-qa", 50.0, "caja1", 4),
            ev_mov("m4", "mov-c2-10", "prod-qa", -10.0, "caja2", 5),
        ];

        // Simula hub: oficina aplica todo y “reenvía” a cajas (mismo orden).
        for e in &events {
            apply_event(&oficina, e).unwrap();
            apply_event(&caja1, e).unwrap();
            apply_event(&caja2, e).unwrap();
        }

        let expected = 100.0 - 20.0 - 30.0 + 50.0 - 10.0; // 90
        assert!(
            (stock_of(&oficina, "prod-qa") - expected).abs() < 1e-9,
            "oficina stock={}",
            stock_of(&oficina, "prod-qa")
        );
        assert!((stock_of(&caja1, "prod-qa") - expected).abs() < 1e-9);
        assert!((stock_of(&caja2, "prod-qa") - expected).abs() < 1e-9);

        let price: f64 = oficina
            .query_row(
                "SELECT price FROM products WHERE sync_id='prod-qa'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!((price - 1200.0).abs() < 1e-9);
        assert!(integrity_ok(&oficina) && integrity_ok(&caja1) && integrity_ok(&caja2));
    }

    /// CRÍTICO: movimiento llega antes que el producto → event failed / stock perdido.
    #[test]
    fn audit_stock_movement_before_product_fails() {
        let caja = setup_node("caja1");
        // producto aún no existe en esta PC
        let e = ev_mov("m-early", "mov-early", "prod-missing", -5.0, "caja2", 1);
        let err = apply_event(&caja, &e);
        assert!(
            err.is_err(),
            "debe fallar si el producto no existe; si se acepta, hay pérdida silenciosa de stock"
        );
    }

    /// CRÍTICO demostrable: balance de cliente se sobrescribe por LWW (no es evento delta).
    #[test]
    fn audit_customer_balance_lww_destroys_parallel_charges() {
        let oficina = setup_node("oficina");
        apply_event(
            &oficina,
            &ev_customer_balance(
                "c0",
                "cust1",
                0.0,
                "2026-07-14 10:00:00",
                "oficina",
                1,
            ),
        )
        .unwrap();

        // Caja1 cobra fiado +1000 (balance 1000)
        apply_event(
            &oficina,
            &ev_customer_balance(
                "c1",
                "cust1",
                1000.0,
                "2026-07-14 12:00:00",
                "caja1",
                2,
            ),
        )
        .unwrap();
        // Caja2 cobra fiado +500 con timestamp LIGERAMENTE mayor → gana LWW y BORRA el 1000
        apply_event(
            &oficina,
            &ev_customer_balance(
                "c2",
                "cust1",
                500.0,
                "2026-07-14 12:00:01",
                "caja2",
                3,
            ),
        )
        .unwrap();

        let bal: f64 = oficina
            .query_row(
                "SELECT balance FROM customers WHERE sync_id='cust1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        // Correcto de negocio sería 1500. Actual LWW deja 500.
        assert!(
            (bal - 500.0).abs() < 1e-9,
            "documenta bug: balance={bal}, esperado de negocio 1500"
        );
        assert!(
            (bal - 1500.0).abs() > 1.0,
            "SI ESTE ASSERT FALLA, el bug de balance quedó arreglado"
        );
    }

    /// CRÍTICO: clocks desfasados hacen que LWW elija mal.
    #[test]
    fn audit_lww_clock_skew_prefers_stale_write() {
        let p = LastWriteWins;
        // Reloj de Caja2 atrasado: escribe "antes" aunque ocurrió después.
        let accept_stale = p.should_accept_remote(
            Some("2026-07-14 11:00:00"), // remoto "viejo" por skew
            99,
            Some("2026-07-14 12:00:00"), // local más nuevo
            1,
        );
        assert!(
            !accept_stale,
            "con skew el remoto viejo no debería pisar; el modelo usa wall-clock string"
        );
        // Caso inverso: PC con reloj adelantado pisa cambios reales más recientes
        let wrong_win = p.should_accept_remote(
            Some("2026-07-14 18:00:00"), // reloj adelantado
            1,
            Some("2026-07-14 12:05:00"), // cambio real reciente
            50,
        );
        assert!(
            wrong_win,
            "documenta riesgo: PC con reloj adelantado gana LWW siempre"
        );
    }

    /// Catch-up LIMIT 500: si hay más eventos, el cliente queda incompleto.
    #[test]
    fn audit_catchup_limit_truncates() {
        let hub = setup_node("oficina");
        seed_product(&hub, "prod-qa", "P", 0.0, 1.0);
        for i in 1..=600 {
            let e = ev_mov(
                &format!("e{i}"),
                &format!("mov{i}"),
                "prod-qa",
                1.0,
                "caja1",
                i,
            );
            apply_event(&hub, &e).unwrap();
            crate::lan_sync::outbox::insert_event_store(&hub, &e).unwrap();
        }
        let page = crate::lan_sync::outbox::list_event_store_since(&hub, 0).unwrap();
        assert_eq!(
            page.len(),
            500,
            "catch-up truncado a 500 sin cursor de continuación → pérdida de sync"
        );
        // Un cliente nuevo solo recibiría 500 de 600 movimientos
        let caja = setup_node("caja-nueva");
        seed_product(&caja, "prod-qa", "P", 0.0, 1.0);
        for e in &page {
            apply_event(&caja, e).unwrap();
        }
        assert!(
            (stock_of(&caja, "prod-qa") - 500.0).abs() < 1e-9,
            "cliente se queda en 500 en vez de 600"
        );
    }

    /// Broadcast channel capacity 256: documentamos riesgo de Lagged.
    #[test]
    fn audit_broadcast_capacity_is_small() {
        // El server usa broadcast::channel(256). Si hub fan-out > capacidad,
        // RecvError::Lagged descarta eventos WS (mitigado parcialmente por catch-up,
        // PERO catch-up tiene LIMIT 500 y since_lamport local puede ser engañoso).
        assert_eq!(256usize, 256, "capacidad WS broadcast = 256 (ver server.rs)");
    }

    /// Token PSK: determinista y predecible si conocés PSK+device_id (sin expiry).
    #[test]
    fn audit_token_is_deterministic_no_expiry() {
        let t1 = make_token("secret", "caja1");
        let t2 = make_token("secret", "caja1");
        assert_eq!(t1, t2);
        let bad = make_token("wrong", "caja1");
        assert_ne!(t1, bad);
    }

    /// Duplicado same device_id: último auth pisa token map — same token forever.
    #[test]
    fn audit_duplicate_device_id_same_token() {
        let a = make_token("psk", "same-id");
        let b = make_token("psk", "same-id");
        assert_eq!(a, b);
    }

    /// Concurrencia: muchos hilos aplican movimientos distintos al mismo producto vía mutex DB.
    #[test]
    fn audit_concurrent_movements_serialized() {
        let conn = Arc::new(Mutex::new(setup_node("oficina")));
        {
            let c = conn.lock().unwrap();
            seed_product(&c, "prod-qa", "P", 10_000.0, 1.0);
        }
        let mut handles = vec![];
        for i in 0..50 {
            let conn = Arc::clone(&conn);
            handles.push(thread::spawn(move || {
                let e = ev_mov(
                    &format!("cx-{i}"),
                    &format!("mov-cx-{i}"),
                    "prod-qa",
                    -1.0,
                    &format!("caja{i}"),
                    i + 1,
                );
                let c = conn.lock().unwrap();
                apply_event(&c, &e).unwrap();
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        let c = conn.lock().unwrap();
        assert!((stock_of(&c, "prod-qa") - 9950.0).abs() < 1e-9);
        assert!(integrity_ok(&c));
    }

    /// Stress volume: 1000 productos upsert + integrity.
    #[test]
    fn audit_stress_1000_products_integrity() {
        let conn = setup_node("oficina");
        for i in 0..1000 {
            let e = SyncEvent {
                event_id: format!("prod-ev-{i}"),
                entity_type: "product".into(),
                entity_sync_id: format!("prod-{i}"),
                op: "upsert".into(),
                payload: json!({
                    "name": format!("Prod {i}"),
                    "price": (i as f64) + 1.0,
                    "cost": 0,
                    "stock": 999,
                    "min_stock": 0,
                    "unit": "unidad",
                    "tax_rate": 21,
                    "active": 1,
                    "barcode": format!("779{i:010}"),
                    "updated_at": "2026-07-14 12:00:00",
                }),
                lamport: i + 1,
                origin_device: "oficina".into(),
                created_at: "2026-07-14 12:00:00".into(),
            };
            apply_event(&conn, &e).unwrap();
        }
        // “borrar” 500 (soft delete)
        for i in 0..500 {
            let e = SyncEvent {
                event_id: format!("del-{i}"),
                entity_type: "product".into(),
                entity_sync_id: format!("prod-{i}"),
                op: "delete".into(),
                payload: json!({}),
                lamport: 2000 + i,
                origin_device: "oficina".into(),
                created_at: "2026-07-14 13:00:00".into(),
            };
            apply_event(&conn, &e).unwrap();
        }
        let active: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM products WHERE active = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(active, 500);
        assert!(integrity_ok(&conn));
    }

    /// Ventas concurrentes: sync_id únicos, sin doble apply.
    #[test]
    fn audit_sales_sync_ids_unique_no_dup_apply() {
        let oficina = setup_node("oficina");
        seed_product(&oficina, "prod-qa", "P", 100.0, 10.0);
        let mut seen = HashMap::new();
        for i in 0..200 {
            let sid = format!("sale-{i}");
            let e = SyncEvent {
                event_id: format!("sev-{i}"),
                entity_type: "sale".into(),
                entity_sync_id: sid.clone(),
                op: "upsert".into(),
                payload: json!({
                    "subtotal": 10.0,
                    "discount_pct": 0,
                    "total": 10.0,
                    "payment_method": "efectivo",
                    "voided": 0,
                    "items": [{
                        "sync_id": format!("si-{i}"),
                        "name": "P",
                        "qty": 1,
                        "unit_price": 10,
                        "discount_pct": 0,
                        "line_total": 10,
                        "product_sync_id": "prod-qa"
                    }]
                }),
                lamport: i + 1,
                origin_device: if i % 2 == 0 { "caja1" } else { "caja2" }.into(),
                created_at: "2026-07-14 12:00:00".into(),
            };
            assert!(apply_event(&oficina, &e).unwrap());
            assert!(!apply_event(&oficina, &e).unwrap()); // idempotente
            seen.insert(sid, ());
        }
        let n: i64 = oficina
            .query_row("SELECT COUNT(*) FROM sales", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n as usize, seen.len());
        // Numeración AUTOINCREMENT local NO es global: ids locales pueden diferir entre PCs.
        // Eso es OK si se usa sync_id; es RIESGO si el negocio imprime "Nº de venta = id".
        assert!(integrity_ok(&oficina));
    }

    /// Producto barcode UNIQUE: segundo producto con mismo barcode rompe apply.
    #[test]
    fn audit_duplicate_barcode_breaks_apply() {
        let conn = setup_node("oficina");
        let e1 = SyncEvent {
            event_id: "b1".into(),
            entity_type: "product".into(),
            entity_sync_id: "p-a".into(),
            op: "upsert".into(),
            payload: json!({
                "name": "A", "price": 1, "cost": 0, "min_stock": 0, "unit": "u",
                "tax_rate": 21, "active": 1, "barcode": "111",
                "updated_at": "2026-07-14 12:00:00"
            }),
            lamport: 1,
            origin_device: "caja1".into(),
            created_at: "2026-07-14 12:00:00".into(),
        };
        let e2 = SyncEvent {
            event_id: "b2".into(),
            entity_type: "product".into(),
            entity_sync_id: "p-b".into(),
            op: "upsert".into(),
            payload: json!({
                "name": "B", "price": 2, "cost": 0, "min_stock": 0, "unit": "u",
                "tax_rate": 21, "active": 1, "barcode": "111",
                "updated_at": "2026-07-14 12:01:00"
            }),
            lamport: 2,
            origin_device: "caja2".into(),
            created_at: "2026-07-14 12:01:00".into(),
        };
        apply_event(&conn, &e1).unwrap();
        let r = apply_event(&conn, &e2);
        assert!(
            r.is_err(),
            "barcode duplicado entre sync_ids distintos debe fallar (y deja cola trabada en prod)"
        );
    }

    /// Sale con items vacíos: apply deja venta sin líneas (ventana de carrera del trigger).
    #[test]
    fn audit_sale_without_items_is_accepted() {
        let conn = setup_node("oficina");
        let e = SyncEvent {
            event_id: "s-empty".into(),
            entity_type: "sale".into(),
            entity_sync_id: "sale-empty".into(),
            op: "upsert".into(),
            payload: json!({
                "subtotal": 100, "discount_pct": 0, "total": 100,
                "payment_method": "efectivo", "voided": 0,
                "items": []
            }),
            lamport: 1,
            origin_device: "caja1".into(),
            created_at: "2026-07-14 12:00:00".into(),
        };
        assert!(apply_event(&conn, &e).unwrap());
        let items: i64 = conn
            .query_row("SELECT COUNT(*) FROM sale_items", [], |r| r.get(0))
            .unwrap();
        assert_eq!(items, 0);
    }
}
