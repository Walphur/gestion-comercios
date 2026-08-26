//! Phase 0.5a — Bootstrap de catálogo LAN vía eventos.

use std::collections::HashSet;

use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};

use crate::db_manager::DbManager;
use crate::settings_util::{read_setting_or, write_setting};

use super::applier::{apply_events_batched, ApplyOptions};
use super::client::{push_http, ClientConfig};
use super::conflicts::open_conflict_count;
use super::errors::{LanResult, LanSyncError};
use super::outbox::{
    append_log, build_payload_for_row, ensure_device_id, insert_event_store, next_lamport,
    pending_count,
};
use super::protocol::SyncEvent;

pub const OP_BOOTSTRAP_UPSERT: &str = "bootstrap_upsert";
pub const CATCHUP_PAGE: i64 = 200;
pub const APPLY_BATCH: usize = 75;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BootstrapStatus {
    Off,
    Preparing,
    Exporting,
    Importing,
    Contributing,
    Complete,
    Failed,
}

impl BootstrapStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            BootstrapStatus::Off => "off",
            BootstrapStatus::Preparing => "preparing",
            BootstrapStatus::Exporting => "exporting",
            BootstrapStatus::Importing => "importing",
            BootstrapStatus::Contributing => "contributing",
            BootstrapStatus::Complete => "complete",
            BootstrapStatus::Failed => "failed",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "preparing" => BootstrapStatus::Preparing,
            "exporting" => BootstrapStatus::Exporting,
            "importing" => BootstrapStatus::Importing,
            "contributing" => BootstrapStatus::Contributing,
            "complete" => BootstrapStatus::Complete,
            "failed" => BootstrapStatus::Failed,
            _ => BootstrapStatus::Off,
        }
    }
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct EntityCount {
    pub planned: u64,
    pub applied: u64,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct BootstrapCounts {
    pub categories: EntityCount,
    pub suppliers: EntityCount,
    pub products: EntityCount,
    pub customers: EntityCount,
    pub products_with_variants: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BootstrapPreview {
    pub categories: u64,
    pub suppliers: u64,
    pub products: u64,
    pub customers: u64,
    pub products_with_variants: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BootstrapUiState {
    pub status: String,
    pub generation: i64,
    pub session_id: String,
    pub source_device: String,
    pub counts: BootstrapCounts,
    pub cursor_lamport: i64,
    pub cursor_event_id: String,
    pub lamport_start: i64,
    pub lamport_end: i64,
    pub outbox_pending: u64,
    pub deferred_pending: u64,
    pub conflicts_open: u64,
    pub products_with_variants: u64,
    pub bootstrap_applied_total: u64,
    pub bootstrap_planned_total: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ManifestPage {
    pub sync_ids: Vec<String>,
    pub has_more: bool,
    pub next_offset: i64,
}

fn read_status(conn: &Connection) -> LanResult<BootstrapStatus> {
    Ok(BootstrapStatus::parse(&read_setting_or(
        conn,
        "lan_sync_bootstrap_status",
        "off",
    )))
}

fn write_status(conn: &Connection, st: BootstrapStatus) -> LanResult<()> {
    write_setting(conn, "lan_sync_bootstrap_status", st.as_str()).map_err(LanSyncError::db)
}

fn read_counts(conn: &Connection) -> LanResult<BootstrapCounts> {
    let raw = read_setting_or(conn, "lan_sync_bootstrap_counts", "{}");
    serde_json::from_str(&raw).map_err(|e| LanSyncError::Protocol(format!("counts JSON: {e}")))
}

fn write_counts(conn: &Connection, counts: &BootstrapCounts) -> LanResult<()> {
    let s = serde_json::to_string(counts).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
    write_setting(conn, "lan_sync_bootstrap_counts", &s).map_err(LanSyncError::db)
}

fn read_generation(conn: &Connection) -> i64 {
    read_setting_or(conn, "lan_sync_bootstrap_generation", "0")
        .parse()
        .unwrap_or(0)
}

fn write_cursor(conn: &Connection, lamport: i64, event_id: &str) -> LanResult<()> {
    write_setting(
        conn,
        "lan_sync_bootstrap_cursor_lamport",
        &lamport.to_string(),
    )
    .map_err(LanSyncError::db)?;
    write_setting(conn, "lan_sync_bootstrap_cursor_event_id", event_id).map_err(LanSyncError::db)
}

fn read_cursor(conn: &Connection) -> (i64, String) {
    let lamport = read_setting_or(conn, "lan_sync_bootstrap_cursor_lamport", "0")
        .parse()
        .unwrap_or(0);
    let event_id = read_setting_or(conn, "lan_sync_bootstrap_cursor_event_id", "");
    (lamport, event_id)
}

pub fn catalog_preview(conn: &Connection) -> LanResult<BootstrapPreview> {
    let categories: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM categories WHERE sync_id IS NOT NULL AND sync_id != ''",
            [],
            |r| r.get(0),
        )
        .map_err(LanSyncError::db)?;
    let suppliers: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM suppliers WHERE sync_id IS NOT NULL AND sync_id != ''",
            [],
            |r| r.get(0),
        )
        .map_err(LanSyncError::db)?;
    let products: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM products WHERE sync_id IS NOT NULL AND sync_id != ''",
            [],
            |r| r.get(0),
        )
        .map_err(LanSyncError::db)?;
    let customers: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM customers WHERE sync_id IS NOT NULL AND sync_id != ''",
            [],
            |r| r.get(0),
        )
        .map_err(LanSyncError::db)?;
    let products_with_variants: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM products WHERE COALESCE(has_variants,0)=1 AND sync_id IS NOT NULL AND sync_id != ''",
            [],
            |r| r.get(0),
        )
        .map_err(LanSyncError::db)?;
    Ok(BootstrapPreview {
        categories: categories as u64,
        suppliers: suppliers as u64,
        products: products as u64,
        customers: customers as u64,
        products_with_variants: products_with_variants as u64,
    })
}

