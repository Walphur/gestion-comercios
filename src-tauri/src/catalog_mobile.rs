use crate::arca::secrets::{decrypt_secret, encrypt_secret};
use crate::database::open_exclusive;
use crate::settings_util::{read_setting, write_setting};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

static WORKER_RUNNING: AtomicBool = AtomicBool::new(false);

const SETTING_TOKEN: &str = "catalog_mobile_token";
const SETTING_CODE: &str = "catalog_mobile_pair_code";
const SETTING_EXPIRES: &str = "catalog_mobile_pair_expires";
const SETTING_LAST_SYNC: &str = "catalog_mobile_last_sync_at";
const SETTING_LAST_ERROR: &str = "catalog_mobile_last_error";
const SETTING_PHONES: &str = "catalog_mobile_phones";

fn api_url() -> String {
    option_env!("CATALOGO_MOVIL_API_URL")
        .unwrap_or("https://gestion-catalogo-movil.walphur.workers.dev")
        .to_string()
}

pub fn phone_url() -> String {
    api_url()
}

#[derive(Debug, Clone, Serialize)]
pub struct CatalogMobileStatus {
    pub linked: bool,
    pub pair_code: Option<String>,
    pub pair_expires_at: Option<String>,
    pub phone_url: String,
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
    pub phones: u32,
    pub conflicts: u32,
}

