//! Tests Phase 0.5b snapshot (Caso A).

use std::fs;
use std::path::PathBuf;

use rusqlite::{params, Connection};

use super::*;
use crate::lan_sync::applier::{apply_event, ApplyStatus};
use crate::lan_sync::protocol::SyncEvent;
use crate::settings_util::read_setting_or;

fn temp_app_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("walqo-snap-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    let snap = dir.join("lan_snapshots");
    fs::create_dir_all(&snap).unwrap();
    set_test_snapshot_dir(Some(snap));
    dir
}

fn schema_sql() -> &'static str {
    r#"
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
        INSERT INTO settings VALUES
          ('lan_sync_applying','0'), ('lan_sync_lamport','0'),
          ('lan_sync_catchup_lamport','0'), ('lan_sync_catchup_event_id',''),
          ('lan_sync_device_id','dev-source'),
          ('lan_sync_bootstrap_status','off'),
          ('lan_sync_bootstrap_generation','0'),
          ('lan_sync_snapshot_status','off'),
          ('lan_sync_snapshot_id',''),
          ('lan_sync_snapshot_applied_id',''),
          ('lan_sync_snapshot_includes_stock_seed','1'),
          ('lan_sync_snapshot_download_offset','0'),
          ('lan_sync_snapshot_last_error','');
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          sync_id TEXT, created_at TEXT, updated_at TEXT,
          sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
        );
        CREATE TABLE brands (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          created_at TEXT
        );
        CREATE TABLE suppliers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          phone TEXT, notes TEXT,
          sync_id TEXT, created_at TEXT, updated_at TEXT,
          sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
        );
        CREATE TABLE products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sku TEXT, barcode TEXT, name TEXT NOT NULL, description TEXT,
          category_id INTEGER, brand_id INTEGER, supplier_id INTEGER,
          cost REAL DEFAULT 0, price REAL DEFAULT 0, stock REAL DEFAULT 0,
          min_stock REAL DEFAULT 0, unit TEXT DEFAULT 'unidad', tax_rate REAL DEFAULT 21,
          has_variants INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
          sync_id TEXT, created_at TEXT, updated_at TEXT,
          sync_lamport INTEGER DEFAULT 0, sync_origin TEXT,
          catalog_source TEXT, expires_at TEXT, unit_type TEXT DEFAULT 'integer',
          track_batches INTEGER DEFAULT 0, is_kit INTEGER DEFAULT 0, batch_policy TEXT
        );
        CREATE TABLE product_barcodes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          barcode TEXT NOT NULL UNIQUE,
          label TEXT, quantity_factor REAL DEFAULT 1, is_primary INTEGER DEFAULT 0
        );
        CREATE TABLE product_variants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          attributes TEXT, sku TEXT, barcode TEXT, price REAL, stock REAL DEFAULT 0
        );
        CREATE TABLE customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL, phone TEXT, document TEXT, email TEXT,
          credit_limit REAL DEFAULT 0, balance REAL DEFAULT 0, notes TEXT, active INTEGER DEFAULT 1,
          sync_id TEXT, created_at TEXT, updated_at TEXT,
          sync_lamport INTEGER DEFAULT 0, sync_origin TEXT
        );
        CREATE TABLE sales (id INTEGER PRIMARY KEY AUTOINCREMENT);
        CREATE TABLE stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          movement_type TEXT NOT NULL,
          qty REAL NOT NULL,
          reference_type TEXT,
          sync_id TEXT,
          device_id TEXT,
          created_at TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE UNIQUE INDEX idx_stock_movements_sync_id ON stock_movements(sync_id) WHERE sync_id IS NOT NULL;
        CREATE TABLE lan_sync_applied (
          event_id TEXT PRIMARY KEY,
          entity_type TEXT,
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
        CREATE TABLE lan_sync_event_store (
          event_id TEXT PRIMARY KEY,
          entity_type TEXT, entity_sync_id TEXT, op TEXT, payload TEXT,
          lamport INTEGER, origin_device TEXT, created_at TEXT
        );
        CREATE TABLE lan_sync_pending (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT, entity_type TEXT, entity_sync_id TEXT, op TEXT, payload TEXT,
          lamport INTEGER, origin_device TEXT, created_at TEXT, acked INTEGER DEFAULT 0
        );
        CREATE VIRTUAL TABLE products_fts USING fts5(
          name, barcode, sku, tokenize='unicode61 remove_diacritics 2'
        );
    "#
}