fn count_planned(conn: &Connection) -> LanResult<BootstrapCounts> {
    let p = catalog_preview(conn)?;
    Ok(BootstrapCounts {
        categories: EntityCount {
            planned: p.categories,
            applied: 0,
        },
        suppliers: EntityCount {
            planned: p.suppliers,
            applied: 0,
        },
        products: EntityCount {
            planned: p.products,
            applied: 0,
        },
        customers: EntityCount {
            planned: p.customers,
            applied: 0,
        },
        products_with_variants: p.products_with_variants,
    })
}

fn total_planned(counts: &BootstrapCounts) -> u64 {
    counts.categories.planned
        + counts.suppliers.planned
        + counts.products.planned
        + counts.customers.planned
}

fn recount_bootstrap_applied(conn: &Connection) -> LanResult<BootstrapCounts> {
    let mut counts = read_counts(conn).unwrap_or_default();
    let types = [
        ("category", &mut counts.categories.applied),
        ("supplier", &mut counts.suppliers.applied),
        ("product", &mut counts.products.applied),
        ("customer", &mut counts.customers.applied),
    ];
    for (entity_type, slot) in types {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM lan_sync_applied
                 WHERE entity_type = ?1 AND (event_id LIKE 'bs%' OR event_id LIKE 'contrib-%')",
                [entity_type],
                |r| r.get(0),
            )
            .map_err(LanSyncError::db)?;
        *slot = n as u64;
    }
    Ok(counts)
}

fn total_applied(counts: &BootstrapCounts) -> u64 {
    counts.categories.applied
        + counts.suppliers.applied
        + counts.products.applied
        + counts.customers.applied
}

pub fn deferred_count(conn: &Connection) -> LanResult<u64> {
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM lan_sync_pending_apply", [], |r| r.get(0))
        .map_err(LanSyncError::db)?;
    Ok(n as u64)
}

pub fn load_ui_state(conn: &Connection) -> LanResult<BootstrapUiState> {
    let status = read_status(conn)?;
    let generation = read_generation(conn);
    let session_id = read_setting_or(conn, "lan_sync_bootstrap_session_id", "");
    let source_device = read_setting_or(conn, "lan_sync_bootstrap_source_device", "");
    let counts = read_counts(conn).unwrap_or_default();
    let (cursor_lamport, cursor_event_id) = read_cursor(conn);
    let lamport_start = read_setting_or(conn, "lan_sync_bootstrap_lamport_start", "0")
        .parse()
        .unwrap_or(0);
    let lamport_end = read_setting_or(conn, "lan_sync_bootstrap_lamport_end", "0")
        .parse()
        .unwrap_or(0);
    let products_with_variants = read_setting_or(
        conn,
        "lan_sync_bootstrap_products_with_variants",
        "0",
    )
    .parse()
    .unwrap_or(0);
    Ok(BootstrapUiState {
        status: status.as_str().to_string(),
        generation,
        session_id,
        source_device,
        bootstrap_applied_total: total_applied(&counts),
        bootstrap_planned_total: total_planned(&counts),
        counts,
        cursor_lamport,
        cursor_event_id,
        lamport_start,
        lamport_end,
        outbox_pending: pending_count(conn)?,
        deferred_pending: deferred_count(conn)?,
        conflicts_open: open_conflict_count(conn)?,
        products_with_variants,
    })
}