#[derive(Debug, Deserialize)]
struct PairResponse {
    ok: bool,
    api_token: Option<String>,
    pair_code: Option<String>,
    pair_expires_at: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AcceptedRev {
    sync_id: String,
    #[serde(default)]
    variant_sync_id: String,
    content_rev: i64,
}

#[derive(Debug, Deserialize)]
struct ApplyVariant {
    sync_id: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    attributes_json: String,
    #[serde(default)]
    sku: String,
    price: Option<f64>,
    #[serde(default)]
    content_rev: i64,
    #[serde(default)]
    create: bool,
    #[serde(default)]
    initial_stock: f64,
}

#[derive(Debug, Deserialize)]
struct ApplyProduct {
    sync_id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    sku: String,
    #[serde(default)]
    barcode: String,
    #[serde(default)]
    price: f64,
    #[serde(default)]
    cost: f64,
    #[serde(default)]
    unit: String,
    #[serde(default = "one")]
    active: i64,
    #[serde(default)]
    has_variants: i64,
    #[serde(default)]
    content_rev: i64,
    #[serde(default)]
    create: bool,
    #[serde(default)]
    initial_stock: f64,
    #[serde(default)]
    variants: Vec<ApplyVariant>,
}

fn one() -> i64 {
    1
}

#[derive(Debug, Deserialize)]
struct StockOpDto {
    id: String,
    sync_id: String,
    #[serde(default)]
    variant_sync_id: String,
    delta: f64,
}

#[derive(Debug, Deserialize)]
struct ConflictDto {
    sync_id: String,
    #[serde(default)]
    variant_sync_id: String,
    field: String,
    kept: String,
    discarded: String,
    #[serde(default)]
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct SyncResponse {
    ok: bool,
    #[serde(default)]
    accepted: Vec<AcceptedRev>,
    #[serde(default)]
    apply: Vec<ApplyProduct>,
    #[serde(default)]
    stock_ops: Vec<StockOpDto>,
    #[serde(default)]
    conflicts: Vec<ConflictDto>,
    #[serde(default)]
    phones: u32,
    error: Option<String>,
}

struct PushVariant {
    sync_id: String,
    label: String,
    attributes_json: String,
    sku: String,
    price: Option<f64>,
    stock: f64,
    content_changed: bool,
    content_rev: i64,
    hash: String,
}

struct PushProduct {
    sync_id: String,
    name: String,
    sku: String,
    barcode: String,
    price: f64,
    cost: f64,
    unit: String,
    active: i64,
    has_variants: bool,
    stock: f64,
    content_changed: bool,
    content_rev: i64,
    hash: String,
    variants: Vec<PushVariant>,
}

fn read_token(conn: &Connection) -> Option<String> {
    let stored = read_setting(conn, SETTING_TOKEN)?;
    decrypt_secret(&stored).ok()
}

fn write_token(conn: &Connection, token: &str) -> Result<(), String> {
    let enc = encrypt_secret(token)?;
    write_setting(conn, SETTING_TOKEN, &enc)
}

fn status_from(conn: &Connection) -> CatalogMobileStatus {
    let conflicts: u32 = conn
        .query_row("SELECT COUNT(*) FROM catalog_mobile_conflicts", [], |r| r.get(0))
        .unwrap_or(0);
    let phones: u32 = read_setting(conn, SETTING_PHONES)
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    CatalogMobileStatus {
        linked: read_token(conn).is_some(),
        pair_code: read_setting(conn, SETTING_CODE).filter(|s| !s.is_empty()),
        pair_expires_at: read_setting(conn, SETTING_EXPIRES).filter(|s| !s.is_empty()),
        phone_url: phone_url(),
        last_sync_at: read_setting(conn, SETTING_LAST_SYNC).filter(|s| !s.is_empty()),
        last_error: read_setting(conn, SETTING_LAST_ERROR).filter(|s| !s.is_empty()),
        phones,
        conflicts,
    }
}

pub fn catalog_mobile_status() -> CatalogMobileStatus {
    open_exclusive()
        .map(|conn| status_from(&conn))
        .unwrap_or(CatalogMobileStatus {
            linked: false,
            pair_code: None,
            pair_expires_at: None,
            phone_url: phone_url(),
            last_sync_at: None,
            last_error: Some("Base de datos no disponible.".into()),
            phones: 0,
            conflicts: 0,
        })
}

fn post_json<T: for<'de> Deserialize<'de>>(
    path: &str,
    body: &Value,
    bearer: Option<&str>,
) -> Result<T, String> {
    let url = format!("{}{}", api_url(), path);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .http1_only()
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.post(&url).json(body);
    if let Some(token) = bearer {
        req = req.header("authorization", format!("Bearer {token}"));
    }
    let res = req.send().map_err(|e| {
        let detail = e.to_string();
        if detail.contains("timed out") || detail.contains("error sending request") {
            "No se pudo sincronizar con el celular. Esperá unos segundos y tocá Sincronizar ahora."
                .to_string()
        } else {
            format!("Sin conexión con la app del celular: {detail}")
        }
    })?;
    let status = res.status();
    let text = res.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        if let Ok(err) = serde_json::from_str::<PairResponse>(&text) {
            if let Some(message) = err.error {
                return Err(message);
            }
        }
        return Err(format!("La app del celular respondió {status}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("Respuesta inválida: {e}"))
}

fn num(n: f64) -> String {
    format!("{n:.4}")
}

fn product_hash(name: &str, price: f64, sku: &str, barcode: &str, cost: f64, unit: &str, active: i64) -> String {
    format!("{name}|{}|{sku}|{barcode}|{}|{unit}|{active}", num(price), num(cost))
}

fn variant_hash(label: &str, sku: &str, price: Option<f64>) -> String {
    format!("{label}|{sku}|{}", price.map(num).unwrap_or_default())
}

fn variant_label(attributes: &str) -> String {
    let Ok(value) = serde_json::from_str::<Value>(attributes) else {
        let trimmed = attributes.trim();
        return if trimmed.is_empty() { "Modelo".into() } else { trimmed.into() };
    };
    if let Some(obj) = value.as_object() {
        let parts: Vec<&str> = obj
            .values()
            .filter_map(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        if !parts.is_empty() {
            return parts.join(" · ");
        }
    }
    "Modelo".into()
}

fn ensure_sync_ids(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "UPDATE products SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL OR trim(sync_id) = ''",
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE product_variants SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL OR trim(sync_id) = ''",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn unacked_deltas(conn: &Connection) -> Result<HashMap<(String, String), f64>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT sync_id, variant_sync_id, COALESCE(SUM(delta), 0)
             FROM catalog_mobile_applied WHERE acked = 0 GROUP BY sync_id, variant_sync_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                (row.get::<_, String>(0)?, row.get::<_, String>(1)?),
                row.get::<_, f64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    for row in rows {
        let (key, delta) = row.map_err(|e| e.to_string())?;
        map.insert(key, delta);
    }
    Ok(map)
}

fn collect_changes(conn: &Connection) -> Result<Vec<PushProduct>, String> {
    ensure_sync_ids(conn)?;
    let deltas = unacked_deltas(conn)?;
    let mut state: HashMap<(String, String), (i64, String, Option<f64>)> = HashMap::new();
    let mut stmt = conn
        .prepare("SELECT sync_id, variant_sync_id, content_rev, content_hash, pushed_stock FROM catalog_mobile_state")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                (row.get::<_, String>(0)?, row.get::<_, String>(1)?),
                (row.get::<_, i64>(2)?, row.get::<_, String>(3)?, row.get::<_, Option<f64>>(4)?),
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (key, value) = row.map_err(|e| e.to_string())?;
        state.insert(key, value);
    }

    let mut products: Vec<PushProduct> = Vec::new();
    let mut stmt = conn
        .prepare(
            "SELECT sync_id, name, COALESCE(sku, ''), COALESCE(barcode, ''), price, cost, stock,
                    COALESCE(unit, 'unidad'), active, has_variants
             FROM products",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, f64>(4)?,
                row.get::<_, f64>(5)?,
                row.get::<_, f64>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i64>(9)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (sync_id, name, sku, barcode, price, cost, stock, unit, active, has_variants) =
            row.map_err(|e| e.to_string())?;
        let hash = product_hash(&name, price, &sku, &barcode, cost, &unit, active);
        let saved = state.get(&(sync_id.clone(), String::new()));
        let content_rev = saved.map(|s| s.0).unwrap_or(0);
        let content_changed = saved.map(|s| s.1 != hash).unwrap_or(true);
        let pending = deltas.get(&(sync_id.clone(), String::new())).copied().unwrap_or(0.0);
        let adjusted = stock - pending;
        let stock_changed = has_variants != 1
            && saved
                .and_then(|s| s.2)
                .map(|prev| (prev - adjusted).abs() > 0.0001)
                .unwrap_or(true);
        if content_changed || stock_changed {
            products.push(PushProduct {
                sync_id,
                name,
                sku,
                barcode,
                price,
                cost,
                unit,
                active,
                has_variants: has_variants == 1,
                stock: adjusted,
                content_changed,
                content_rev,
                hash,
                variants: Vec::new(),
            });
        }
    }

    let mut by_id: HashMap<String, usize> = products
        .iter()
        .enumerate()
        .map(|(i, p)| (p.sync_id.clone(), i))
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT p.sync_id, v.sync_id, COALESCE(v.attributes, ''), COALESCE(v.sku, ''), v.price, v.stock
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
             WHERE p.sync_id IS NOT NULL AND v.sync_id IS NOT NULL",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<f64>>(4)?,
                row.get::<_, f64>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (product_sync, sync_id, attributes, sku, price, stock) = row.map_err(|e| e.to_string())?;
        let label = variant_label(&attributes);
        let hash = variant_hash(&label, &sku, price);
        let saved = state.get(&(product_sync.clone(), sync_id.clone()));
        let content_changed = saved.map(|s| s.1 != hash).unwrap_or(true);
        let pending = deltas
            .get(&(product_sync.clone(), sync_id.clone()))
            .copied()
            .unwrap_or(0.0);
        let adjusted = stock - pending;
        let stock_changed = saved
            .and_then(|s| s.2)
            .map(|prev| (prev - adjusted).abs() > 0.0001)
            .unwrap_or(true);
        if !content_changed && !stock_changed {
            continue;
        }
        if !by_id.contains_key(&product_sync) {
            if let Some(parent) = load_parent(conn, &product_sync, &state, &deltas)? {
                by_id.insert(parent.sync_id.clone(), products.len());
                products.push(parent);
            }
        }
        if let Some(index) = by_id.get(&product_sync) {
            products[*index].variants.push(PushVariant {
                sync_id,
                label,
                attributes_json: if attributes.trim().is_empty() { "{}".into() } else { attributes },
                sku,
                price,
                stock: adjusted,
                content_changed,
                content_rev: saved.map(|s| s.0).unwrap_or(0),
                hash,
            });
        }
    }

    products.retain(|p| p.content_changed || !p.has_variants || !p.variants.is_empty());
    products.truncate(12);
    Ok(products)
}

fn load_parent(
    conn: &Connection,
    sync_id: &str,
    state: &HashMap<(String, String), (i64, String, Option<f64>)>,
    deltas: &HashMap<(String, String), f64>,
) -> Result<Option<PushProduct>, String> {
    let row = conn
        .query_row(
            "SELECT name, COALESCE(sku, ''), COALESCE(barcode, ''), price, cost, stock,
                    COALESCE(unit, 'unidad'), active, has_variants
             FROM products WHERE sync_id = ?1",
            [sync_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, f64>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, i64>(8)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((name, sku, barcode, price, cost, stock, unit, active, has_variants)) = row else {
        return Ok(None);
    };
    let hash = product_hash(&name, price, &sku, &barcode, cost, &unit, active);
    let saved = state.get(&(sync_id.to_string(), String::new()));
    let pending = deltas.get(&(sync_id.to_string(), String::new())).copied().unwrap_or(0.0);
    Ok(Some(PushProduct {
        sync_id: sync_id.to_string(),
        name,
        sku,
        barcode,
        price,
        cost,
        unit,
        active,
        has_variants: has_variants == 1,
        stock: stock - pending,
        content_changed: saved.map(|s| s.1 != hash).unwrap_or(true),
        content_rev: saved.map(|s| s.0).unwrap_or(0),
        hash,
        variants: Vec::new(),
    }))
}

fn push_body(products: &[PushProduct]) -> Value {
    json!({
        "products": products.iter().map(|p| json!({
            "sync_id": p.sync_id,
            "name": p.name,
            "sku": p.sku,
            "barcode": p.barcode,
            "price": p.price,
            "cost": p.cost,
            "unit": p.unit,
            "active": p.active,
            "has_variants": if p.has_variants { 1 } else { 0 },
            "stock": p.stock,
            "content_changed": p.content_changed,
            "content_rev": p.content_rev,
            "variants": p.variants.iter().map(|v| json!({
                "sync_id": v.sync_id,
                "label": v.label,
                "attributes_json": v.attributes_json,
                "sku": v.sku,
                "price": v.price,
                "stock": v.stock,
                "content_changed": v.content_changed,
                "content_rev": v.content_rev,
            })).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
    })
}

fn remember_push(conn: &Connection, products: &[PushProduct], accepted: &[AcceptedRev]) -> Result<(), String> {
    let mut revs: HashMap<(String, String), i64> = HashMap::new();
    for item in accepted {
        revs.insert((item.sync_id.clone(), item.variant_sync_id.clone()), item.content_rev);
    }
    for product in products {
        let rev = revs
            .get(&(product.sync_id.clone(), String::new()))
            .copied()
            .unwrap_or(product.content_rev);
        conn.execute(
            "INSERT INTO catalog_mobile_state (sync_id, variant_sync_id, content_rev, content_hash, pushed_stock)
             VALUES (?1, '', ?2, ?3, ?4)
             ON CONFLICT(sync_id, variant_sync_id) DO UPDATE SET
               content_rev = excluded.content_rev,
               content_hash = excluded.content_hash,
               pushed_stock = excluded.pushed_stock",
            params![product.sync_id, rev, product.hash, product.stock],
        )
        .map_err(|e| e.to_string())?;
        for variant in &product.variants {
            let rev = revs
                .get(&(product.sync_id.clone(), variant.sync_id.clone()))
                .copied()
                .unwrap_or(variant.content_rev);
            conn.execute(
                "INSERT INTO catalog_mobile_state (sync_id, variant_sync_id, content_rev, content_hash, pushed_stock)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(sync_id, variant_sync_id) DO UPDATE SET
                   content_rev = excluded.content_rev,
                   content_hash = excluded.content_hash,
                   pushed_stock = excluded.pushed_stock",
                params![product.sync_id, variant.sync_id, rev, variant.hash, variant.stock],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn blank(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() { None } else { Some(trimmed) }
}

fn apply_phone(conn: &Connection, response: &SyncResponse) -> Result<(Vec<String>, Vec<Value>), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut seen: Vec<Value> = Vec::new();
    let mut touched_stock: Vec<i64> = Vec::new();

    for product in &response.apply {
        let local_rev: i64 = tx
            .query_row(
                "SELECT content_rev FROM catalog_mobile_state WHERE sync_id = ?1 AND variant_sync_id = ''",
                [&product.sync_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let exists: Option<i64> = tx
            .query_row(
                "SELECT id FROM products WHERE sync_id = ?1",
                [&product.sync_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if product.create && exists.is_none() {
            let variant_sum: f64 = product.variants.iter().filter(|v| v.create).map(|v| v.initial_stock).sum();
            let has_variants = if product.variants.is_empty() { product.has_variants } else { 1 };
            let stock = if has_variants == 1 { variant_sum } else { product.initial_stock };
            let unit = if product.unit.trim().is_empty() { "unidad" } else { product.unit.as_str() };
            tx.execute(
                "INSERT INTO products (sync_id, name, sku, barcode, cost, price, stock, min_stock, unit, tax_rate, has_variants, active)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, 21, ?9, ?10)",
                params![
                    product.sync_id,
                    if product.name.trim().is_empty() { "Producto" } else { product.name.as_str() },
                    blank(&product.sku),
                    blank(&product.barcode),
                    product.cost,
                    product.price,
                    stock,
                    unit,
                    has_variants,
                    product.active,
                ],
            )
            .map_err(|e| e.to_string())?;
        } else if exists.is_some() && product.content_rev > local_rev {
            let unit = if product.unit.trim().is_empty() { "unidad" } else { product.unit.as_str() };
            tx.execute(
                "UPDATE products SET name=?1, sku=?2, barcode=?3, price=?4, cost=?5, unit=?6, active=?7,
                 updated_at=datetime('now','localtime') WHERE sync_id=?8",
                params![
                    if product.name.trim().is_empty() { "Producto" } else { product.name.as_str() },
                    blank(&product.sku),
                    blank(&product.barcode),
                    product.price,
                    product.cost,
                    unit,
                    product.active,
                    product.sync_id,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        let hash = product_hash(
            if product.name.trim().is_empty() { "Producto" } else { &product.name },
            product.price,
            &product.sku,
            &product.barcode,
            product.cost,
            if product.unit.trim().is_empty() { "unidad" } else { &product.unit },
            product.active,
        );
        tx.execute(
            "INSERT INTO catalog_mobile_state (sync_id, variant_sync_id, content_rev, content_hash, pushed_stock)
             VALUES (?1, '', ?2, ?3, COALESCE((SELECT pushed_stock FROM catalog_mobile_state WHERE sync_id=?1 AND variant_sync_id=''), ?4))
             ON CONFLICT(sync_id, variant_sync_id) DO UPDATE SET content_rev=excluded.content_rev, content_hash=excluded.content_hash",
            params![product.sync_id, product.content_rev, hash, product.initial_stock],
        )
        .map_err(|e| e.to_string())?;
        seen.push(json!({
            "sync_id": product.sync_id,
            "variant_sync_id": "",
            "content_rev": product.content_rev,
        }));

        let product_id: i64 = tx
            .query_row("SELECT id FROM products WHERE sync_id=?1", [&product.sync_id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        for variant in &product.variants {
            let local_rev: i64 = tx
                .query_row(
                    "SELECT content_rev FROM catalog_mobile_state WHERE sync_id=?1 AND variant_sync_id=?2",
                    params![product.sync_id, variant.sync_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let variant_exists: Option<i64> = tx
                .query_row(
                    "SELECT id FROM product_variants WHERE sync_id=?1",
                    [&variant.sync_id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let attributes = if variant.attributes_json.trim().is_empty() {
                json!({ "modelo": if variant.label.trim().is_empty() { "Modelo" } else { variant.label.as_str() } }).to_string()
            } else {
                variant.attributes_json.clone()
            };
            if variant.create && variant_exists.is_none() {
                tx.execute(
                    "INSERT INTO product_variants (product_id, attributes, sku, price, stock, min_stock, sync_id)
                     VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)",
                    params![
                        product_id,
                        attributes,
                        blank(&variant.sku),
                        variant.price,
                        variant.initial_stock,
                        variant.sync_id,
                    ],
                )
                .map_err(|e| e.to_string())?;
                if product.create {
                    tx.execute("UPDATE products SET has_variants=1 WHERE id=?1", [product_id])
                        .map_err(|e| e.to_string())?;
                } else {
                    tx.execute(
                        "UPDATE products SET has_variants=1, stock=stock+?1 WHERE id=?2",
                        params![variant.initial_stock, product_id],
                    )
                    .map_err(|e| e.to_string())?;
                    touched_stock.push(product_id);
                }
            } else if variant_exists.is_some() && variant.content_rev > local_rev {
                tx.execute(
                    "UPDATE product_variants SET attributes=?1, sku=?2, price=?3 WHERE sync_id=?4",
                    params![attributes, blank(&variant.sku), variant.price, variant.sync_id],
                )
                .map_err(|e| e.to_string())?;
            }
            let label = if variant.label.trim().is_empty() { variant_label(&attributes) } else { variant.label.clone() };
            let hash = variant_hash(&label, &variant.sku, variant.price);
            tx.execute(
                "INSERT INTO catalog_mobile_state (sync_id, variant_sync_id, content_rev, content_hash, pushed_stock)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(sync_id, variant_sync_id) DO UPDATE SET content_rev=excluded.content_rev, content_hash=excluded.content_hash",
                params![product.sync_id, variant.sync_id, variant.content_rev, hash, variant.initial_stock],
            )
            .map_err(|e| e.to_string())?;
            seen.push(json!({
                "sync_id": product.sync_id,
                "variant_sync_id": variant.sync_id,
                "content_rev": variant.content_rev,
            }));
        }
    }

    let mut op_ids: Vec<String> = Vec::new();
    for op in &response.stock_ops {
        let already: Option<String> = tx
            .query_row(
                "SELECT op_id FROM catalog_mobile_applied WHERE op_id=?1",
                [&op.id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if already.is_some() {
            op_ids.push(op.id.clone());
            continue;
        }
        if (op.delta).abs() < 0.0000001 {
            continue;
        }
        if op.variant_sync_id.is_empty() {
            let found: Option<(i64, i64)> = tx
                .query_row(
                    "SELECT id, has_variants FROM products WHERE sync_id=?1",
                    [&op.sync_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let Some((product_id, has_variants)) = found else { continue };
            if has_variants == 1 {
                continue;
            }
            tx.execute("UPDATE products SET stock=stock+?1 WHERE id=?2", params![op.delta, product_id])
                .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, sync_id)
                 VALUES (?1, 'adjustment', ?2, 'catalogo_movil', ?3)",
                params![product_id, op.delta, op.id],
            )
            .map_err(|e| e.to_string())?;
            touched_stock.push(product_id);
        } else {
            let found: Option<(i64, i64)> = tx
                .query_row(
                    "SELECT id, product_id FROM product_variants WHERE sync_id=?1",
                    [&op.variant_sync_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let Some((variant_id, product_id)) = found else { continue };
            tx.execute(
                "UPDATE product_variants SET stock=stock+?1 WHERE id=?2",
                params![op.delta, variant_id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute("UPDATE products SET stock=stock+?1 WHERE id=?2", params![op.delta, product_id])
                .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, sync_id)
                 VALUES (?1, 'adjustment', ?2, 'catalogo_movil', ?3, ?4)",
                params![product_id, op.delta, variant_id, op.id],
            )
            .map_err(|e| e.to_string())?;
            touched_stock.push(product_id);
        }
        tx.execute(
            "INSERT INTO catalog_mobile_applied (op_id, sync_id, variant_sync_id, delta, acked)
             VALUES (?1, ?2, ?3, ?4, 0)",
            params![op.id, op.sync_id, op.variant_sync_id, op.delta],
        )
        .map_err(|e| e.to_string())?;
        op_ids.push(op.id.clone());
    }

    for conflict in &response.conflicts {
        tx.execute(
            "INSERT INTO catalog_mobile_conflicts (sync_id, variant_sync_id, field, kept, discarded, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(NULLIF(?6, ''), datetime('now','localtime')))",
            params![
                conflict.sync_id,
                conflict.variant_sync_id,
                conflict.field,
                conflict.kept,
                conflict.discarded,
                conflict.created_at,
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.execute(
        "DELETE FROM catalog_mobile_conflicts WHERE id NOT IN (
            SELECT id FROM catalog_mobile_conflicts ORDER BY id DESC LIMIT 40
         )",
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    touched_stock.sort_unstable();
    touched_stock.dedup();
    for product_id in touched_stock {
        let _ = crate::tiendanube::enqueue_stock_push(product_id);
    }
    Ok((op_ids, seen))
}

fn mark_acked(conn: &Connection, op_ids: &[String]) -> Result<(), String> {
    for op_id in op_ids {
        conn.execute(
            "UPDATE catalog_mobile_applied SET acked=1 WHERE op_id=?1",
            [op_id],
        )
        .map_err(|e| e.to_string())?;
        let row: Option<(String, String, f64)> = conn
            .query_row(
                "SELECT sync_id, variant_sync_id, delta FROM catalog_mobile_applied WHERE op_id=?1",
                [op_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some((sync_id, variant_id, delta)) = row {
            conn.execute(
                "UPDATE catalog_mobile_state SET pushed_stock = COALESCE(pushed_stock, 0) + ?1
                 WHERE sync_id=?2 AND variant_sync_id=?3",
                params![delta, sync_id, variant_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn run_catalog_mobile_sync_once() -> Result<CatalogMobileStatus, String> {
    let (token, changes) = {
        let conn = open_exclusive()?;
        let token = read_token(&conn).ok_or_else(|| "Primero generá el código del celular.".to_string())?;
        let changes = collect_changes(&conn)?;
        (token, changes)
    };
    let response: SyncResponse = post_json("/v1/desktop/sync", &push_body(&changes), Some(&token))?;
    if !response.ok {
        return Err(response.error.unwrap_or_else(|| "No se pudo sincronizar.".into()));
    }
    let (op_ids, seen) = {
        let conn = open_exclusive()?;
        remember_push(&conn, &changes, &response.accepted)?;
        let applied = apply_phone(&conn, &response)?;
        write_setting(&conn, SETTING_PHONES, &response.phones.to_string())?;
        applied
    };
    let pending = {
        let conn = open_exclusive()?;
        let mut stmt = conn
            .prepare("SELECT op_id FROM catalog_mobile_applied WHERE acked=0")
            .map_err(|e| e.to_string())?;
        let ids = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut all = op_ids;
        for id in ids {
            if !all.contains(&id) {
                all.push(id);
            }
        }
        (all, seen)
    };
    let _: Value = post_json(
        "/v1/desktop/ack",
        &json!({ "op_ids": pending.0, "seen": pending.1 }),
        Some(&token),
    )?;
    let conn = open_exclusive()?;
    mark_acked(&conn, &pending.0)?;
    write_setting(&conn, SETTING_LAST_SYNC, &chrono_like_now())?;
    write_setting(&conn, SETTING_LAST_ERROR, "")?;
    let report = build_report(&conn)?;
    drop(conn);
    let _: Value = post_json("/v1/desktop/reports", &json!({ "report": report }), Some(&token))?;
    let conn = open_exclusive()?;
    Ok(status_from(&conn))
}

fn one_pair(conn: &Connection, sql: &str) -> Result<(f64, i64), String> {
    conn.query_row(sql, [], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())
}

fn build_report(conn: &Connection) -> Result<Value, String> {
    let (today_total, today_count) = one_pair(
        conn,
        "SELECT COALESCE(SUM(total), 0), COUNT(*) FROM sales
         WHERE voided = 0 AND date(created_at) = date('now','localtime')",
    )?;
    let (yesterday_total, yesterday_count) = one_pair(
        conn,
        "SELECT COALESCE(SUM(total), 0), COUNT(*) FROM sales
         WHERE voided = 0 AND date(created_at) = date('now','localtime','-1 day')",
    )?;
    let mut days = Vec::new();
    let mut stmt = conn
        .prepare(
            "WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < 6),
                  days AS (SELECT date('now','localtime', '-' || (6 - n) || ' days') AS day FROM seq)
             SELECT d.day, COUNT(s.id), COALESCE(SUM(s.total), 0)
             FROM days d
             LEFT JOIN sales s ON s.voided = 0 AND date(s.created_at) = d.day
             GROUP BY d.day
             ORDER BY d.day",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(json!({
            "day": row.get::<_, String>(0)?,
            "count": row.get::<_, i64>(1)?,
            "total": row.get::<_, f64>(2)?,
        }))
    }).map_err(|e| e.to_string())?;
    for row in rows {
        days.push(row.map_err(|e| e.to_string())?);
    }
    drop(stmt);

    let payments = query_objects(
        conn,
        "SELECT COALESCE(payment_method, 'efectivo'), COUNT(*), COALESCE(SUM(total), 0)
         FROM sales WHERE voided = 0 AND date(created_at) = date('now','localtime')
         GROUP BY payment_method ORDER BY SUM(total) DESC LIMIT 8",
        |row| {
            Ok(json!({
                "method": row.get::<_, String>(0)?,
                "count": row.get::<_, i64>(1)?,
                "total": row.get::<_, f64>(2)?,
            }))
        },
    )?;
    let employees = query_objects(
        conn,
        "SELECT COALESCE(u.display_name, 'Sin asignar'), COUNT(*), COALESCE(SUM(s.total), 0)
         FROM sales s LEFT JOIN users u ON u.id = s.user_id
         WHERE s.voided = 0 AND date(s.created_at) = date('now','localtime')
         GROUP BY s.user_id, u.display_name ORDER BY SUM(s.total) DESC LIMIT 8",
        |row| {
            Ok(json!({
                "name": row.get::<_, String>(0)?,
                "count": row.get::<_, i64>(1)?,
                "total": row.get::<_, f64>(2)?,
            }))
        },
    )?;
    let top_products = query_objects(
        conn,
        "SELECT si.name, COALESCE(SUM(si.qty), 0)
         FROM sale_items si INNER JOIN sales s ON s.id = si.sale_id
         WHERE s.voided = 0 AND date(s.created_at) = date('now','localtime')
         GROUP BY si.name ORDER BY SUM(si.qty) DESC LIMIT 8",
        |row| {
            Ok(json!({
                "name": row.get::<_, String>(0)?,
                "qty": row.get::<_, f64>(1)?,
            }))
        },
    )?;
    let low_stock = query_objects(
        conn,
        "SELECT p.name, p.stock, p.min_stock FROM products p
         WHERE p.active = 1 AND (
           (COALESCE(p.track_stock, 1) = 1 AND ((p.min_stock > 0 AND p.stock <= p.min_stock) OR p.stock < 0))
           OR EXISTS (
             SELECT 1 FROM product_variants v
             WHERE v.product_id = p.id AND v.min_stock > 0 AND v.stock <= v.min_stock
           )
         )
         ORDER BY CASE WHEN p.stock < 0 THEN 0 ELSE 1 END, (p.stock - p.min_stock), p.name
         LIMIT 8",
        |row| {
            Ok(json!({
                "name": row.get::<_, String>(0)?,
                "stock": row.get::<_, f64>(1)?,
                "min_stock": row.get::<_, f64>(2)?,
            }))
        },
    )?;
    let recent_sales = query_objects(
        conn,
        "SELECT created_at, total, COALESCE(payment_method, '')
         FROM sales WHERE voided = 0 ORDER BY created_at DESC LIMIT 8",
        |row| {
            Ok(json!({
                "at": row.get::<_, String>(0)?,
                "total": row.get::<_, f64>(1)?,
                "payment_method": row.get::<_, String>(2)?,
            }))
        },
    )?;
    Ok(json!({
        "today_total": today_total,
        "today_count": today_count,
        "yesterday_total": yesterday_total,
        "yesterday_count": yesterday_count,
        "days": days,
        "payments": payments,
        "employees": employees,
        "top_products": top_products,
        "low_stock": low_stock,
        "recent_sales": recent_sales,
    }))
}

fn query_objects<F>(conn: &Connection, sql: &str, map: F) -> Result<Vec<Value>, String>
where
    F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<Value>,
{
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn chrono_like_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // ISO-8601 UTC is enough for the settings screen; the UI formats it.
    format_unix(secs)
}

fn format_unix(secs: u64) -> String {
    let days = secs / 86400;
    let tod = secs % 86400;
    let hour = tod / 3600;
    let min = (tod % 3600) / 60;
    let sec = tod % 60;
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = (mp as i64) + if mp < 10 { 3 } else { -9 };
    let year = (y as i64) + if m <= 2 { 1 } else { 0 };
    format!("{year:04}-{m:02}-{d:02}T{hour:02}:{min:02}:{sec:02}Z")
}

pub fn pair_catalog_mobile() -> Result<CatalogMobileStatus, String> {
    let (token, business) = {
        let conn = open_exclusive()?;
        let business = read_setting(&conn, "business_name").unwrap_or_else(|| "Mi comercio".into());
        (read_token(&conn), business)
    };
    let body = json!({
        "business_name": business,
        "api_token": token,
    });
    let res: PairResponse = post_json("/v1/pair", &body, None)?;
    if !res.ok {
        return Err(res.error.unwrap_or_else(|| "No se pudo generar el código.".into()));
    }
    let conn = open_exclusive()?;
    if let Some(api_token) = res.api_token.filter(|s| !s.is_empty()) {
        write_token(&conn, &api_token)?;
    }
    write_setting(&conn, SETTING_CODE, res.pair_code.as_deref().unwrap_or(""))?;
    write_setting(&conn, SETTING_EXPIRES, res.pair_expires_at.as_deref().unwrap_or(""))?;
    write_setting(&conn, SETTING_LAST_ERROR, "")?;
    Ok(status_from(&conn))
}

pub fn revoke_catalog_mobile() -> Result<CatalogMobileStatus, String> {
    let token = {
        let conn = open_exclusive()?;
        read_token(&conn)
    };
    if let Some(token) = token.as_deref() {
        let _: Result<Value, String> = post_json("/v1/desktop/revoke", &json!({}), Some(token));
    }
    let conn = open_exclusive()?;
    write_setting(&conn, SETTING_TOKEN, "")?;
    write_setting(&conn, SETTING_CODE, "")?;
    write_setting(&conn, SETTING_EXPIRES, "")?;
    write_setting(&conn, SETTING_PHONES, "0")?;
    Ok(status_from(&conn))
}

pub fn spawn_catalog_mobile_worker(interval_secs: u64) {
    if WORKER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(8));
        loop {
            if let Ok(conn) = open_exclusive() {
                if read_token(&conn).is_some() {
                    drop(conn);
                    if let Err(e) = run_catalog_mobile_sync_once() {
                        eprintln!("[catalogo-movil] {e}");
                        if let Ok(conn) = open_exclusive() {
                            let _ = write_setting(&conn, SETTING_LAST_ERROR, &e);
                        }
                    }
                }
            }
            thread::sleep(Duration::from_secs(interval_secs.max(10)));
        }
    });
}

#[tauri::command]
pub async fn catalog_mobile_get_status() -> Result<CatalogMobileStatus, String> {
    Ok(catalog_mobile_status())
}

#[tauri::command]
pub async fn catalog_mobile_pair() -> Result<CatalogMobileStatus, String> {
    tauri::async_runtime::spawn_blocking(pair_catalog_mobile)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn catalog_mobile_revoke() -> Result<CatalogMobileStatus, String> {
    tauri::async_runtime::spawn_blocking(revoke_catalog_mobile)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn catalog_mobile_sync_now() -> Result<CatalogMobileStatus, String> {
    tauri::async_runtime::spawn_blocking(run_catalog_mobile_sync_once)
        .await
        .map_err(|e| e.to_string())?
}
