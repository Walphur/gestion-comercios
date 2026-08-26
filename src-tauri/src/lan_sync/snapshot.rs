//! Phase 0.5b — Snapshot de catálogo LAN (MVP Caso A: destino vacío).

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::db_manager::DbManager;
use crate::db_path::get_app_data_dir;
use crate::product_search::rebuild_products_fts_safe;
use crate::settings_util::{read_setting_or, write_setting};

use super::errors::{LanResult, LanSyncError};
use super::outbox::ensure_device_id;

/// Versión de schema del snapshot (independiente del nº de migración app).
/// v2: incluye sync_id de brands + tablas taller (resources, vehicles, appointments, quotes, OTs, remitos, peritajes).
pub const SNAPSHOT_SCHEMA_VERSION: i64 = 2;
pub const CHUNK_SIZE: u64 = 1024 * 1024; // 1 MiB
const SEED_MOVEMENT_TYPE: &str = "snapshot_seed";

static DOWNLOAD_CANCEL: AtomicBool = AtomicBool::new(false);

#[cfg(test)]
thread_local! {
    static TEST_SNAPSHOT_DIR: std::cell::RefCell<Option<PathBuf>> = const { std::cell::RefCell::new(None) };
    static FTS_REBUILD_COUNT: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

#[cfg(test)]
pub fn set_test_snapshot_dir(dir: Option<PathBuf>) {
    TEST_SNAPSHOT_DIR.with(|c| *c.borrow_mut() = dir);
}

#[cfg(test)]
pub fn reset_fts_rebuild_count() {
    FTS_REBUILD_COUNT.with(|c| c.set(0));
}

#[cfg(test)]
pub fn fts_rebuild_count() -> usize {
    FTS_REBUILD_COUNT.with(|c| c.get())
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SnapshotRowCounts {
    pub categories: u64,
    pub suppliers: u64,
    pub brands: u64,
    pub products: u64,
    pub product_barcodes: u64,
    pub product_variants: u64,
    pub customers: u64,
    #[serde(default)]
    pub workshop_resources: u64,
    #[serde(default)]
    pub vehicles: u64,
    #[serde(default)]
    pub appointments: u64,
    #[serde(default)]
    pub quotes: u64,
    #[serde(default)]
    pub service_orders: u64,
    #[serde(default)]
    pub delivery_notes: u64,
    #[serde(default)]
    pub vehicle_inspections: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotManifest {
    pub snapshot_id: String,
    pub schema_version: i64,
    pub app_version: String,
    pub source_device: String,
    pub generated_at: String,
    pub lamport_at_export: i64,
    pub generation: i64,
    pub row_counts: SnapshotRowCounts,
    pub content_sha256: String,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
    pub includes_stock_seed: bool,
    pub includes_variants: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotPreview {
    pub products: u64,
    pub categories: u64,
    pub customers: u64,
    pub suppliers: u64,
    pub brands: u64,
    pub variants: u64,
    pub estimated_uncompressed_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotUiState {
    pub status: String,
    pub snapshot_id: String,
    pub applied_id: String,
    pub includes_stock_seed: bool,
    pub download_offset: u64,
    pub last_error: String,
    pub manifest: Option<SnapshotManifest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProgress {
    pub phase: String,
    pub done: u64,
    pub total: u64,
    pub message: String,
}

fn snapshots_dir() -> LanResult<PathBuf> {
    #[cfg(test)]
    {
        if let Some(dir) = TEST_SNAPSHOT_DIR.with(|c| c.borrow().clone()) {
            fs::create_dir_all(&dir).map_err(LanSyncError::Io)?;
            return Ok(dir);
        }
    }
    let dir = get_app_data_dir()
        .map_err(LanSyncError::Config)?
        .join("lan_snapshots");
    fs::create_dir_all(&dir).map_err(LanSyncError::Io)?;
    Ok(dir)
}

fn published_paths(snapshot_id: &str) -> LanResult<(PathBuf, PathBuf)> {
    let dir = snapshots_dir()?;
    Ok((
        dir.join(format!("{snapshot_id}.sqlite.zst")),
        dir.join(format!("{snapshot_id}.manifest.json")),
    ))
}

fn incoming_part_path(snapshot_id: &str) -> LanResult<PathBuf> {
    Ok(snapshots_dir()?.join(format!("{snapshot_id}.part")))
}

fn count_table(conn: &Connection, table: &str) -> LanResult<u64> {
    let n: i64 = conn
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .map_err(LanSyncError::db)?;
    Ok(n as u64)
}

fn table_exists(conn: &Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
        [table],
        |_| Ok(1i64),
    )
    .optional()
    .ok()
    .flatten()
    .is_some()
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> bool {
    conn.prepare(&format!("SELECT {column} FROM {table} LIMIT 0"))
        .is_ok()
}

fn copy_table_if_exists(live: &Connection, sql: &str, source_table: &str) -> LanResult<()> {
    if !table_exists(live, source_table) {
        return Ok(());
    }
    live.execute_batch(sql).map_err(LanSyncError::db)?;
    Ok(())
}

pub fn catalog_preview(conn: &Connection) -> LanResult<SnapshotPreview> {
    let products = count_table(conn, "products")?;
    Ok(SnapshotPreview {
        products,
        categories: count_table(conn, "categories")?,
        customers: count_table(conn, "customers")?,
        suppliers: count_table(conn, "suppliers")?,
        brands: count_table(conn, "brands").unwrap_or(0),
        variants: count_table(conn, "product_variants").unwrap_or(0),
        // Heurística ~400 bytes/producto + overhead
        estimated_uncompressed_bytes: products.saturating_mul(400)
            + count_table(conn, "categories")?.saturating_mul(80),
    })
}

/// Caso A: destino sin catálogo operativo. Bloquea si hay ventas o productos.
pub fn assert_case_a_destination(conn: &Connection) -> LanResult<()> {
    let sales: i64 = conn
        .query_row("SELECT COUNT(*) FROM sales", [], |r| r.get(0))
        .unwrap_or(0);
    if sales > 0 {
        return Err(LanSyncError::Other(
            format!(
                "Caso A: esta PC tiene {sales} venta(s). No se puede importar el snapshot. Usá una base vacía (backup antes) o reconciliación (futuro)."
            ),
        ));
    }
    let products: i64 = conn
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .unwrap_or(0);
    if products > 0 {
        return Err(LanSyncError::Other(
            format!(
                "Caso A: esta PC ya tiene {products} producto(s). El snapshot solo importa en una PC vacía. Vaciá el catálogo (con backup) o usá otra instalación limpia."
            ),
        ));
    }
    Ok(())
}

pub fn load_ui_state(conn: &Connection) -> LanResult<SnapshotUiState> {
    let snapshot_id = read_setting_or(conn, "lan_sync_snapshot_id", "");
    let mut manifest = None;
    if !snapshot_id.is_empty() {
        if let Ok((_, mpath)) = published_paths(&snapshot_id) {
            if mpath.exists() {
                if let Ok(raw) = fs::read_to_string(&mpath) {
                    manifest = serde_json::from_str(&raw).ok();
                }
            }
        }
    }
    Ok(SnapshotUiState {
        status: read_setting_or(conn, "lan_sync_snapshot_status", "off"),
        snapshot_id,
        applied_id: read_setting_or(conn, "lan_sync_snapshot_applied_id", ""),
        includes_stock_seed: read_setting_or(conn, "lan_sync_snapshot_includes_stock_seed", "1")
            != "0",
        download_offset: read_setting_or(conn, "lan_sync_snapshot_download_offset", "0")
            .parse()
            .unwrap_or(0),
        last_error: read_setting_or(conn, "lan_sync_snapshot_last_error", ""),
        manifest,
    })
}

fn sha256_file(path: &Path) -> LanResult<String> {
    let mut file = File::open(path).map_err(LanSyncError::Io)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(LanSyncError::Io)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn attach_and_copy(live: &Connection, staging_path: &Path) -> LanResult<SnapshotRowCounts> {
    let path_str = staging_path
        .to_str()
        .ok_or_else(|| LanSyncError::Config("ruta snapshot inválida".into()))?
        .replace('\'', "''");
    live.execute_batch(&format!("ATTACH DATABASE '{path_str}' AS snap"))
        .map_err(LanSyncError::db)?;

    let result = (|| -> LanResult<SnapshotRowCounts> {
        live.execute_batch(
            "
            CREATE TABLE snap.categories AS
              SELECT id, name, sync_id, created_at, updated_at, sync_lamport, sync_origin
              FROM main.categories;
            CREATE TABLE snap.suppliers AS
              SELECT id, name, phone, notes, sync_id, created_at, updated_at, sync_lamport, sync_origin
              FROM main.suppliers;
            CREATE TABLE snap.products AS
              SELECT id, sku, barcode, name, description, category_id, brand_id, supplier_id,
                     cost, price, stock, min_stock, unit, tax_rate, has_variants, active,
                     sync_id, created_at, updated_at, sync_lamport, sync_origin,
                     catalog_source, expires_at, unit_type, track_batches, is_kit, batch_policy
              FROM main.products;
            CREATE TABLE snap.product_barcodes AS
              SELECT id, product_id, barcode, label, quantity_factor, is_primary
              FROM main.product_barcodes;
            CREATE TABLE snap.product_variants AS
              SELECT id, product_id, attributes, sku, barcode, price, stock
              FROM main.product_variants;
            CREATE TABLE snap.customers AS
              SELECT id, name, phone, document, email, credit_limit, notes, active,
                     sync_id, created_at, updated_at, sync_lamport, sync_origin
              FROM main.customers;
            ",
        )
        .map_err(LanSyncError::db)?;

        // brands: sync_id puede no existir en DBs de test antiguas
        if column_exists(live, "brands", "sync_id") {
            live.execute_batch(
                "CREATE TABLE snap.brands AS
                   SELECT id, name, sync_id, created_at FROM main.brands;",
            )
            .map_err(LanSyncError::db)?;
        } else {
            live.execute_batch(
                "CREATE TABLE snap.brands AS
                   SELECT id, name, CAST(NULL AS TEXT) AS sync_id, created_at FROM main.brands;",
            )
            .map_err(LanSyncError::db)?;
        }

        // Taller / clínica (si las tablas existen en esta instalación)
        copy_table_if_exists(
            live,
            "CREATE TABLE snap.workshop_resources AS
               SELECT id, name, notes, active, sort_order, sync_id, created_at, updated_at
               FROM main.workshop_resources;",
            "workshop_resources",
        )?;
        copy_table_if_exists(
            live,
            "CREATE TABLE snap.vehicles AS
               SELECT id, customer_id, plate, brand, model, year, odometer_km, notes, active,
                      sync_id, created_at, updated_at
               FROM main.vehicles;",
            "vehicles",
        )?;
        copy_table_if_exists(
            live,
            "CREATE TABLE snap.appointments AS
               SELECT id, customer_id, vehicle_id, resource_id, title, resource_name, subject_notes,
                      status, starts_at, ends_at, notes, sync_id, created_at, updated_at
               FROM main.appointments;",
            "appointments",
        )?;
        copy_table_if_exists(
            live,
            "CREATE TABLE snap.quotes AS
               SELECT id, quote_number, customer_id, vehicle_id, appointment_id, status,
                      subtotal, discount_pct, total, notes, valid_until, sync_id, created_at, updated_at
               FROM main.quotes;",
            "quotes",
        )?;
        copy_table_if_exists(
            live,
            "CREATE TABLE snap.quote_items AS
               SELECT id, quote_id, product_id, name, qty, unit_price, discount_pct, line_total,
                      sort_order, sync_id
               FROM main.quote_items;",
            "quote_items",
        )?;
        copy_table_if_exists(
            live,
            "CREATE TABLE snap.service_orders AS
               SELECT id, order_number, customer_id, vehicle_id, appointment_id, quote_id,
                      odometer_km, title, subject_notes, status, subtotal, discount_pct, total,
                      notes, stock_applied, sync_id, created_at, updated_at
               FROM main.service_orders;",
            "service_orders",
        )?;
        copy_table_if_exists(
            live,
            "CREATE TABLE snap.service_order_items AS
               SELECT id, order_id, product_id, variant_id, name, qty, unit_price, discount_pct,
                      line_total, is_labor, sort_order, sync_id
               FROM main.service_order_items;",
            "service_order_items",
        )?;
        copy_table_if_exists(
            live,
            "CREATE TABLE snap.delivery_notes AS
               SELECT id, note_number, customer_id, destination, status, notes, issued_at,
                      stock_applied, sync_id, created_at, updated_at
               FROM main.delivery_notes;",
            "delivery_notes",
        )?;
        copy_table_if_exists(
            live,
            "CREATE TABLE snap.delivery_note_items AS
               SELECT id, note_id, product_id, name, qty, sort_order
               FROM main.delivery_note_items;",
            "delivery_note_items",
        )?;
        copy_table_if_exists(
            live,
            "CREATE TABLE snap.vehicle_inspections AS
               SELECT id, inspection_number, vehicle_id, customer_id, odometer_km, fuel_level,
                      exterior_condition, interior_condition, belongings, customer_reported,
                      notes, received_by, service_order_id, sync_id, created_at, updated_at
               FROM main.vehicle_inspections;",
            "vehicle_inspections",
        )?;

        Ok(SnapshotRowCounts {
            categories: count_attached(live, "snap.categories")?,
            suppliers: count_attached(live, "snap.suppliers")?,
            brands: count_attached(live, "snap.brands")?,
            products: count_attached(live, "snap.products")?,
            product_barcodes: count_attached(live, "snap.product_barcodes")?,
            product_variants: count_attached(live, "snap.product_variants")?,
            customers: count_attached(live, "snap.customers")?,
            workshop_resources: count_attached(live, "snap.workshop_resources").unwrap_or(0),
            vehicles: count_attached(live, "snap.vehicles").unwrap_or(0),
            appointments: count_attached(live, "snap.appointments").unwrap_or(0),
            quotes: count_attached(live, "snap.quotes").unwrap_or(0),
            service_orders: count_attached(live, "snap.service_orders").unwrap_or(0),
            delivery_notes: count_attached(live, "snap.delivery_notes").unwrap_or(0),
            vehicle_inspections: count_attached(live, "snap.vehicle_inspections").unwrap_or(0),
        })
    })();

    let _ = live.execute_batch("DETACH DATABASE snap");
    result
}

fn count_attached(conn: &Connection, table: &str) -> LanResult<u64> {
    let n: i64 = conn
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .map_err(LanSyncError::db)?;
    Ok(n as u64)
}

/// Genera snapshot en disco y lo publica para descarga LAN.
pub fn generate_snapshot(conn: &Connection, includes_stock_seed: bool) -> LanResult<SnapshotManifest> {
    write_setting(conn, "lan_sync_snapshot_status", "generating").map_err(LanSyncError::db)?;
    write_setting(
        conn,
        "lan_sync_snapshot_includes_stock_seed",
        if includes_stock_seed { "1" } else { "0" },
    )
    .map_err(LanSyncError::db)?;

    let device = ensure_device_id(conn)?;
    let generation = read_setting_or(conn, "lan_sync_bootstrap_generation", "0")
        .parse::<i64>()
        .unwrap_or(0)
        + 1;
    write_setting(
        conn,
        "lan_sync_bootstrap_generation",
        &generation.to_string(),
    )
    .map_err(LanSyncError::db)?;

    let snapshot_id = format!("snap-{}", super::outbox::new_uuid());
    let dir = snapshots_dir()?;
    let sqlite_path = dir.join(format!("{snapshot_id}.sqlite"));
    let zst_path = dir.join(format!("{snapshot_id}.sqlite.zst"));
    let manifest_path = dir.join(format!("{snapshot_id}.manifest.json"));

    if sqlite_path.exists() {
        let _ = fs::remove_file(&sqlite_path);
    }
    // Create empty then attach-copy
    {
        let staging = Connection::open(&sqlite_path).map_err(LanSyncError::db)?;
        staging
            .execute_batch("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;")
            .map_err(LanSyncError::db)?;
        drop(staging);
    }

    let counts = match attach_and_copy(conn, &sqlite_path) {
        Ok(c) => c,
        Err(e) => {
            // Fallback customers without sync columns
            let _ = fs::remove_file(&sqlite_path);
            write_setting(conn, "lan_sync_snapshot_status", "failed").ok();
            write_setting(conn, "lan_sync_snapshot_last_error", &e.to_string()).ok();
            return Err(e);
        }
    };

    let uncompressed_size = fs::metadata(&sqlite_path).map_err(LanSyncError::Io)?.len();
    compress_zstd(&sqlite_path, &zst_path)?;
    let _ = fs::remove_file(&sqlite_path);
    let compressed_size = fs::metadata(&zst_path).map_err(LanSyncError::Io)?.len();
    let content_sha256 = sha256_file(&zst_path)?;

    let lamport_at_export: i64 = read_setting_or(conn, "lan_sync_lamport", "0")
        .parse()
        .unwrap_or(0);

    let manifest = SnapshotManifest {
        snapshot_id: snapshot_id.clone(),
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        source_device: device,
        generated_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        lamport_at_export,
        generation,
        row_counts: counts,
        content_sha256,
        compressed_size,
        uncompressed_size,
        includes_stock_seed,
        includes_variants: true,
    };

    let json = serde_json::to_string_pretty(&manifest).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
    fs::write(&manifest_path, json).map_err(LanSyncError::Io)?;

    write_setting(conn, "lan_sync_snapshot_id", &snapshot_id).map_err(LanSyncError::db)?;
    write_setting(conn, "lan_sync_snapshot_status", "ready").map_err(LanSyncError::db)?;
    write_setting(conn, "lan_sync_snapshot_last_error", "").map_err(LanSyncError::db)?;

    // Encolar taller existente una vez (CDC) para cajas que no usan snapshot vacío.
    let _ = super::workshop::enqueue_existing_workshop_once(conn);
    let _ = super::stock_seed::ensure_catalog_sync_ids(conn);
    let _ = super::stock_seed::reconcile_stock_movements_for_lan(conn);

    // No inundar cajas por CDC con el súper: el catálogo viaja por snapshot.
    let cleared = super::outbox::ack_pending_catalog_outbox(conn, "superseded_by_snapshot")
        .unwrap_or(0);
    if cleared > 0 {
        let _ = super::outbox::append_log(
            conn,
            "out",
            None,
            &format!("snapshot: outbox catálogo ACK ({cleared} eventos)"),
            Some(&snapshot_id),
        );
    }

    Ok(manifest)
}

fn compress_zstd(src: &Path, dst: &Path) -> LanResult<()> {
    let mut input = File::open(src).map_err(LanSyncError::Io)?;
    let mut output = File::create(dst).map_err(LanSyncError::Io)?;
    zstd::stream::copy_encode(&mut input, &mut output, 3).map_err(|e| LanSyncError::Io(e))?;
    Ok(())
}

fn decompress_zstd(src: &Path, dst: &Path) -> LanResult<()> {
    let mut input = File::open(src).map_err(LanSyncError::Io)?;
    let mut output = File::create(dst).map_err(LanSyncError::Io)?;
    zstd::stream::copy_decode(&mut input, &mut output).map_err(|e| LanSyncError::Io(e))?;
    Ok(())
}

pub fn read_published_manifest(conn: &Connection) -> LanResult<Option<SnapshotManifest>> {
    let id = read_setting_or(conn, "lan_sync_snapshot_id", "");
    if id.is_empty() {
        return Ok(None);
    }
    let (_, mpath) = published_paths(&id)?;
    if !mpath.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&mpath).map_err(LanSyncError::Io)?;
    let m: SnapshotManifest =
        serde_json::from_str(&raw).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
    Ok(Some(m))
}

pub fn published_zst_path(conn: &Connection) -> LanResult<Option<PathBuf>> {
    let id = read_setting_or(conn, "lan_sync_snapshot_id", "");
    if id.is_empty() {
        return Ok(None);
    }
    let (zst, _) = published_paths(&id)?;
    if zst.exists() {
        Ok(Some(zst))
    } else {
        Ok(None)
    }
}

pub fn read_file_chunk(path: &Path, offset: u64, limit: u64) -> LanResult<(Vec<u8>, u64, bool)> {
    let meta = fs::metadata(path).map_err(LanSyncError::Io)?;
    let total = meta.len();
    if offset >= total {
        return Ok((Vec::new(), total, false));
    }
    let mut f = File::open(path).map_err(LanSyncError::Io)?;
    use std::io::Seek;
    f.seek(std::io::SeekFrom::Start(offset))
        .map_err(LanSyncError::Io)?;
    let to_read = limit.min(total - offset) as usize;
    let mut buf = vec![0u8; to_read];
    let mut read = 0;
    while read < to_read {
        let n = f.read(&mut buf[read..]).map_err(LanSyncError::Io)?;
        if n == 0 {
            break;
        }
        read += n;
    }
    buf.truncate(read);
    let next = offset + read as u64;
    let has_more = next < total;
    Ok((buf, total, has_more))
}

/// Descarga snapshot del hub a archivo .part (reanudable).
pub async fn download_snapshot(
    host: &str,
    port: u16,
    token: &str,
    manifest: &SnapshotManifest,
) -> LanResult<PathBuf> {
    DOWNLOAD_CANCEL.store(false, Ordering::SeqCst);
    let part = incoming_part_path(&manifest.snapshot_id)?;
    let mut offset = if part.exists() {
        fs::metadata(&part).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    DbManager::with_connection(|conn| {
        write_setting(conn, "lan_sync_snapshot_status", "downloading")?;
        write_setting(
            conn,
            "lan_sync_snapshot_download_offset",
            &offset.to_string(),
        )?;
        write_setting(conn, "lan_sync_snapshot_id", &manifest.snapshot_id)?;
        Ok(())
    })
    .map_err(|e: String| LanSyncError::Config(e))?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| LanSyncError::Http(e.to_string()))?;

    loop {
        if DOWNLOAD_CANCEL.load(Ordering::SeqCst) {
            write_setting_status("cancelled")?;
            return Err(LanSyncError::InvalidState("Descarga cancelada".into()));
        }
        let url = format!(
            "http://{host}:{port}/v1/snapshot/download?offset={offset}&limit={CHUNK_SIZE}"
        );
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .map_err(|e| LanSyncError::Http(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(LanSyncError::Http(format!(
                "download {}",
                resp.status()
            )));
        }
        let has_more = resp
            .headers()
            .get("x-snapshot-has-more")
            .and_then(|v| v.to_str().ok())
            == Some("1");
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| LanSyncError::Http(e.to_string()))?;
        if bytes.is_empty() && !has_more {
            break;
        }
        {
            let mut f = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&part)
                .map_err(LanSyncError::Io)?;
            f.write_all(&bytes).map_err(LanSyncError::Io)?;
        }
        offset += bytes.len() as u64;
        let _ = DbManager::with_connection(|conn| {
            write_setting(
                conn,
                "lan_sync_snapshot_download_offset",
                &offset.to_string(),
            )
        });
        if !has_more {
            break;
        }
    }

    let dest = snapshots_dir()?.join(format!("{}.sqlite.zst", manifest.snapshot_id));
    if dest.exists() {
        let _ = fs::remove_file(&dest);
    }
    fs::rename(&part, &dest).map_err(LanSyncError::Io)?;
    let mpath = snapshots_dir()?.join(format!("{}.manifest.json", manifest.snapshot_id));
    fs::write(
        &mpath,
        serde_json::to_string_pretty(manifest).map_err(|e| LanSyncError::Protocol(e.to_string()))?,
    )
    .map_err(LanSyncError::Io)?;
    Ok(dest)
}

fn write_setting_status(status: &str) -> LanResult<()> {
    DbManager::with_connection(|conn| {
        write_setting(conn, "lan_sync_snapshot_status", status).map_err(|e| e.to_string())
    })
    .map_err(|e: String| LanSyncError::Config(e))
}

pub fn cancel_download(conn: &Connection) -> LanResult<()> {
    DOWNLOAD_CANCEL.store(true, Ordering::SeqCst);
    let id = read_setting_or(conn, "lan_sync_snapshot_id", "");
    if !id.is_empty() {
        let part = incoming_part_path(&id)?;
        let _ = fs::remove_file(part);
    }
    write_setting(conn, "lan_sync_snapshot_status", "cancelled").map_err(LanSyncError::db)?;
    write_setting(conn, "lan_sync_snapshot_download_offset", "0").map_err(LanSyncError::db)?;
    Ok(())
}

/// Valida e importa snapshot (Caso A). DB productiva intacta si falla.
pub fn validate_and_import(
    conn: &Connection,
    manifest: &SnapshotManifest,
    zst_path: &Path,
) -> LanResult<ImportProgress> {
    let applied = read_setting_or(conn, "lan_sync_snapshot_applied_id", "");
    if applied == manifest.snapshot_id {
        return Err(LanSyncError::InvalidState(
            "Este catálogo ya fue importado.".into(),
        ));
    }

    assert_case_a_destination(conn)?;

    if manifest.schema_version > SNAPSHOT_SCHEMA_VERSION {
        return Err(LanSyncError::Protocol(format!(
            "schema_version {} no soportado (max {})",
            manifest.schema_version, SNAPSHOT_SCHEMA_VERSION
        )));
    }

    write_setting(conn, "lan_sync_snapshot_status", "validating").map_err(LanSyncError::db)?;

    let sha = sha256_file(zst_path)?;
    if sha != manifest.content_sha256 {
        write_setting(conn, "lan_sync_snapshot_status", "failed").ok();
        return Err(LanSyncError::Protocol(
            "Checksum SHA-256 incorrecto — snapshot corrupto o incompleto.".into(),
        ));
    }

    let staging = snapshots_dir()?.join(format!("{}.sqlite", manifest.snapshot_id));
    if staging.exists() {
        let _ = fs::remove_file(&staging);
    }
    decompress_zstd(zst_path, &staging)?;

    let snap = Connection::open(&staging).map_err(LanSyncError::db)?;
    let products_n = count_attached(&snap, "products")?;
    if products_n != manifest.row_counts.products {
        let _ = fs::remove_file(&staging);
        return Err(LanSyncError::Protocol(format!(
            "row_counts.products manifest={} staging={products_n}",
            manifest.row_counts.products
        )));
    }

    write_setting(conn, "lan_sync_snapshot_status", "importing").map_err(LanSyncError::db)?;

    // Import in one big transaction — Case A empty dest
    let tx = conn.unchecked_transaction().map_err(LanSyncError::db)?;
    write_setting(&tx, "lan_sync_applying", "1").map_err(LanSyncError::db)?;

    let import_result = (|| -> LanResult<()> {
        let mut cat_map: HashMap<i64, i64> = HashMap::new();
        let mut brand_map: HashMap<i64, i64> = HashMap::new();
        let mut sup_map: HashMap<i64, i64> = HashMap::new();
        let mut prod_map: HashMap<i64, i64> = HashMap::new();
        let mut cust_map: HashMap<i64, i64> = HashMap::new();
        let mut resource_map: HashMap<i64, i64> = HashMap::new();
        let mut vehicle_map: HashMap<i64, i64> = HashMap::new();
        let mut appointment_map: HashMap<i64, i64> = HashMap::new();
        let mut quote_map: HashMap<i64, i64> = HashMap::new();
        let mut so_map: HashMap<i64, i64> = HashMap::new();
        let mut dn_map: HashMap<i64, i64> = HashMap::new();

        // categories
        {
            let mut stmt = snap
                .prepare("SELECT id, name, sync_id, created_at, updated_at, sync_lamport, sync_origin FROM categories")
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, Option<String>>(3)?,
                        r.get::<_, Option<String>>(4)?,
                        r.get::<_, i64>(5).unwrap_or(0),
                        r.get::<_, Option<String>>(6)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (sid, name, sync_id, created, updated, lp, origin) =
                    row.map_err(LanSyncError::db)?;
                let sync_id = sync_id.unwrap_or_else(|| format!("imported-cat-{sid}"));
                tx.execute(
                    "INSERT INTO categories (name, sync_id, created_at, updated_at, sync_lamport, sync_origin)
                     VALUES (?1, ?2, COALESCE(?3, datetime('now','localtime')), COALESCE(?4, datetime('now','localtime')), ?5, ?6)",
                    params![name, sync_id, created, updated, lp, origin],
                )
                .map_err(LanSyncError::db)?;
                cat_map.insert(sid, tx.last_insert_rowid());
            }
        }

        // brands
        {
            let has_sync = column_exists(&snap, "brands", "sync_id");
            let sql = if has_sync {
                "SELECT id, name, created_at, sync_id FROM brands"
            } else {
                "SELECT id, name, created_at, NULL FROM brands"
            };
            let mut stmt = snap.prepare(sql).map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, Option<String>>(3)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (sid, name, created, sync_id) = row.map_err(LanSyncError::db)?;
                let sync_id = sync_id.unwrap_or_else(|| format!("imported-brand-{sid}"));
                if column_exists(&tx, "brands", "sync_id") {
                    tx.execute(
                        "INSERT OR IGNORE INTO brands (name, created_at, sync_id)
                         VALUES (?1, COALESCE(?2, datetime('now','localtime')), ?3)",
                        params![name, created, sync_id],
                    )
                    .map_err(LanSyncError::db)?;
                } else {
                    tx.execute(
                        "INSERT OR IGNORE INTO brands (name, created_at)
                         VALUES (?1, COALESCE(?2, datetime('now','localtime')))",
                        params![name, created],
                    )
                    .map_err(LanSyncError::db)?;
                }
                let dest: i64 = tx
                    .query_row("SELECT id FROM brands WHERE name = ?1", [&name], |r| r.get(0))
                    .map_err(LanSyncError::db)?;
                brand_map.insert(sid, dest);
            }
        }

        // suppliers
        {
            let mut stmt = snap
                .prepare(
                    "SELECT id, name, phone, notes, sync_id, created_at, updated_at, sync_lamport, sync_origin FROM suppliers",
                )
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, Option<String>>(3)?,
                        r.get::<_, Option<String>>(4)?,
                        r.get::<_, Option<String>>(5)?,
                        r.get::<_, Option<String>>(6)?,
                        r.get::<_, i64>(7).unwrap_or(0),
                        r.get::<_, Option<String>>(8)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (sid, name, phone, notes, sync_id, created, updated, lp, origin) =
                    row.map_err(LanSyncError::db)?;
                let sync_id = sync_id.unwrap_or_else(|| format!("imported-sup-{sid}"));
                tx.execute(
                    "INSERT INTO suppliers (name, phone, notes, sync_id, created_at, updated_at, sync_lamport, sync_origin)
                     VALUES (?1,?2,?3,?4, COALESCE(?5, datetime('now','localtime')), COALESCE(?6, datetime('now','localtime')), ?7, ?8)",
                    params![name, phone, notes, sync_id, created, updated, lp, origin],
                )
                .map_err(LanSyncError::db)?;
                // name UNIQUE may conflict — try get existing
                let dest = tx.last_insert_rowid();
                if dest > 0 {
                    sup_map.insert(sid, dest);
                } else {
                    let d: i64 = tx
                        .query_row("SELECT id FROM suppliers WHERE name = ?1", [&name], |r| {
                            r.get(0)
                        })
                        .map_err(LanSyncError::db)?;
                    sup_map.insert(sid, d);
                }
            }
        }

        // products (+ stock source values for seeds)
        let mut stock_seeds: Vec<(String, f64)> = Vec::new();
        {
            let mut stmt = snap
                .prepare(
                    "SELECT id, sku, barcode, name, description, category_id, brand_id, supplier_id,
                            cost, price, stock, min_stock, unit, tax_rate, has_variants, active,
                            sync_id, created_at, updated_at, sync_lamport, sync_origin
                     FROM products",
                )
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, Option<String>>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, Option<String>>(4)?,
                        r.get::<_, Option<i64>>(5)?,
                        r.get::<_, Option<i64>>(6)?,
                        r.get::<_, Option<i64>>(7)?,
                        r.get::<_, f64>(8)?,
                        r.get::<_, f64>(9)?,
                        r.get::<_, f64>(10)?,
                        r.get::<_, f64>(11)?,
                        r.get::<_, String>(12)?,
                        r.get::<_, f64>(13)?,
                        r.get::<_, i64>(14)?,
                        r.get::<_, i64>(15)?,
                        r.get::<_, Option<String>>(16)?,
                        r.get::<_, Option<String>>(17)?,
                        r.get::<_, Option<String>>(18)?,
                        r.get::<_, i64>(19).unwrap_or(0),
                        r.get::<_, Option<String>>(20)?,
                    ))
                })
                .map_err(LanSyncError::db)?;

            for row in rows {
                let (
                    sid,
                    sku,
                    barcode,
                    name,
                    description,
                    category_id,
                    brand_id,
                    supplier_id,
                    cost,
                    price,
                    stock,
                    min_stock,
                    unit,
                    tax_rate,
                    has_variants,
                    active,
                    sync_id,
                    created,
                    updated,
                    lp,
                    origin,
                ) = row.map_err(LanSyncError::db)?;
                let sync_id = sync_id.unwrap_or_else(|| format!("imported-prod-{sid}"));
                let cat = category_id.and_then(|c| cat_map.get(&c).copied());
                let brand = brand_id.and_then(|b| brand_map.get(&b).copied());
                let sup = supplier_id.and_then(|s| sup_map.get(&s).copied());
                tx.execute(
                    "INSERT INTO products (sku, barcode, name, description, category_id, brand_id, supplier_id,
                     cost, price, stock, min_stock, unit, tax_rate, has_variants, active, sync_id,
                     created_at, updated_at, sync_lamport, sync_origin)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10,?11,?12,?13,?14,?15,
                             COALESCE(?16, datetime('now','localtime')),
                             COALESCE(?17, datetime('now','localtime')), ?18, ?19)",
                    params![
                        sku,
                        barcode,
                        name,
                        description,
                        cat,
                        brand,
                        sup,
                        cost,
                        price,
                        min_stock,
                        unit,
                        tax_rate,
                        has_variants,
                        active,
                        sync_id,
                        created,
                        updated,
                        lp,
                        origin
                    ],
                )
                .map_err(LanSyncError::db)?;
                let dest = tx.last_insert_rowid();
                prod_map.insert(sid, dest);
                if manifest.includes_stock_seed && stock.abs() > f64::EPSILON {
                    stock_seeds.push((sync_id, stock));
                }
            }
        }

        // barcodes
        {
            let mut stmt = snap
                .prepare(
                    "SELECT product_id, barcode, label, quantity_factor, is_primary FROM product_barcodes",
                )
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, f64>(3)?,
                        r.get::<_, i64>(4)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (pid, barcode, label, qf, primary) = row.map_err(LanSyncError::db)?;
                let Some(&dest_pid) = prod_map.get(&pid) else {
                    continue;
                };
                let _ = tx.execute(
                    "INSERT OR IGNORE INTO product_barcodes (product_id, barcode, label, quantity_factor, is_primary)
                     VALUES (?1,?2,?3,?4,?5)",
                    params![dest_pid, barcode, label, qf, primary],
                );
            }
        }

        // variants — remap product_id
        {
            let mut stmt = snap
                .prepare(
                    "SELECT product_id, attributes, sku, barcode, price, stock FROM product_variants",
                )
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, Option<String>>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, Option<String>>(3)?,
                        r.get::<_, Option<f64>>(4)?,
                        r.get::<_, f64>(5)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (pid, attrs, sku, barcode, price, stock) = row.map_err(LanSyncError::db)?;
                let Some(&dest_pid) = prod_map.get(&pid) else {
                    continue;
                };
                tx.execute(
                    "INSERT INTO product_variants (product_id, attributes, sku, barcode, price, stock)
                     VALUES (?1,?2,?3,?4,?5,?6)",
                    params![dest_pid, attrs, sku, barcode, price, stock],
                )
                .map_err(LanSyncError::db)?;
            }
        }

        // customers (balance always 0)
        {
            let mut stmt = snap
                .prepare(
                    "SELECT id, name, phone, document, email, credit_limit, notes, active, sync_id,
                            created_at, updated_at, sync_lamport, sync_origin FROM customers",
                )
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, Option<String>>(3)?,
                        r.get::<_, Option<String>>(4)?,
                        r.get::<_, f64>(5)?,
                        r.get::<_, Option<String>>(6)?,
                        r.get::<_, i64>(7)?,
                        r.get::<_, Option<String>>(8)?,
                        r.get::<_, Option<String>>(9)?,
                        r.get::<_, Option<String>>(10)?,
                        r.get::<_, i64>(11).unwrap_or(0),
                        r.get::<_, Option<String>>(12)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (
                    sid,
                    name,
                    phone,
                    document,
                    email,
                    credit,
                    notes,
                    active,
                    sync_id,
                    created,
                    updated,
                    lp,
                    origin,
                ) = row.map_err(LanSyncError::db)?;
                let sync_id = sync_id.unwrap_or_else(|| super::outbox::new_uuid());
                tx.execute(
                    "INSERT INTO customers (name, phone, document, email, credit_limit, balance, notes, active,
                     sync_id, created_at, updated_at, sync_lamport, sync_origin)
                     VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,
                             COALESCE(?9, datetime('now','localtime')),
                             COALESCE(?10, datetime('now','localtime')), ?11, ?12)",
                    params![
                        name, phone, document, email, credit, notes, active, sync_id, created,
                        updated, lp, origin
                    ],
                )
                .map_err(LanSyncError::db)?;
                cust_map.insert(sid, tx.last_insert_rowid());
            }
        }

        // ─── Taller (opcional: snapshots v1 sin estas tablas siguen OK) ───
        if table_exists(&snap, "workshop_resources") {
            let mut stmt = snap
                .prepare(
                    "SELECT id, name, notes, active, sort_order, sync_id, created_at, updated_at
                     FROM workshop_resources",
                )
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, i64>(3).unwrap_or(1),
                        r.get::<_, i64>(4).unwrap_or(0),
                        r.get::<_, Option<String>>(5)?,
                        r.get::<_, Option<String>>(6)?,
                        r.get::<_, Option<String>>(7)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (sid, name, notes, active, sort_order, sync_id, created, updated) =
                    row.map_err(LanSyncError::db)?;
                let sync_id = sync_id.unwrap_or_else(|| format!("imported-wr-{sid}"));
                tx.execute(
                    "INSERT INTO workshop_resources (name, notes, active, sort_order, sync_id, created_at, updated_at)
                     VALUES (?1,?2,?3,?4,?5,
                             COALESCE(?6, datetime('now','localtime')),
                             COALESCE(?7, datetime('now','localtime')))",
                    params![name, notes, active, sort_order, sync_id, created, updated],
                )
                .map_err(LanSyncError::db)?;
                resource_map.insert(sid, tx.last_insert_rowid());
            }
        }

        if table_exists(&snap, "vehicles") {
            let mut stmt = snap
                .prepare(
                    "SELECT id, customer_id, plate, brand, model, year, odometer_km, notes, active,
                            sync_id, created_at, updated_at FROM vehicles",
                )
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, Option<i64>>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, Option<String>>(3)?,
                        r.get::<_, Option<String>>(4)?,
                        r.get::<_, Option<i64>>(5)?,
                        r.get::<_, Option<i64>>(6)?,
                        r.get::<_, Option<String>>(7)?,
                        r.get::<_, i64>(8).unwrap_or(1),
                        r.get::<_, Option<String>>(9)?,
                        r.get::<_, Option<String>>(10)?,
                        r.get::<_, Option<String>>(11)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (
                    sid,
                    customer_id,
                    plate,
                    brand,
                    model,
                    year,
                    odometer_km,
                    notes,
                    active,
                    sync_id,
                    created,
                    updated,
                ) = row.map_err(LanSyncError::db)?;
                let sync_id = sync_id.unwrap_or_else(|| format!("imported-veh-{sid}"));
                let cust = customer_id.and_then(|c| cust_map.get(&c).copied());
                tx.execute(
                    "INSERT INTO vehicles (customer_id, plate, brand, model, year, odometer_km, notes, active,
                     sync_id, created_at, updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,
                             COALESCE(?10, datetime('now','localtime')),
                             COALESCE(?11, datetime('now','localtime')))",
                    params![
                        cust, plate, brand, model, year, odometer_km, notes, active, sync_id,
                        created, updated
                    ],
                )
                .map_err(LanSyncError::db)?;
                vehicle_map.insert(sid, tx.last_insert_rowid());
            }
        }

        if table_exists(&snap, "appointments") {
            let mut stmt = snap
                .prepare(
                    "SELECT id, customer_id, vehicle_id, resource_id, title, resource_name, subject_notes,
                            status, starts_at, ends_at, notes, sync_id, created_at, updated_at
                     FROM appointments",
                )
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, Option<i64>>(1)?,
                        r.get::<_, Option<i64>>(2)?,
                        r.get::<_, Option<i64>>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, Option<String>>(5)?,
                        r.get::<_, Option<String>>(6)?,
                        r.get::<_, String>(7)?,
                        r.get::<_, String>(8)?,
                        r.get::<_, String>(9)?,
                        r.get::<_, Option<String>>(10)?,
                        r.get::<_, Option<String>>(11)?,
                        r.get::<_, Option<String>>(12)?,
                        r.get::<_, Option<String>>(13)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (
                    sid,
                    customer_id,
                    vehicle_id,
                    resource_id,
                    title,
                    resource_name,
                    subject_notes,
                    status,
                    starts_at,
                    ends_at,
                    notes,
                    sync_id,
                    created,
                    updated,
                ) = row.map_err(LanSyncError::db)?;
                let sync_id = sync_id.unwrap_or_else(|| format!("imported-appt-{sid}"));
                let cust = customer_id.and_then(|c| cust_map.get(&c).copied());
                let veh = vehicle_id.and_then(|v| vehicle_map.get(&v).copied());
                let res = resource_id.and_then(|r| resource_map.get(&r).copied());
                tx.execute(
                    "INSERT INTO appointments (customer_id, vehicle_id, resource_id, title, resource_name,
                     subject_notes, status, starts_at, ends_at, notes, sync_id, created_at, updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,
                             COALESCE(?12, datetime('now','localtime')),
                             COALESCE(?13, datetime('now','localtime')))",
                    params![
                        cust,
                        veh,
                        res,
                        title,
                        resource_name,
                        subject_notes,
                        status,
                        starts_at,
                        ends_at,
                        notes,
                        sync_id,
                        created,
                        updated
                    ],
                )
                .map_err(LanSyncError::db)?;
                appointment_map.insert(sid, tx.last_insert_rowid());
            }
        }

        if table_exists(&snap, "quotes") {
            let mut stmt = snap
                .prepare(
                    "SELECT id, quote_number, customer_id, vehicle_id, appointment_id, status,
                            subtotal, discount_pct, total, notes, valid_until, sync_id,
                            created_at, updated_at FROM quotes",
                )
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<i64>>(2)?,
                        r.get::<_, Option<i64>>(3)?,
                        r.get::<_, Option<i64>>(4)?,
                        r.get::<_, String>(5)?,
                        r.get::<_, f64>(6)?,
                        r.get::<_, f64>(7)?,
                        r.get::<_, f64>(8)?,
                        r.get::<_, Option<String>>(9)?,
                        r.get::<_, Option<String>>(10)?,
                        r.get::<_, Option<String>>(11)?,
                        r.get::<_, Option<String>>(12)?,
                        r.get::<_, Option<String>>(13)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (
                    sid,
                    quote_number,
                    customer_id,
                    vehicle_id,
                    appointment_id,
                    status,
                    subtotal,
                    discount_pct,
                    total,
                    notes,
                    valid_until,
                    sync_id,
                    created,
                    updated,
                ) = row.map_err(LanSyncError::db)?;
                let sync_id = sync_id.unwrap_or_else(|| format!("imported-quot-{sid}"));
                let cust = customer_id.and_then(|c| cust_map.get(&c).copied());
                let veh = vehicle_id.and_then(|v| vehicle_map.get(&v).copied());
                let appt = appointment_id.and_then(|a| appointment_map.get(&a).copied());
                tx.execute(
                    "INSERT INTO quotes (quote_number, customer_id, vehicle_id, appointment_id, status,
                     subtotal, discount_pct, total, notes, valid_until, sync_id, created_at, updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,
                             COALESCE(?12, datetime('now','localtime')),
                             COALESCE(?13, datetime('now','localtime')))",
                    params![
                        quote_number,
                        cust,
                        veh,
                        appt,
                        status,
                        subtotal,
                        discount_pct,
                        total,
                        notes,
                        valid_until,
                        sync_id,
                        created,
                        updated
                    ],
                )
                .map_err(LanSyncError::db)?;
                quote_map.insert(sid, tx.last_insert_rowid());
            }
            if table_exists(&snap, "quote_items") {
                let mut stmt = snap
                    .prepare(
                        "SELECT quote_id, product_id, name, qty, unit_price, discount_pct, line_total,
                                sort_order, sync_id FROM quote_items",
                    )
                    .map_err(LanSyncError::db)?;
                let rows = stmt
                    .query_map([], |r| {
                        Ok((
                            r.get::<_, i64>(0)?,
                            r.get::<_, Option<i64>>(1)?,
                            r.get::<_, String>(2)?,
                            r.get::<_, f64>(3)?,
                            r.get::<_, f64>(4)?,
                            r.get::<_, f64>(5)?,
                            r.get::<_, f64>(6)?,
                            r.get::<_, i64>(7).unwrap_or(0),
                            r.get::<_, Option<String>>(8)?,
                        ))
                    })
                    .map_err(LanSyncError::db)?;
                for row in rows {
                    let (qid, pid, name, qty, unit_price, disc, line_total, sort_order, sync_id) =
                        row.map_err(LanSyncError::db)?;
                    let Some(&dest_q) = quote_map.get(&qid) else {
                        continue;
                    };
                    let prod = pid.and_then(|p| prod_map.get(&p).copied());
                    let sync_id = sync_id.unwrap_or_else(super::outbox::new_uuid);
                    let _ = tx.execute(
                        "INSERT INTO quote_items (quote_id, product_id, name, qty, unit_price, discount_pct,
                         line_total, sort_order, sync_id)
                         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                        params![
                            dest_q, prod, name, qty, unit_price, disc, line_total, sort_order,
                            sync_id
                        ],
                    );
                }
            }
        }

        if table_exists(&snap, "service_orders") {
            let mut stmt = snap
                .prepare(
                    "SELECT id, order_number, customer_id, vehicle_id, appointment_id, quote_id,
                            odometer_km, title, subject_notes, status, subtotal, discount_pct, total,
                            notes, stock_applied, sync_id, created_at, updated_at FROM service_orders",
                )
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<i64>>(2)?,
                        r.get::<_, Option<i64>>(3)?,
                        r.get::<_, Option<i64>>(4)?,
                        r.get::<_, Option<i64>>(5)?,
                        r.get::<_, Option<i64>>(6)?,
                        r.get::<_, String>(7)?,
                        r.get::<_, Option<String>>(8)?,
                        r.get::<_, String>(9)?,
                        r.get::<_, f64>(10)?,
                        r.get::<_, f64>(11)?,
                        r.get::<_, f64>(12)?,
                        r.get::<_, Option<String>>(13)?,
                        r.get::<_, i64>(14).unwrap_or(0),
                        r.get::<_, Option<String>>(15)?,
                        r.get::<_, Option<String>>(16)?,
                        r.get::<_, Option<String>>(17)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (
                    sid,
                    order_number,
                    customer_id,
                    vehicle_id,
                    appointment_id,
                    quote_id,
                    odometer_km,
                    title,
                    subject_notes,
                    status,
                    subtotal,
                    discount_pct,
                    total,
                    notes,
                    stock_applied,
                    sync_id,
                    created,
                    updated,
                ) = row.map_err(LanSyncError::db)?;
                let sync_id = sync_id.unwrap_or_else(|| format!("imported-so-{sid}"));
                let cust = customer_id.and_then(|c| cust_map.get(&c).copied());
                let veh = vehicle_id.and_then(|v| vehicle_map.get(&v).copied());
                let appt = appointment_id.and_then(|a| appointment_map.get(&a).copied());
                let quot = quote_id.and_then(|q| quote_map.get(&q).copied());
                // stock_applied se copia como metadata; no se regeneran movimientos acá
                tx.execute(
                    "INSERT INTO service_orders (order_number, customer_id, vehicle_id, appointment_id, quote_id,
                     odometer_km, title, subject_notes, status, subtotal, discount_pct, total, notes,
                     stock_applied, sync_id, created_at, updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,
                             COALESCE(?16, datetime('now','localtime')),
                             COALESCE(?17, datetime('now','localtime')))",
                    params![
                        order_number,
                        cust,
                        veh,
                        appt,
                        quot,
                        odometer_km,
                        title,
                        subject_notes,
                        status,
                        subtotal,
                        discount_pct,
                        total,
                        notes,
                        stock_applied,
                        sync_id,
                        created,
                        updated
                    ],
                )
                .map_err(LanSyncError::db)?;
                so_map.insert(sid, tx.last_insert_rowid());
            }
            if table_exists(&snap, "service_order_items") {
                let mut stmt = snap
                    .prepare(
                        "SELECT order_id, product_id, name, qty, unit_price, discount_pct, line_total,
                                is_labor, sort_order, sync_id FROM service_order_items",
                    )
                    .map_err(LanSyncError::db)?;
                let rows = stmt
                    .query_map([], |r| {
                        Ok((
                            r.get::<_, i64>(0)?,
                            r.get::<_, Option<i64>>(1)?,
                            r.get::<_, String>(2)?,
                            r.get::<_, f64>(3)?,
                            r.get::<_, f64>(4)?,
                            r.get::<_, f64>(5)?,
                            r.get::<_, f64>(6)?,
                            r.get::<_, i64>(7).unwrap_or(0),
                            r.get::<_, i64>(8).unwrap_or(0),
                            r.get::<_, Option<String>>(9)?,
                        ))
                    })
                    .map_err(LanSyncError::db)?;
                for row in rows {
                    let (oid, pid, name, qty, unit_price, disc, line_total, is_labor, sort_order, sync_id) =
                        row.map_err(LanSyncError::db)?;
                    let Some(&dest_o) = so_map.get(&oid) else {
                        continue;
                    };
                    let prod = pid.and_then(|p| prod_map.get(&p).copied());
                    let sync_id = sync_id.unwrap_or_else(super::outbox::new_uuid);
                    let _ = tx.execute(
                        "INSERT INTO service_order_items (order_id, product_id, name, qty, unit_price,
                         discount_pct, line_total, is_labor, sort_order, sync_id)
                         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                        params![
                            dest_o, prod, name, qty, unit_price, disc, line_total, is_labor,
                            sort_order, sync_id
                        ],
                    );
                }
            }
        }

        if table_exists(&snap, "delivery_notes") {
            let mut stmt = snap
                .prepare(
                    "SELECT id, note_number, customer_id, destination, status, notes, issued_at,
                            stock_applied, sync_id, created_at, updated_at FROM delivery_notes",
                )
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<i64>>(2)?,
                        r.get::<_, Option<String>>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, Option<String>>(5)?,
                        r.get::<_, Option<String>>(6)?,
                        r.get::<_, i64>(7).unwrap_or(0),
                        r.get::<_, Option<String>>(8)?,
                        r.get::<_, Option<String>>(9)?,
                        r.get::<_, Option<String>>(10)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (
                    sid,
                    note_number,
                    customer_id,
                    destination,
                    status,
                    notes,
                    issued_at,
                    stock_applied,
                    sync_id,
                    created,
                    updated,
                ) = row.map_err(LanSyncError::db)?;
                let sync_id = sync_id.unwrap_or_else(|| format!("imported-dn-{sid}"));
                let cust = customer_id.and_then(|c| cust_map.get(&c).copied());
                tx.execute(
                    "INSERT INTO delivery_notes (note_number, customer_id, destination, status, notes,
                     issued_at, stock_applied, sync_id, created_at, updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,
                             COALESCE(?9, datetime('now','localtime')),
                             COALESCE(?10, datetime('now','localtime')))",
                    params![
                        note_number,
                        cust,
                        destination,
                        status,
                        notes,
                        issued_at,
                        stock_applied,
                        sync_id,
                        created,
                        updated
                    ],
                )
                .map_err(LanSyncError::db)?;
                dn_map.insert(sid, tx.last_insert_rowid());
            }
            if table_exists(&snap, "delivery_note_items") {
                let mut stmt = snap
                    .prepare("SELECT note_id, product_id, name, qty, sort_order FROM delivery_note_items")
                    .map_err(LanSyncError::db)?;
                let rows = stmt
                    .query_map([], |r| {
                        Ok((
                            r.get::<_, i64>(0)?,
                            r.get::<_, Option<i64>>(1)?,
                            r.get::<_, String>(2)?,
                            r.get::<_, f64>(3)?,
                            r.get::<_, i64>(4).unwrap_or(0),
                        ))
                    })
                    .map_err(LanSyncError::db)?;
                for row in rows {
                    let (nid, pid, name, qty, sort_order) = row.map_err(LanSyncError::db)?;
                    let Some(&dest_n) = dn_map.get(&nid) else {
                        continue;
                    };
                    let prod = pid.and_then(|p| prod_map.get(&p).copied());
                    let _ = tx.execute(
                        "INSERT INTO delivery_note_items (note_id, product_id, name, qty, sort_order)
                         VALUES (?1,?2,?3,?4,?5)",
                        params![dest_n, prod, name, qty, sort_order],
                    );
                }
            }
        }

        if table_exists(&snap, "vehicle_inspections") {
            let mut stmt = snap
                .prepare(
                    "SELECT id, inspection_number, vehicle_id, customer_id, odometer_km, fuel_level,
                            exterior_condition, interior_condition, belongings, customer_reported,
                            notes, received_by, service_order_id, sync_id, created_at, updated_at
                     FROM vehicle_inspections",
                )
                .map_err(LanSyncError::db)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, Option<String>>(1)?,
                        r.get::<_, Option<i64>>(2)?,
                        r.get::<_, Option<i64>>(3)?,
                        r.get::<_, Option<i64>>(4)?,
                        r.get::<_, Option<String>>(5)?,
                        r.get::<_, Option<String>>(6)?,
                        r.get::<_, Option<String>>(7)?,
                        r.get::<_, Option<String>>(8)?,
                        r.get::<_, Option<String>>(9)?,
                        r.get::<_, Option<String>>(10)?,
                        r.get::<_, Option<String>>(11)?,
                        r.get::<_, Option<i64>>(12)?,
                        r.get::<_, Option<String>>(13)?,
                        r.get::<_, Option<String>>(14)?,
                        r.get::<_, Option<String>>(15)?,
                    ))
                })
                .map_err(LanSyncError::db)?;
            for row in rows {
                let (
                    _sid,
                    inspection_number,
                    vehicle_id,
                    customer_id,
                    odometer_km,
                    fuel_level,
                    exterior_condition,
                    interior_condition,
                    belongings,
                    customer_reported,
                    notes,
                    received_by,
                    service_order_id,
                    sync_id,
                    created,
                    updated,
                ) = row.map_err(LanSyncError::db)?;
                let sync_id = sync_id.unwrap_or_else(super::outbox::new_uuid);
                let veh = vehicle_id.and_then(|v| vehicle_map.get(&v).copied());
                let cust = customer_id.and_then(|c| cust_map.get(&c).copied());
                let so = service_order_id.and_then(|s| so_map.get(&s).copied());
                let Some(veh) = veh else {
                    continue;
                };
                let _ = tx.execute(
                    "INSERT INTO vehicle_inspections (inspection_number, vehicle_id, customer_id, odometer_km,
                     fuel_level, exterior_condition, interior_condition, belongings, customer_reported,
                     notes, received_by, service_order_id, sync_id, created_at, updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,
                             COALESCE(?14, datetime('now','localtime')),
                             COALESCE(?15, datetime('now','localtime')))",
                    params![
                        inspection_number,
                        veh,
                        cust,
                        odometer_km,
                        fuel_level,
                        exterior_condition,
                        interior_condition,
                        belongings,
                        customer_reported,
                        notes,
                        received_by,
                        so,
                        sync_id,
                        created,
                        updated
                    ],
                );
            }
        }

        // stock seeds
        if manifest.includes_stock_seed {
            let device = ensure_device_id(&tx)?;
            for (prod_sync, qty) in stock_seeds {
                let seed_id = format!("snapshot-seed-{}-{prod_sync}", manifest.snapshot_id);
                let exists: Option<i64> = tx
                    .query_row(
                        "SELECT id FROM stock_movements WHERE sync_id = ?1",
                        [&seed_id],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(LanSyncError::db)?;
                if exists.is_some() {
                    continue;
                }
                let pid: Option<i64> = tx
                    .query_row(
                        "SELECT id FROM products WHERE sync_id = ?1",
                        [&prod_sync],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(LanSyncError::db)?;
                let Some(pid) = pid else { continue };
                // Avoid CDC trigger spam during import
                tx.execute(
                    "INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, sync_id, device_id)
                     VALUES (?1, ?2, ?3, 'catalog_snapshot', ?4, ?5)",
                    params![pid, SEED_MOVEMENT_TYPE, qty, seed_id, device],
                )
                .map_err(LanSyncError::db)?;
                tx.execute(
                    "UPDATE products SET stock = stock + ?1 WHERE id = ?2",
                    params![qty, pid],
                )
                .map_err(LanSyncError::db)?;
            }
        }

        Ok(())
    })();

    match import_result {
        Ok(()) => {
            write_setting(&tx, "lan_sync_applying", "0").map_err(LanSyncError::db)?;
            write_setting(&tx, "lan_sync_snapshot_applied_id", &manifest.snapshot_id)
                .map_err(LanSyncError::db)?;
            write_setting(&tx, "lan_sync_snapshot_status", "complete").map_err(LanSyncError::db)?;
            write_setting(&tx, "lan_sync_bootstrap_status", "complete").map_err(LanSyncError::db)?;
            // Advance lamport at least to export watermark
            let cur: i64 = read_setting_or(&tx, "lan_sync_lamport", "0")
                .parse()
                .unwrap_or(0);
            if manifest.lamport_at_export > cur {
                write_setting(
                    &tx,
                    "lan_sync_lamport",
                    &manifest.lamport_at_export.to_string(),
                )
                .map_err(LanSyncError::db)?;
            }
            tx.commit().map_err(LanSyncError::db)?;
        }
        Err(e) => {
            let _ = write_setting(&tx, "lan_sync_applying", "0");
            drop(tx); // rollback
            write_setting(conn, "lan_sync_snapshot_status", "failed").ok();
            write_setting(conn, "lan_sync_snapshot_last_error", &e.to_string()).ok();
            let _ = fs::remove_file(&staging);
            return Err(e);
        }
    }

    write_setting(conn, "lan_sync_snapshot_status", "fts").ok();
    #[cfg(test)]
    FTS_REBUILD_COUNT.with(|c| c.set(c.get() + 1));
    let _ = rebuild_products_fts_safe(conn);
    write_setting(conn, "lan_sync_snapshot_status", "complete").ok();
    let _ = fs::remove_file(&staging);

    Ok(ImportProgress {
        phase: "complete".into(),
        done: manifest.row_counts.products,
        total: manifest.row_counts.products,
        message: "Catálogo importado".into(),
    })
}

/// Flujo cliente completo: fetch manifest → download → import.
pub async fn run_client_import(
    host: &str,
    port: u16,
    token: &str,
) -> LanResult<ImportProgress> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    let url = format!("http://{host}:{port}/v1/snapshot/manifest");
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(LanSyncError::Http(format!(
            "manifest {}",
            resp.status()
        )));
    }
    let manifest: SnapshotManifest = resp
        .json()
        .await
        .map_err(|e| LanSyncError::Http(e.to_string()))?;

    DbManager::with_connection(|conn| {
        assert_case_a_destination(conn).map_err(|e| e.to_string())?;
        let applied = read_setting_or(conn, "lan_sync_snapshot_applied_id", "");
        if applied == manifest.snapshot_id {
            return Err("Este catálogo ya fue importado.".into());
        }
        Ok(())
    })
    .map_err(|e: String| LanSyncError::Config(e))?;

    let zst = download_snapshot(host, port, token, &manifest).await?;
    DbManager::with_connection(|conn| {
        validate_and_import(conn, &manifest, &zst).map_err(|e| e.to_string())
    })
    .map_err(|e: String| LanSyncError::Config(e))
}

#[cfg(test)]
#[path = "snapshot_tests.rs"]
mod snapshot_tests;