fn bootstrap_event_id(generation: i64, entity_type: &str, sync_id: &str) -> String {
    format!("bs{generation:08}-{entity_type}-{sync_id}")
}

fn export_entity_rows(
    conn: &Connection,
    entity_type: &str,
    table: &str,
    generation: i64,
    origin_device: &str,
    lamport: &mut i64,
    counts: &mut BootstrapCounts,
) -> LanResult<()> {
    write_setting(conn, "lan_sync_applying", "1").map_err(LanSyncError::db)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT sync_id FROM {table} WHERE sync_id IS NOT NULL AND sync_id != '' ORDER BY id"
        ))
        .map_err(LanSyncError::db)?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(LanSyncError::db)?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for row in rows {
        let sync_id = row.map_err(LanSyncError::db)?;
        let payload = build_payload_for_row(conn, entity_type, &sync_id)?;
        let event_id = bootstrap_event_id(generation, entity_type, &sync_id);
        let event = SyncEvent {
            event_id: event_id.clone(),
            entity_type: entity_type.to_string(),
            entity_sync_id: sync_id.clone(),
            op: OP_BOOTSTRAP_UPSERT.to_string(),
            payload,
            lamport: *lamport,
            origin_device: origin_device.to_string(),
            created_at: now.clone(),
        };
        insert_event_store(conn, &event)?;
        conn.execute(
            "INSERT OR IGNORE INTO lan_sync_bootstrap_manifest (generation, entity_type, sync_id)
             VALUES (?1, ?2, ?3)",
            params![generation, entity_type, sync_id],
        )
        .map_err(LanSyncError::db)?;
        let _ = append_log(
            conn,
            "out",
            None,
            &format!("bootstrap {entity_type} {sync_id}"),
            Some(&event_id),
        );
        *lamport += 1;
        match entity_type {
            "category" => counts.categories.applied += 1,
            "supplier" => counts.suppliers.applied += 1,
            "product" => counts.products.applied += 1,
            "customer" => counts.customers.applied += 1,
            _ => {}
        }
    }
    write_setting(conn, "lan_sync_applying", "0").map_err(LanSyncError::db)?;
    Ok(())
}

/// Reserva rango Lamport y exporta catálogo al event_store (solo servidor).
pub fn export_catalog(conn: &Connection) -> LanResult<BootstrapUiState> {
    let device_id = ensure_device_id(conn)?;
    write_status(conn, BootstrapStatus::Preparing)?;
    let generation = read_generation(conn) + 1;
    write_setting(
        conn,
        "lan_sync_bootstrap_generation",
        &generation.to_string(),
    )
    .map_err(LanSyncError::db)?;
    let session_id = super::outbox::new_uuid();
    write_setting(conn, "lan_sync_bootstrap_session_id", &session_id)
        .map_err(LanSyncError::db)?;
    write_setting(conn, "lan_sync_bootstrap_source_device", &device_id)
        .map_err(LanSyncError::db)?;

    let mut counts = count_planned(conn)?;
    write_counts(conn, &counts)?;
    write_setting(
        conn,
        "lan_sync_bootstrap_products_with_variants",
        &counts.products_with_variants.to_string(),
    )
    .map_err(LanSyncError::db)?;

    let n = total_planned(&counts);
    let cur_lamport: i64 = read_setting_or(conn, "lan_sync_lamport", "0")
        .parse()
        .unwrap_or(0);
    let lamport_start = cur_lamport + 1;
    let lamport_end = cur_lamport + n as i64;
    write_setting(
        conn,
        "lan_sync_bootstrap_lamport_start",
        &lamport_start.to_string(),
    )
    .map_err(LanSyncError::db)?;
    write_setting(
        conn,
        "lan_sync_bootstrap_lamport_end",
        &lamport_end.to_string(),
    )
    .map_err(LanSyncError::db)?;
    write_setting(conn, "lan_sync_lamport", &lamport_end.to_string()).map_err(LanSyncError::db)?;

    write_status(conn, BootstrapStatus::Exporting)?;
    write_cursor(conn, 0, "")?;

    let mut lamport = lamport_start;
    counts.categories.applied = 0;
    counts.suppliers.applied = 0;
    counts.products.applied = 0;
    counts.customers.applied = 0;

    export_entity_rows(
        conn,
        "category",
        "categories",
        generation,
        &device_id,
        &mut lamport,
        &mut counts,
    )?;
    export_entity_rows(
        conn,
        "supplier",
        "suppliers",
        generation,
        &device_id,
        &mut lamport,
        &mut counts,
    )?;
    export_entity_rows(
        conn,
        "product",
        "products",
        generation,
        &device_id,
        &mut lamport,
        &mut counts,
    )?;
    export_entity_rows(
        conn,
        "customer",
        "customers",
        generation,
        &device_id,
        &mut lamport,
        &mut counts,
    )?;

    write_counts(conn, &counts)?;
    write_status(conn, BootstrapStatus::Importing)?;
    load_ui_state(conn)
}

