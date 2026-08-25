//! Tests de integración Phase 0.5a bootstrap.

use rusqlite::Connection;
use serde_json::json;

use super::super::applier::{apply_event, apply_event_with_options, apply_events_batched, ApplyOptions, ApplyStatus};
use super::super::outbox::build_payload_for_row;
use super::super::protocol::SyncEvent;
use super::*;

fn setup_db() -> Connection {
    let conn = Connection::open_in_memory().expect("mem db");
    conn.execute_batch(
        "
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
        INSERT INTO settings VALUES
          ('lan_sync_applying','0'), ('lan_sync_lamport','0'),
          ('lan_sync_catchup_lamport','0'), ('lan_sync_catchup_event_id',''),
          ('lan_sync_bootstrap_status','off'), ('lan_sync_bootstrap_generation','0'),
          ('lan_sync_bootstrap_session_id',''), ('lan_sync_bootstrap_source_device',''),
          ('lan_sync_bootstrap_cursor_lamport','0'), ('lan_sync_bootstrap_cursor_event_id',''),
          ('lan_sync_bootstrap_counts','{}'), ('lan_sync_bootstrap_lamport_start','0'),
          ('lan_sync_bootstrap_lamport_end','0'), ('lan_sync_bootstrap_products_with_variants','0'),
          ('lan_sync_device_id','dev-a');
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          sync_id TEXT, created_at TEXT, updated_at TEXT,
          sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
        );
        CREATE TABLE suppliers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT, notes TEXT,
          sync_id TEXT, created_at TEXT, updated_at TEXT,
          sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
        );
        CREATE TABLE products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL, stock REAL NOT NULL DEFAULT 0,
          cost REAL DEFAULT 0, price REAL DEFAULT 0, min_stock REAL DEFAULT 0,
          unit TEXT DEFAULT 'unidad', tax_rate REAL DEFAULT 21, active INTEGER DEFAULT 1,
          sync_id TEXT, created_at TEXT, updated_at TEXT,
          sku TEXT, barcode TEXT, description TEXT, category_id INTEGER, supplier_id INTEGER,
          has_variants INTEGER DEFAULT 0,
          sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
        );
        CREATE TABLE customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL, phone TEXT, document TEXT, email TEXT,
          credit_limit REAL DEFAULT 0, balance REAL DEFAULT 0, notes TEXT, active INTEGER DEFAULT 1,
          sync_id TEXT, created_at TEXT, updated_at TEXT,
          sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
        );
        CREATE TABLE lan_sync_event_store (
          event_id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          entity_sync_id TEXT NOT NULL,
          op TEXT NOT NULL,
          payload TEXT NOT NULL,
          lamport INTEGER NOT NULL,
          origin_device TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE lan_sync_applied (
          event_id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          applied_at TEXT DEFAULT (datetime('now'))
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
        CREATE TABLE lan_sync_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          at TEXT DEFAULT (datetime('now')),
          direction TEXT NOT NULL,
          peer TEXT,
          summary TEXT NOT NULL,
          detail TEXT
        );
        CREATE TABLE lan_sync_outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          entity_type TEXT NOT NULL,
          entity_sync_id TEXT NOT NULL,
          op TEXT NOT NULL,
          payload TEXT,
          lamport INTEGER NOT NULL DEFAULT 0,
          origin_device TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          updated_at TEXT
        );
        CREATE TABLE lan_sync_bootstrap_manifest (
          generation INTEGER NOT NULL,
          entity_type TEXT NOT NULL,
          sync_id TEXT NOT NULL,
          PRIMARY KEY (generation, entity_type, sync_id)
        );
        ",
    )
    .expect("schema");
    conn
}

fn seed_products(conn: &Connection, n: usize, prefix: &str) {
    for i in 0..n {
        let sid = format!("{prefix}-prod-{i:04}");
        conn.execute(
            "INSERT INTO products (name, sync_id, price, stock, created_at, updated_at)
             VALUES (?1, ?2, 10, 100, datetime('now'), datetime('now'))",
            rusqlite::params![format!("Prod {i}"), sid],
        )
        .unwrap();
    }
}

#[test]
fn bootstrap_export_100_products() {
    let conn = setup_db();
    seed_products(&conn, 100, "aaa");
    let state = export_catalog(&conn).expect("export");
    assert_eq!(state.counts.products.planned, 100);
    assert_eq!(state.counts.products.applied, 100);
    assert_eq!(state.lamport_start, 1);
    assert_eq!(state.lamport_end, 100);
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM lan_sync_event_store", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 100);
}