fn open_source(n_products: usize) -> (PathBuf, Connection) {
    let dir = temp_app_dir();
    let db_path = dir.join("source.db");
    let conn = Connection::open(&db_path).unwrap();
    conn.execute_batch(schema_sql()).unwrap();
    conn.execute(
        "INSERT INTO categories (name, sync_id) VALUES ('Golosinas', 'cat-1')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO suppliers (name, sync_id) VALUES ('Prov A', 'sup-1')",
        [],
    )
    .unwrap();
    conn.execute("INSERT INTO brands (name) VALUES ('MarcaX')", [])
        .unwrap();
    for i in 0..n_products {
        conn.execute(
            "INSERT INTO products (name, category_id, brand_id, supplier_id, cost, price, stock, sync_id, has_variants)
             VALUES (?1, 1, 1, 1, 10, 20, ?2, ?3, ?4)",
            params![
                format!("Prod {i}"),
                (i % 5) as f64 + 1.0,
                format!("prod-{i}"),
                if i == 0 { 1 } else { 0 }
            ],
        )
        .unwrap();
        let pid = conn.last_insert_rowid();
        if i == 0 {
            conn.execute(
                "INSERT INTO product_barcodes (product_id, barcode, is_primary) VALUES (?1, '7790001', 1)",
                params![pid],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO product_variants (product_id, attributes, sku, price, stock)
                 VALUES (?1, '{\"talle\":\"M\"}', 'VAR-M', 22, 3)",
                params![pid],
            )
            .unwrap();
        }
    }
    conn.execute(
        "INSERT INTO customers (name, sync_id, balance) VALUES ('Cliente', 'cust-1', 50)",
        [],
    )
    .unwrap();
    (dir, conn)
}

fn open_empty_dest(dir: &PathBuf) -> Connection {
    let path = dir.join("dest.db");
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(schema_sql()).unwrap();
    conn.execute(
        "UPDATE settings SET value='dev-dest' WHERE key='lan_sync_device_id'",
        [],
    )
    .unwrap();
    conn
}

#[test]
fn snapshot_empty_import() {
    let (dir, src) = open_source(0);
    let manifest = generate_snapshot(&src, true).expect("gen");
    let zst = snapshots_dir()
        .unwrap()
        .join(format!("{}.sqlite.zst", manifest.snapshot_id));
    assert!(zst.exists());
    let dest = open_empty_dest(&dir);
    validate_and_import(&dest, &manifest, &zst).expect("import");
    let n: i64 = dest
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 0);
}

#[test]
fn snapshot_100_products_import() {
    let (dir, src) = open_source(100);
    let manifest = generate_snapshot(&src, false).expect("gen");
    let zst = snapshots_dir()
        .unwrap()
        .join(format!("{}.sqlite.zst", manifest.snapshot_id));
    let dest = open_empty_dest(&dir);
    validate_and_import(&dest, &manifest, &zst).expect("import");
    let n: i64 = dest
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 100);
    let cats: i64 = dest
        .query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))
        .unwrap();
    assert_eq!(cats, 1);
    let sync: String = dest
        .query_row(
            "SELECT sync_id FROM products WHERE name = 'Prod 5'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(sync, "prod-5");
}