pub fn manifest_page(conn: &Connection, generation: i64, offset: i64, limit: i64) -> LanResult<ManifestPage> {
    let lim = limit.clamp(1, 5000);
    let mut stmt = conn
        .prepare(
            "SELECT sync_id FROM lan_sync_bootstrap_manifest
             WHERE generation = ?1
             ORDER BY entity_type, sync_id
             LIMIT ?2 OFFSET ?3",
        )
        .map_err(LanSyncError::db)?;
    let rows = stmt
        .query_map(params![generation, lim, offset], |r| r.get(0))
        .map_err(LanSyncError::db)?;
    let mut sync_ids = Vec::new();
    for row in rows {
        sync_ids.push(row.map_err(LanSyncError::db)?);
    }
    let has_more = sync_ids.len() as i64 >= lim;
    let len = sync_ids.len() as i64;
    Ok(ManifestPage {
        sync_ids,
        has_more,
        next_offset: offset + len,
    })
}

pub fn manifest_contains(conn: &Connection, generation: i64, sync_id: &str) -> LanResult<bool> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM lan_sync_bootstrap_manifest WHERE generation = ?1 AND sync_id = ?2 LIMIT 1",
            params![generation, sync_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?;
    Ok(exists.is_some())
}

pub fn register_manifest(conn: &Connection, generation: i64, entity_type: &str, sync_id: &str) -> LanResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO lan_sync_bootstrap_manifest (generation, entity_type, sync_id)
         VALUES (?1, ?2, ?3)",
        params![generation, entity_type, sync_id],
    )
    .map_err(LanSyncError::db)?;
    Ok(())
}

fn manifest_entity_count(conn: &Connection, generation: i64, entity_type: &str) -> LanResult<u64> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM lan_sync_bootstrap_manifest
             WHERE generation = ?1 AND entity_type = ?2",
            params![generation, entity_type],
            |r| r.get(0),
        )
        .map_err(LanSyncError::db)?;
    Ok(n as u64)
}

/// Actualiza `planned` desde manifest (incluye contribuciones del cliente).
pub fn sync_planned_from_manifest(conn: &Connection) -> LanResult<BootstrapCounts> {
    let generation = read_generation(conn);
    let mut counts = read_counts(conn).unwrap_or_default();
    counts.categories.planned = manifest_entity_count(conn, generation, "category")?;
    counts.suppliers.planned = manifest_entity_count(conn, generation, "supplier")?;
    counts.products.planned = manifest_entity_count(conn, generation, "product")?;
    counts.customers.planned = manifest_entity_count(conn, generation, "customer")?;
    write_counts(conn, &counts)?;
    Ok(counts)
}

fn catalog_in_manifest_count(
    conn: &Connection,
    generation: i64,
    entity_type: &str,
    table: &str,
) -> LanResult<u64> {
    let sql = format!(
        "SELECT COUNT(*) FROM {table} t
         INNER JOIN lan_sync_bootstrap_manifest m
           ON m.sync_id = t.sync_id AND m.generation = ?1 AND m.entity_type = ?2
         WHERE t.sync_id IS NOT NULL AND t.sync_id != ''"
    );
    let n: i64 = conn
        .query_row(&sql, params![generation, entity_type], |r| r.get(0))
        .map_err(LanSyncError::db)?;
    Ok(n as u64)
}