#[test]
fn strict_apply_same_sync_id_idempotent() {
    let conn = setup_db();
    conn.execute(
        "INSERT INTO products (name, sync_id, price, stock) VALUES ('Local', 'sid-1', 5, 50)",
        [],
    )
    .unwrap();
    let payload = build_payload_for_row(&conn, "product", "sid-1").unwrap();
    let event = SyncEvent {
        event_id: "bs1-product-sid-1".into(),
        entity_type: "product".into(),
        entity_sync_id: "sid-1".into(),
        op: OP_BOOTSTRAP_UPSERT.into(),
        payload,
        lamport: 1,
        origin_device: "dev-b".into(),
        created_at: "2026-01-01".into(),
    };
    let opts = ApplyOptions {
        strict_identity: true,
    };
    assert_eq!(
        apply_event_with_options(&conn, &event, opts).unwrap(),
        ApplyStatus::Applied
    );
    let stock: f64 = conn
        .query_row("SELECT stock FROM products WHERE sync_id='sid-1'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(stock, 50.0, "bootstrap no debe pisar stock");
    assert_eq!(
        apply_event_with_options(&conn, &event, opts).unwrap(),
        ApplyStatus::AlreadyApplied
    );
}

#[test]
fn strict_barcode_conflict_different_sync_id() {
    let conn = setup_db();
    conn.execute(
        "INSERT INTO products (name, sync_id, barcode, price, stock) VALUES ('A', 'aaa', 'X', 1, 0)",
        [],
    )
    .unwrap();
    let event = SyncEvent {
        event_id: "bs1-product-bbb".into(),
        entity_type: "product".into(),
        entity_sync_id: "bbb".into(),
        op: OP_BOOTSTRAP_UPSERT.into(),
        payload: json!({"name":"B","barcode":"X","price":2,"active":1}),
        lamport: 2,
        origin_device: "dev-b".into(),
        created_at: "2026-01-01".into(),
    };
    let opts = ApplyOptions {
        strict_identity: true,
    };
    let st = apply_event_with_options(&conn, &event, opts).unwrap();
    assert_eq!(st, ApplyStatus::ConflictParked);
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 1);
}

#[test]
fn strict_category_name_conflict() {
    let conn = setup_db();
    conn.execute(
        "INSERT INTO categories (name, sync_id) VALUES ('Bebidas', 'aaa')",
        [],
    )
    .unwrap();
    let event = SyncEvent {
        event_id: "bs1-category-bbb".into(),
        entity_type: "category".into(),
        entity_sync_id: "bbb".into(),
        op: OP_BOOTSTRAP_UPSERT.into(),
        payload: json!({"name":"Bebidas"}),
        lamport: 1,
        origin_device: "dev-b".into(),
        created_at: "2026-01-01".into(),
    };
    let opts = ApplyOptions {
        strict_identity: true,
    };
    assert_eq!(
        apply_event_with_options(&conn, &event, opts).unwrap(),
        ApplyStatus::ConflictParked
    );
}

#[test]
fn client_contribution_detects_missing_sync_ids() {
    let conn = setup_db();
    seed_products(&conn, 5, "local");
    export_catalog(&conn).unwrap();
    conn.execute(
        "INSERT INTO products (name, sync_id, price, stock) VALUES ('Unico', 'local-extra', 1, 0)",
        [],
    )
    .unwrap();
    let hub = hub_sync_id_set(&conn, 1).unwrap();
    let events = collect_contribution_events_with_hub(&conn, 1, "dev-b", &hub).unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].entity_sync_id, "local-extra");
}