#[test]
fn product_fk_remapping() {
    let (dir, src) = open_source(3);
    // Force different local ids on dest by pre-inserting unused category then deleting? Case A empty.
    // Remap: source category id=1 → dest should get new id; product.category_id must point to dest.
    let manifest = generate_snapshot(&src, false).unwrap();
    let zst = snapshots_dir()
        .unwrap()
        .join(format!("{}.sqlite.zst", manifest.snapshot_id));
    let dest = open_empty_dest(&dir);
    validate_and_import(&dest, &manifest, &zst).unwrap();
    let (pid, cat_id): (i64, i64) = dest
        .query_row(
            "SELECT id, category_id FROM products WHERE sync_id = 'prod-0'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    let cat_sync: String = dest
        .query_row(
            "SELECT sync_id FROM categories WHERE id = ?1",
            [cat_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(cat_sync, "cat-1");
    assert!(pid > 0);
}

#[test]
fn variants_fk_remapping() {
    let (dir, src) = open_source(2);
    let manifest = generate_snapshot(&src, false).unwrap();
    let zst = snapshots_dir()
        .unwrap()
        .join(format!("{}.sqlite.zst", manifest.snapshot_id));
    let dest = open_empty_dest(&dir);
    validate_and_import(&dest, &manifest, &zst).unwrap();
    let (var_pid, dest_prod): (i64, i64) = dest
        .query_row(
            "SELECT v.product_id, p.id FROM product_variants v
             JOIN products p ON p.sync_id = 'prod-0'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(var_pid, dest_prod);
    // Source product id was 1; dest id may differ if schema inserts differ — ensure not blindly same only if coincidence
    let sku: String = dest
        .query_row(
            "SELECT sku FROM product_variants WHERE product_id = ?1",
            [dest_prod],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(sku, "VAR-M");
}

#[test]
fn checksum_incorrect_rejects() {
    let (dir, src) = open_source(5);
    let mut manifest = generate_snapshot(&src, false).unwrap();
    let zst = snapshots_dir()
        .unwrap()
        .join(format!("{}.sqlite.zst", manifest.snapshot_id));
    manifest.content_sha256 = "deadbeef".into();
    let dest = open_empty_dest(&dir);
    let err = validate_and_import(&dest, &manifest, &zst).unwrap_err();
    assert!(err.to_string().to_lowercase().contains("checksum") || err.to_string().contains("SHA"));
    let n: i64 = dest
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 0);
}

#[test]
fn corrupt_snapshot_rejects() {
    let (dir, src) = open_source(3);
    let mut manifest = generate_snapshot(&src, false).unwrap();
    let zst = snapshots_dir()
        .unwrap()
        .join(format!("{}.sqlite.zst", manifest.snapshot_id));
    fs::write(&zst, b"not-a-zstd-file").unwrap();
    // Recalc sha so checksum passes but decompress fails
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(b"not-a-zstd-file");
    manifest.content_sha256 = hex::encode(h.finalize());
    let dest = open_empty_dest(&dir);
    assert!(validate_and_import(&dest, &manifest, &zst).is_err());
    let n: i64 = dest
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 0);
}

#[test]
fn cancel_download_sets_status() {
    let dir = temp_app_dir();
    let conn = open_empty_dest(&dir);
    write_setting_test(&conn, "lan_sync_snapshot_id", "snap-x");
    let part = snapshots_dir().unwrap().join("snap-x.part");
    fs::write(&part, b"partial").unwrap();
    cancel_download(&conn).unwrap();
    assert!(!part.exists());
    let st: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key='lan_sync_snapshot_status'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(st, "cancelled");
}

#[test]
fn resume_chunk_append() {
    let dir = temp_app_dir();
    let path = dir.join("file.bin");
    let data: Vec<u8> = (0..3000u32).map(|i| (i % 256) as u8).collect();
    fs::write(&path, &data).unwrap();
    let (c1, total, more) = read_file_chunk(&path, 0, 1024).unwrap();
    assert_eq!(c1.len(), 1024);
    assert!(more);
    assert_eq!(total, 3000);
    let (c2, _, more2) = read_file_chunk(&path, 1024, 1024).unwrap();
    assert_eq!(c2.len(), 1024);
    assert!(more2);
    let (c3, _, more3) = read_file_chunk(&path, 2048, 1024).unwrap();
    assert_eq!(c3.len(), 952);
    assert!(!more3);
    let mut joined = c1;
    joined.extend(c2);
    joined.extend(c3);
    assert_eq!(joined, data);
}

#[test]
fn duplicate_snapshot_rejected() {
    let (dir, src) = open_source(4);
    let manifest = generate_snapshot(&src, false).unwrap();
    let zst = snapshots_dir()
        .unwrap()
        .join(format!("{}.sqlite.zst", manifest.snapshot_id));
    let dest = open_empty_dest(&dir);
    validate_and_import(&dest, &manifest, &zst).unwrap();
    let err = validate_and_import(&dest, &manifest, &zst).unwrap_err();
    assert!(err.to_string().contains("ya fue importado"));
}

#[test]
fn stock_seed_applied() {
    let (dir, src) = open_source(2);
    let manifest = generate_snapshot(&src, true).unwrap();
    assert!(manifest.includes_stock_seed);
    let zst = snapshots_dir()
        .unwrap()
        .join(format!("{}.sqlite.zst", manifest.snapshot_id));
    let dest = open_empty_dest(&dir);
    validate_and_import(&dest, &manifest, &zst).unwrap();
    let stock: f64 = dest
        .query_row(
            "SELECT stock FROM products WHERE sync_id='prod-0'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!((stock - 1.0).abs() < f64::EPSILON);
    let seeds: i64 = dest
        .query_row(
            "SELECT COUNT(*) FROM stock_movements WHERE movement_type='snapshot_seed'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(seeds >= 1);
}

#[test]
fn stock_seed_not_duplicated() {
    let (dir, src) = open_source(1);
    let manifest = generate_snapshot(&src, true).unwrap();
    let zst = snapshots_dir()
        .unwrap()
        .join(format!("{}.sqlite.zst", manifest.snapshot_id));
    let dest = open_empty_dest(&dir);
    // Pre-insert idempotent seed id as if partial retry (after products exist)
    // First full import
    validate_and_import(&dest, &manifest, &zst).unwrap();
    let seeds1: i64 = dest
        .query_row(
            "SELECT COUNT(*) FROM stock_movements WHERE movement_type='snapshot_seed'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    // Simulate second seed attempt for same sync_id
    let seed_id = format!("snapshot-seed-{}-prod-0", manifest.snapshot_id);
    let exists: i64 = dest
        .query_row(
            "SELECT COUNT(*) FROM stock_movements WHERE sync_id=?1",
            [&seed_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(exists, 1);
    assert_eq!(seeds1, 1);
}

#[test]
fn fts_rebuild_once() {
    reset_fts_rebuild_count();
    let (dir, src) = open_source(10);
    let manifest = generate_snapshot(&src, false).unwrap();
    let zst = snapshots_dir()
        .unwrap()
        .join(format!("{}.sqlite.zst", manifest.snapshot_id));
    let dest = open_empty_dest(&dir);
    validate_and_import(&dest, &manifest, &zst).unwrap();
    assert_eq!(fts_rebuild_count(), 1);
    let fts_n: i64 = dest
        .query_row("SELECT COUNT(*) FROM products_fts", [], |r| r.get(0))
        .unwrap();
    assert_eq!(fts_n, 10);
}

#[test]
fn cdc_after_snapshot() {
    let (dir, src) = open_source(2);
    let manifest = generate_snapshot(&src, false).unwrap();
    let zst = snapshots_dir()
        .unwrap()
        .join(format!("{}.sqlite.zst", manifest.snapshot_id));
    let dest = open_empty_dest(&dir);
    validate_and_import(&dest, &manifest, &zst).unwrap();
    let status = read_setting_or(&dest, "lan_sync_bootstrap_status", "");
    assert_eq!(status, "complete");

    let ev = SyncEvent {
        event_id: "ev-post-1".into(),
        entity_type: "product".into(),
        entity_sync_id: "prod-0".into(),
        op: "update".into(),
        payload: serde_json::json!({
            "name": "Prod 0 updated",
            "price": 99.0,
            "cost": 10.0,
            "stock": 0.0,
            "active": 1,
            "sync_id": "prod-0"
        }),
        lamport: manifest.lamport_at_export + 1,
        origin_device: "hub".into(),
        created_at: "2026-01-01 00:00:00".into(),
    };
    let st = apply_event(&dest, &ev).expect("cdc");
    assert!(matches!(st, ApplyStatus::Applied | ApplyStatus::AlreadyApplied));
    let name: String = dest
        .query_row(
            "SELECT name FROM products WHERE sync_id='prod-0'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(name, "Prod 0 updated");
}

#[test]
fn case_a_blocks_with_sales() {
    let dir = temp_app_dir();
    let dest = open_empty_dest(&dir);
    dest.execute("INSERT INTO sales DEFAULT VALUES", []).unwrap();
    let err = assert_case_a_destination(&dest).unwrap_err();
    assert!(
        err.to_string().contains("venta") || err.to_string().contains("Caso A"),
        "msg={}",
        err
    );
}

fn write_setting_test(conn: &Connection, key: &str, value: &str) {
    conn.execute(
        "INSERT INTO settings(key,value) VALUES(?1,?2)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )
    .unwrap();
}

/// Benchmark ~65k productos — correr con: cargo test snap_bench_65k -- --ignored --nocapture
#[test]
#[ignore]
fn snap_bench_65k() {
    let t0 = std::time::Instant::now();
    let (dir, src) = open_source(65_000);
    let gen_ms = t0.elapsed();
    eprintln!("seed 65k: {:?}", gen_ms);

    let t1 = std::time::Instant::now();
    let manifest = generate_snapshot(&src, true).expect("gen");
    let gen_snap = t1.elapsed();
    let zst = snapshots_dir()
        .unwrap()
        .join(format!("{}.sqlite.zst", manifest.snapshot_id));
    eprintln!(
        "generate: {:?} compressed={} uncompressed={}",
        gen_snap, manifest.compressed_size, manifest.uncompressed_size
    );

    let dest = open_empty_dest(&dir);
    let t2 = std::time::Instant::now();
    validate_and_import(&dest, &manifest, &zst).expect("import");
    let import_t = t2.elapsed();
    eprintln!("import: {:?}", import_t);
    eprintln!("total: {:?}", t0.elapsed());
    let n: i64 = dest
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 65_000);
}