/// Hub: applied = entidades materializadas que están en manifest.
pub fn sync_applied_from_manifest_catalog(conn: &Connection) -> LanResult<BootstrapCounts> {
    let generation = read_generation(conn);
    let mut counts = sync_planned_from_manifest(conn)?;
    counts.categories.applied =
        catalog_in_manifest_count(conn, generation, "category", "categories")?;
    counts.suppliers.applied =
        catalog_in_manifest_count(conn, generation, "supplier", "suppliers")?;
    counts.products.applied =
        catalog_in_manifest_count(conn, generation, "product", "products")?;
    counts.customers.applied =
        catalog_in_manifest_count(conn, generation, "customer", "customers")?;
    write_counts(conn, &counts)?;
    Ok(counts)
}

/// Tras ingest de eventos `contrib-*` en el hub: refresca totales y cierra bootstrap.
/// Tras ingest de eventos `contrib-*` en el hub: refresca totales y cierra bootstrap.
/// No reconstruye FTS completo aquí (cada apply ya actualiza FTS del producto;
/// un rebuild total por lote de 50 eventos provocaba timeouts/500 con catálogos grandes).
pub fn after_contribution_ingested(conn: &Connection, contribution_events: usize) -> LanResult<()> {
    if contribution_events == 0 {
        return Ok(());
    }
    sync_applied_from_manifest_catalog(conn)?;
    write_status(conn, BootstrapStatus::Complete)?;
    Ok(())
}

pub fn is_contribution_event(event: &SyncEvent) -> bool {
    event.op == OP_BOOTSTRAP_UPSERT && event.event_id.starts_with("contrib-")
}

fn local_catalog_sync_ids(conn: &Connection, table: &str) -> LanResult<Vec<String>> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT sync_id FROM {table} WHERE sync_id IS NOT NULL AND sync_id != ''"
        ))
        .map_err(LanSyncError::db)?;
    let rows = stmt
        .query_map([], |r| r.get(0))
        .map_err(LanSyncError::db)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(LanSyncError::db)?);
    }
    Ok(out)
}

async fn download_hub_manifest(
    cfg: &ClientConfig,
    token: &str,
    generation: i64,
) -> LanResult<HashSet<String>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    let mut set = HashSet::new();
    let mut offset = 0i64;
    loop {
        let url = format!(
            "http://{}:{}/v1/bootstrap/manifest?generation={generation}&offset={offset}&limit=2000",
            cfg.host, cfg.port
        );
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .map_err(|e| LanSyncError::Http(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(LanSyncError::Http(format!("manifest {}", resp.status())));
        }
        let page: ManifestPage = resp
            .json()
            .await
            .map_err(|e| LanSyncError::Http(e.to_string()))?;
        for sid in page.sync_ids {
            set.insert(sid);
        }
        if !page.has_more {
            break;
        }
        offset = page.next_offset;
    }
    Ok(set)
}

pub(crate) fn collect_contribution_events_with_hub(
    conn: &Connection,
    generation: i64,
    origin_device: &str,
    hub_manifest: &HashSet<String>,
) -> LanResult<Vec<SyncEvent>> {
    let tables: [(&str, &str); 4] = [
        ("category", "categories"),
        ("supplier", "suppliers"),
        ("product", "products"),
        ("customer", "customers"),
    ];
    let mut events = Vec::new();
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for (entity_type, table) in tables {
        for sync_id in local_catalog_sync_ids(conn, table)? {
            if hub_manifest.contains(&sync_id) {
                continue;
            }
            let payload = build_payload_for_row(conn, entity_type, &sync_id)?;
            let lamport = next_lamport(conn)?;
            let event_id = format!("contrib-{generation}-{entity_type}-{sync_id}");
            events.push(SyncEvent {
                event_id,
                entity_type: entity_type.to_string(),
                entity_sync_id: sync_id.clone(),
                op: OP_BOOTSTRAP_UPSERT.to_string(),
                payload,
                lamport,
                origin_device: origin_device.to_string(),
                created_at: now.clone(),
            });
        }
    }
    Ok(events)
}

pub fn contribute_catalog(conn: &Connection) -> LanResult<Vec<SyncEvent>> {
    write_status(conn, BootstrapStatus::Contributing)?;
    let generation = read_generation(conn);
    let device_id = ensure_device_id(conn)?;
    let hub = hub_sync_id_set(conn, generation)?;
    collect_contribution_events_with_hub(conn, generation, &device_id, &hub)
}

