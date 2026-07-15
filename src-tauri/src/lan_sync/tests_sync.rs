//! Tests de unidad Sync LAN (sin axum completo).

use rusqlite::Connection;
use serde_json::json;

use super::applier::apply_event;
use super::conflict::{ConflictPolicy, LastWriteWins};
use super::protocol::SyncEvent;

fn setup() -> Connection {
    let conn = Connection::open_in_memory().expect("mem db");
    conn.execute_batch(
        "
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
        INSERT INTO settings VALUES ('lan_sync_applying','0'), ('lan_sync_lamport','0');
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          sync_id TEXT, created_at TEXT, updated_at TEXT
        );
        CREATE TABLE products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL, stock REAL NOT NULL DEFAULT 0,
          cost REAL DEFAULT 0, price REAL DEFAULT 0, min_stock REAL DEFAULT 0,
          unit TEXT DEFAULT 'unidad', tax_rate REAL DEFAULT 21, active INTEGER DEFAULT 1,
          sync_id TEXT, created_at TEXT, updated_at TEXT,
          sku TEXT, barcode TEXT, description TEXT, category_id INTEGER, supplier_id INTEGER
        );
        CREATE TABLE stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          movement_type TEXT NOT NULL,
          qty REAL NOT NULL,
          reference_type TEXT,
          reference_id INTEGER,
          sync_id TEXT,
          device_id TEXT,
          created_at TEXT
        );
        CREATE TABLE lan_sync_applied (
          event_id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          applied_at TEXT DEFAULT (datetime('now'))
        );
        ",
    )
    .expect("schema");
    conn
}

#[test]
fn lww_and_stock_delta() {
    let p = LastWriteWins;
    assert!(p.should_accept_remote(Some("2026-07-14 13:00:00"), 1, Some("2026-07-14 12:00:00"), 99));

    let conn = setup();
    conn.execute(
        "INSERT INTO products (name, stock, sync_id) VALUES ('X', 20, 'p1')",
        [],
    )
    .unwrap();

    let sell = SyncEvent {
        event_id: "m1".into(),
        entity_type: "stock_movement".into(),
        entity_sync_id: "sm1".into(),
        op: "upsert".into(),
        payload: json!({"product_sync_id":"p1","qty":-4.0,"movement_type":"sale"}),
        lamport: 1,
        origin_device: "caja".into(),
        created_at: "2026-07-14 12:00:00".into(),
    };
    assert!(apply_event(&conn, &sell).unwrap());

    let adjust = SyncEvent {
        event_id: "m2".into(),
        entity_type: "stock_movement".into(),
        entity_sync_id: "sm2".into(),
        op: "upsert".into(),
        payload: json!({"product_sync_id":"p1","qty":2.5,"movement_type":"adjustment"}),
        lamport: 2,
        origin_device: "caja".into(),
        created_at: "2026-07-14 12:01:00".into(),
    };
    assert!(apply_event(&conn, &adjust).unwrap());

    let stock: f64 = conn
        .query_row("SELECT stock FROM products WHERE sync_id='p1'", [], |r| r.get(0))
        .unwrap();
    assert!((stock - 18.5).abs() < 0.001);
}

#[test]
fn category_upsert_by_sync_id() {
    let conn = setup();
    let ev = SyncEvent {
        event_id: "c1".into(),
        entity_type: "category".into(),
        entity_sync_id: "cat1".into(),
        op: "upsert".into(),
        payload: json!({"name":"Bebidas","updated_at":"2026-07-14 10:00:00"}),
        lamport: 1,
        origin_device: "srv".into(),
        created_at: "2026-07-14 10:00:00".into(),
    };
    apply_event(&conn, &ev).unwrap();
    let name: String = conn
        .query_row("SELECT name FROM categories WHERE sync_id='cat1'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(name, "Bebidas");
}