#[test]
fn resume_at_half_no_duplicate_apply() {
    let conn = setup_db();
    seed_products(&conn, 10, "p");
    export_catalog(&conn).unwrap();
    let events: Vec<SyncEvent> = conn
        .prepare("SELECT event_id, entity_type, entity_sync_id, op, payload, lamport, origin_device, created_at FROM lan_sync_event_store ORDER BY lamport")
        .unwrap()
        .query_map([], |r| {
            let payload: String = r.get(4)?;
            Ok(SyncEvent {
                event_id: r.get(0)?,
                entity_type: r.get(1)?,
                entity_sync_id: r.get(2)?,
                op: r.get(3)?,
                payload: serde_json::from_str(&payload).unwrap(),
                lamport: r.get(5)?,
                origin_device: r.get(6)?,
                created_at: r.get(7)?,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    let (first, second) = events.split_at(5);
    let opts = ApplyOptions {
        strict_identity: true,
    };
    apply_events_batched(&conn, first, opts, 5).unwrap();
    apply_events_batched(&conn, second, opts, 5).unwrap();
    apply_events_batched(&conn, first, opts, 5).unwrap();
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM lan_sync_applied", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 10);
}

fn load_event_store(conn: &Connection) -> Vec<SyncEvent> {
    conn.prepare(
        "SELECT event_id, entity_type, entity_sync_id, op, payload, lamport, origin_device, created_at
         FROM lan_sync_event_store ORDER BY lamport, event_id",
    )
    .unwrap()
    .query_map([], |r| {
        let payload: String = r.get(4)?;
        Ok(SyncEvent {
            event_id: r.get(0)?,
            entity_type: r.get(1)?,
            entity_sync_id: r.get(2)?,
            op: r.get(3)?,
            payload: serde_json::from_str(&payload).unwrap(),
            lamport: r.get(5)?,
            origin_device: r.get(6)?,
            created_at: r.get(7)?,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

#[test]
fn bootstrap_at_40pct_live_edit_not_lost() {
    let conn = setup_db();
    seed_products(&conn, 10, "p");
    export_catalog(&conn).unwrap();
    let events = load_event_store(&conn);
    assert_eq!(events.len(), 10);

    let opts = ApplyOptions {
        strict_identity: true,
    };
    apply_events_batched(&conn, &events[0..4], opts, 4).unwrap();

    let target_sid = "p-prod-0000";
    let live = SyncEvent {
        event_id: "cdc-live-price".into(),
        entity_type: "product".into(),
        entity_sync_id: target_sid.into(),
        op: "upsert".into(),
        payload: json!({"name":"Prod 0 LIVE","price":999.0,"active":1}),
        lamport: 11,
        origin_device: "dev-live".into(),
        created_at: "2026-01-02 00:00:00".into(),
    };
    apply_event(&conn, &live).unwrap();

    apply_events_batched(&conn, &events[4..], opts, 10).unwrap();

    let price: f64 = conn
        .query_row(
            "SELECT price FROM products WHERE sync_id = ?1",
            [target_sid],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(price, 999.0, "bootstrap tardío no debe pisar cambio live (Lamport 11 > 1)");
}

#[test]
fn hub_applies_contribution_without_catchup() {
    let hub = setup_db();
    seed_products(&hub, 5, "hub");
    export_catalog(&hub).unwrap();

    let mut client = setup_db();
    seed_products(&client, 5, "hub");
    seed_products(&client, 2, "client-only");
    let hub_events = load_event_store(&hub);
    let opts = ApplyOptions {
        strict_identity: true,
    };
    apply_events_batched(&client, &hub_events, opts, 5).unwrap();

    let hub_manifest = hub_sync_id_set(&hub, 1).unwrap();
    let contrib = collect_contribution_events_with_hub(&client, 1, "dev-b", &hub_manifest).unwrap();
    assert_eq!(contrib.len(), 2);

    for e in &contrib {
        apply_event_with_options(&hub, e, opts).unwrap();
        register_manifest(&hub, 1, &e.entity_type, &e.entity_sync_id).unwrap();
    }
    after_contribution_ingested(&hub, contrib.len()).unwrap();

    let hub_products: i64 = hub
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap();
    assert_eq!(hub_products, 7);
    let st = load_ui_state(&hub).unwrap();
    assert_eq!(st.status, "complete");
    assert_eq!(st.counts.products.planned, 7);
    assert_eq!(st.counts.products.applied, 7);
}

#[test]
fn post_bootstrap_cdc_bidirectional() {
    let opts_strict = ApplyOptions {
        strict_identity: true,
    };
    let opts_cdc = ApplyOptions::default();

    let mut hub = setup_db();
    seed_products(&hub, 3, "base");
    export_catalog(&hub).unwrap();
    let bootstrap_events = load_event_store(&hub);

    let mut client = setup_db();
    apply_events_batched(&client, &bootstrap_events, opts_strict, 10).unwrap();
    mark_bootstrap_complete(&hub).unwrap();
    mark_bootstrap_complete(&client).unwrap();

    // A crea producto X
    hub.execute(
        "INSERT INTO products (name, sync_id, price, stock) VALUES ('X', 'sync-x', 100, 0)",
        [],
    )
    .unwrap();
    let payload_x = build_payload_for_row(&hub, "product", "sync-x").unwrap();
    let event_x = SyncEvent {
        event_id: "cdc-a-x".into(),
        entity_type: "product".into(),
        entity_sync_id: "sync-x".into(),
        op: "upsert".into(),
        payload: payload_x,
        lamport: 20,
        origin_device: "dev-a".into(),
        created_at: "2026-01-03".into(),
    };
    apply_event(&hub, &event_x).unwrap();
    apply_event_with_options(&client, &event_x, opts_cdc).unwrap();

    // B crea producto Y
    client
        .execute(
            "INSERT INTO products (name, sync_id, price, stock) VALUES ('Y', 'sync-y', 200, 0)",
            [],
        )
        .unwrap();
    let payload_y = build_payload_for_row(&client, "product", "sync-y").unwrap();
    let event_y = SyncEvent {
        event_id: "cdc-b-y".into(),
        entity_type: "product".into(),
        entity_sync_id: "sync-y".into(),
        op: "upsert".into(),
        payload: payload_y,
        lamport: 21,
        origin_device: "dev-b".into(),
        created_at: "2026-01-03".into(),
    };
    apply_event(&client, &event_y).unwrap();
    apply_event_with_options(&hub, &event_y, opts_cdc).unwrap();

    // A modifica X
    let event_x2 = SyncEvent {
        event_id: "cdc-a-x2".into(),
        entity_type: "product".into(),
        entity_sync_id: "sync-x".into(),
        op: "upsert".into(),
        payload: json!({"name":"X","price":150.0,"active":1}),
        lamport: 22,
        origin_device: "dev-a".into(),
        created_at: "2026-01-04".into(),
    };
    apply_event(&hub, &event_x2).unwrap();
    apply_event_with_options(&client, &event_x2, opts_cdc).unwrap();

    // B modifica Y
    let event_y2 = SyncEvent {
        event_id: "cdc-b-y2".into(),
        entity_type: "product".into(),
        entity_sync_id: "sync-y".into(),
        op: "upsert".into(),
        payload: json!({"name":"Y","price":250.0,"active":1}),
        lamport: 23,
        origin_device: "dev-b".into(),
        created_at: "2026-01-04".into(),
    };
    apply_event(&client, &event_y2).unwrap();
    apply_event_with_options(&hub, &event_y2, opts_cdc).unwrap();

    let price_x_client: f64 = client
        .query_row("SELECT price FROM products WHERE sync_id='sync-x'", [], |r| r.get(0))
        .unwrap();
    let price_y_hub: f64 = hub
        .query_row("SELECT price FROM products WHERE sync_id='sync-y'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(price_x_client, 150.0);
    assert_eq!(price_y_hub, 250.0);

    let total_hub: i64 = hub
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap();
    let total_client: i64 = client
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap();
    assert_eq!(total_hub, 5);
    assert_eq!(total_client, 5);
}

#[test]
#[ignore = "benchmark 34k+50 — ejecutar manualmente"]
fn benchmark_bootstrap_34k_plus_50() {
    let conn = setup_db();
    seed_products(&conn, 34000, "a");
    let t0 = std::time::Instant::now();
    let export_state = export_catalog(&conn).unwrap();
    let export_elapsed = t0.elapsed();
    let events_generated: i64 = conn
        .query_row("SELECT COUNT(*) FROM lan_sync_event_store", [], |r| r.get(0))
        .unwrap();

    conn.execute(
        "INSERT INTO products (name, sync_id, price, stock)
         SELECT 'B' || id, 'b-extra-' || id, 1, 0 FROM products LIMIT 50",
        [],
    )
    .unwrap();

    let hub = hub_sync_id_set(&conn, 1).unwrap();
    let t1 = std::time::Instant::now();
    let contrib = collect_contribution_events_with_hub(&conn, 1, "dev-b", &hub).unwrap();
    let contrib_elapsed = t1.elapsed();

    let opts = ApplyOptions {
        strict_identity: true,
    };
    let t2 = std::time::Instant::now();
    apply_events_batched(&conn, &contrib, opts, 75).unwrap();
    let apply_elapsed = t2.elapsed();

    let total_products: i64 = conn
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap();

    eprintln!("=== Benchmark 34k+50 ===");
    eprintln!("Export: {:?} ({} eventos)", export_elapsed, events_generated);
    eprintln!("Contrib detect: {:?} ({} eventos)", contrib_elapsed, contrib.len());
    eprintln!("Apply contrib: {:?}", apply_elapsed);
    eprintln!(
        "Planned/applied export: {}/{}",
        export_state.counts.products.planned, export_state.counts.products.applied
    );
    eprintln!("Productos finales en DB: {total_products}");
    assert_eq!(events_generated, 34000);
    assert_eq!(contrib.len(), 50);
    assert_eq!(total_products, 34050);
}