pub fn import_catalog_page(conn: &Connection, events: &[SyncEvent]) -> LanResult<BootstrapUiState> {
    write_status(conn, BootstrapStatus::Importing)?;
    let opts = ApplyOptions {
        strict_identity: true,
    };
    let result = apply_events_batched(conn, events, opts, APPLY_BATCH)?;
    if let Some(last) = events.last() {
        write_cursor(conn, last.lamport, &last.event_id)?;
    }
    let mut counts = read_counts(conn).unwrap_or_default();
    for e in events {
        if result.applied_event_ids.contains(&e.event_id)
            || result.already_applied_event_ids.contains(&e.event_id)
        {
            match e.entity_type.as_str() {
                "category" => counts.categories.applied += 1,
                "supplier" => counts.suppliers.applied += 1,
                "product" => counts.products.applied += 1,
                "customer" => counts.customers.applied += 1,
                _ => {}
            }
        }
    }
    write_counts(conn, &counts)?;
    load_ui_state(conn)
}

pub fn mark_bootstrap_complete(conn: &Connection) -> LanResult<BootstrapUiState> {
    // Productos aplicados por LAN no actualizaban FTS en builds viejos: reconstruir al cerrar.
    let _ = crate::product_search::rebuild_products_fts_safe(conn);
    write_status(conn, BootstrapStatus::Complete)?;
    load_ui_state(conn)
}

pub fn reset_bootstrap_failed(conn: &Connection, err: &str) -> LanResult<()> {
    write_status(conn, BootstrapStatus::Failed)?;
    write_setting(conn, "lan_sync_bootstrap_last_error", err).map_err(LanSyncError::db)
}

async fn fetch_catchup_page(
    cfg: &ClientConfig,
    token: &str,
    since_lamport: i64,
    after_event_id: &str,
    limit: i64,
) -> LanResult<Vec<SyncEvent>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    let url = format!(
        "http://{}:{}/v1/catchup?since_lamport={since_lamport}&after_event_id={}&limit={limit}",
        cfg.host,
        cfg.port,
        urlencoding::encode(after_event_id)
    );
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(LanSyncError::Http(format!("catchup {}", resp.status())));
    }
    let body: super::protocol::CatchupResponse = resp
        .json()
        .await
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    Ok(body.events)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BootstrapInfo {
    pub status: String,
    pub generation: i64,
    pub lamport_start: i64,
    pub lamport_end: i64,
    pub counts: BootstrapCounts,
    pub products_with_variants: u64,
}

pub fn bootstrap_info(conn: &Connection) -> LanResult<BootstrapInfo> {
    let st = load_ui_state(conn)?;
    Ok(BootstrapInfo {
        status: st.status,
        generation: st.generation,
        lamport_start: st.lamport_start,
        lamport_end: st.lamport_end,
        counts: st.counts,
        products_with_variants: st.products_with_variants,
    })
}

fn sync_bootstrap_settings_from_info(conn: &Connection, info: &BootstrapInfo) -> LanResult<()> {
    write_setting(
        conn,
        "lan_sync_bootstrap_generation",
        &info.generation.to_string(),
    )
    .map_err(LanSyncError::db)?;
    write_setting(
        conn,
        "lan_sync_bootstrap_lamport_start",
        &info.lamport_start.to_string(),
    )
    .map_err(LanSyncError::db)?;
    write_setting(
        conn,
        "lan_sync_bootstrap_lamport_end",
        &info.lamport_end.to_string(),
    )
    .map_err(LanSyncError::db)?;
    write_counts(conn, &info.counts)?;
    write_setting(
        conn,
        "lan_sync_bootstrap_products_with_variants",
        &info.products_with_variants.to_string(),
    )
    .map_err(LanSyncError::db)?;
    write_setting(conn, "lan_sync_bootstrap_status", &info.status).map_err(LanSyncError::db)
}

async fn authenticate(cfg: &ClientConfig) -> LanResult<String> {
    let auth = super::client::authenticate(cfg).await?;
    Ok(auth.token)
}

async fn fetch_bootstrap_info(cfg: &ClientConfig, token: &str) -> LanResult<BootstrapInfo> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    let url = format!("http://{}:{}/v1/bootstrap/info", cfg.host, cfg.port);
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| LanSyncError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(LanSyncError::Http(format!("bootstrap info {}", resp.status())));
    }
    resp.json::<BootstrapInfo>()
        .await
        .map_err(|e| LanSyncError::Http(e.to_string()))
}

/// Import streaming vía catch-up HTTP (cliente). Usa cursor bootstrap persistente.
pub async fn import_catalog_catchup(cfg: &ClientConfig) -> LanResult<BootstrapUiState> {
    let token = authenticate(cfg).await?;
    let info = fetch_bootstrap_info(cfg, &token).await?;
    DbManager::with_connection(|conn| {
        sync_bootstrap_settings_from_info(conn, &info).map_err(|e| e.to_string())?;
        if read_status(conn).map_err(|e| e.to_string())? == BootstrapStatus::Off {
            write_status(conn, BootstrapStatus::Importing).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .map_err(|e: String| LanSyncError::Config(e))?;

    let (mut lamport, mut after) = DbManager::with_connection(|conn| Ok(read_cursor(conn)))
        .map_err(|e: String| LanSyncError::Config(e))?;

    let opts = ApplyOptions {
        strict_identity: true,
    };

    loop {
        let page = fetch_catchup_page(cfg, &token, lamport, &after, CATCHUP_PAGE).await?;
        if page.is_empty() {
            break;
        }

        DbManager::with_connection(|conn| {
            let _result = apply_events_batched(conn, &page, opts, APPLY_BATCH).map_err(|e| e.to_string())?;
            if let Some(last) = page.last() {
                lamport = last.lamport;
                after = last.event_id.clone();
                write_cursor(conn, lamport, &after).map_err(|e| e.to_string())?;
            }
            let counts = recount_bootstrap_applied(conn).map_err(|e| e.to_string())?;
            write_counts(conn, &counts).map_err(|e| e.to_string())?;
            Ok(())
        })?;

        if page.len() < CATCHUP_PAGE as usize {
            break;
        }
    }

    DbManager::with_connection(|conn| load_ui_state(conn).map_err(|e| e.to_string()))
        .map_err(|e: String| LanSyncError::Config(e))
}

/// Cliente: import → contribuye → finaliza (sin catch-up manual en el hub).
pub async fn run_client_bootstrap_flow(cfg: &ClientConfig) -> LanResult<BootstrapUiState> {
    import_catalog_catchup(cfg).await?;
    contribute_and_push(cfg).await
}

/// Cliente: contribuye entidades locales ausentes en manifest del hub.
pub async fn contribute_and_push(cfg: &ClientConfig) -> LanResult<BootstrapUiState> {
    let token = authenticate(cfg).await?;
    let generation = DbManager::with_connection(|conn| Ok(read_generation(conn)))
        .map_err(|e: String| LanSyncError::Config(e))?;
    let hub_manifest = download_hub_manifest(cfg, &token, generation).await?;
    let events = DbManager::with_connection(|conn| {
        write_status(conn, BootstrapStatus::Contributing).map_err(|e| e.to_string())?;
        let device_id = ensure_device_id(conn).map_err(|e| e.to_string())?;
        collect_contribution_events_with_hub(conn, generation, &device_id, &hub_manifest)
            .map_err(|e| e.to_string())
    })
    .map_err(|e: String| LanSyncError::Config(e))?;

    if !events.is_empty() {
        // El hub aplica localmente en ingest_batch — A no necesita catch-up manual.
        push_http(cfg, &token, events).await?;
    }

    DbManager::with_connection(|conn| {
        sync_planned_from_manifest(conn).map_err(|e| e.to_string())?;
        let counts = recount_bootstrap_applied(conn).map_err(|e| e.to_string())?;
        write_counts(conn, &counts).map_err(|e| e.to_string())?;
        mark_bootstrap_complete(conn).map_err(|e| e.to_string())
    })
    .map_err(|e: String| LanSyncError::Config(e))
}

pub fn hub_sync_id_set(conn: &Connection, generation: i64) -> LanResult<HashSet<String>> {
    let mut stmt = conn
        .prepare("SELECT sync_id FROM lan_sync_bootstrap_manifest WHERE generation = ?1")
        .map_err(LanSyncError::db)?;
    let rows = stmt
        .query_map([generation], |r| r.get(0))
        .map_err(LanSyncError::db)?;
    let mut set = HashSet::new();
    for row in rows {
        set.insert(row.map_err(LanSyncError::db)?);
    }
    Ok(set)
}

#[cfg(test)]
#[path = "bootstrap_tests.rs"]
mod bootstrap_tests;
