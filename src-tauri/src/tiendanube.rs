//! Cliente API Tienda Nube: importar productos, push/pull de stock y ventas online.

use crate::database::open_exclusive;
use crate::db_manager::DbManager;
use crate::license::get_license_status;
use crate::product_search::rebuild_products_fts;
use crate::settings_util::{
    read_setting, read_setting_flag, read_setting_or, write_setting, write_setting_flag,
};
use crate::tn_app_credentials::tn_oauth_available;
use reqwest::blocking::Client;
use crate::tiendanube_match::{fold_key, variant_signature};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use uuid::Uuid;

const API_VERSION: &str = "2025-03";
const USER_AGENT: &str = "WalQo (juank.gagliano@gmail.com)";
const FREE_PLAN_PRODUCT_LIMIT: u32 = 25;

static TN_JOB: Mutex<()> = Mutex::new(());
static STOCK_EPOCH_AT_FETCH: Mutex<i64> = Mutex::new(-1);

#[derive(Debug, Serialize)]
pub struct TnConfigStatus {
    pub enabled: bool,
    pub connected: bool,
    pub oauth_available: bool,
    pub sync_stock: bool,
    pub store_id: Option<String>,
    pub store_name: Option<String>,
    pub last_import_at: Option<String>,
    pub last_order_sync_at: Option<String>,
    pub mapped_products: u32,
    pub outbox_pending: u32,
    /// URL pública para instalar/autorizar la app (OAuth).
    pub install_url: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct TnImportResult {
    pub inserted: u32,
    pub updated: u32,
    pub skipped: u32,
    pub pages: u32,
    pub products_seen: u32,
    pub variants_seen: u32,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct TnOrderSyncResult {
    pub orders_processed: u32,
    pub stock_deducted: u32,
    pub skipped: u32,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct TnPushStockResult {
    pub pushed: u32,
    pub failed: u32,
    pub errors: Vec<String>,
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())
}

fn api_base(store_id: &str) -> String {
    format!("https://api.tiendanube.com/{API_VERSION}/{store_id}")
}

fn credentials(conn: &Connection) -> Result<(String, String), String> {
    let store_id = read_setting_or(conn, "tn_store_id", "");
    let token = read_setting_or(conn, "tn_access_token", "");
    if store_id.trim().is_empty() || token.trim().is_empty() {
        return Err("Tienda Nube no está conectada.".into());
    }
    Ok((store_id.trim().to_string(), token.trim().to_string()))
}

fn tn_get(store_id: &str, token: &str, path: &str) -> Result<Value, String> {
    Ok(tn_get_page(store_id, token, path)?.0)
}

/// GET con reintentos + headers de paginación (`x-total-count`, `Link`).
fn tn_get_page(
    store_id: &str,
    token: &str,
    path_or_url: &str,
) -> Result<(Value, Option<u64>, Option<String>), String> {
    let url = if path_or_url.starts_with("http") {
        path_or_url.to_string()
    } else {
        format!("{}{}", api_base(store_id), path_or_url)
    };
    let client = http_client()?;
    let mut last_err = String::new();
    for attempt in 0..5 {
        let response = client
            .get(&url)
            .header("Authentication", format!("bearer {token}"))
            .header("Authorization", format!("Bearer {token}"))
            .header("User-Agent", USER_AGENT)
            .send()
            .map_err(|e| format!("Sin conexión con Tienda Nube: {e}"))?;
        let status = response.status();
        let total = response
            .headers()
            .get("x-total-count")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok());
        let next_link = response
            .headers()
            .get("link")
            .and_then(|v| v.to_str().ok())
            .and_then(parse_link_next)
            .map(|s| s.to_string());

        if status.as_u16() == 429 || status.is_server_error() {
            last_err = format!("Tienda Nube {status}");
            thread::sleep(Duration::from_millis(400 * (attempt as u64 + 1)));
            continue;
        }

        let body: Value = response
            .json()
            .map_err(|e| format!("Respuesta inválida de Tienda Nube: {e}"))?;
        if !status.is_success() {
            let msg = body
                .get("description")
                .or_else(|| body.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("Error de la API de Tienda Nube");
            return Err(format!("{msg} ({status})"));
        }
        return Ok((body, total, next_link));
    }
    Err(last_err)
}

fn parse_link_next(link_header: &str) -> Option<&str> {
    // Link: <url>; rel="next", <url>; rel="last"
    for part in link_header.split(',') {
        let part = part.trim();
        if !part.contains("rel=\"next\"") && !part.contains("rel='next'") {
            continue;
        }
        let start = part.find('<')? + 1;
        let end = part.find('>')?;
        return Some(&part[start..end]);
    }
    None
}

fn tn_request(
    method: reqwest::Method,
    store_id: &str,
    token: &str,
    path: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let url = format!("{}{}", api_base(store_id), path);
    let client = http_client()?;
    let mut req = client
        .request(method, &url)
        .header("Authentication", format!("bearer {token}"))
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Content-Type", "application/json");
    if let Some(b) = body {
        req = req.json(&b);
    }
    let response = req
        .send()
        .map_err(|e| format!("Sin conexión con Tienda Nube: {e}"))?;
    let status = response.status();
    let text = response.text().unwrap_or_default();
    if text.trim().is_empty() {
        if status.is_success() {
            return Ok(Value::Null);
        }
        return Err(format!("Error Tienda Nube ({status})"));
    }
    let parsed: Value = serde_json::from_str(&text).unwrap_or(Value::String(text.clone()));
    if !status.is_success() {
        let msg = parsed
            .get("description")
            .or_else(|| parsed.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("Error de la API de Tienda Nube");
        return Err(format!("{msg} ({status})"));
    }
    Ok(parsed)
}

pub fn fetch_store_name(store_id: &str, token: &str) -> Result<String, String> {
    let body = tn_get(store_id, token, "/store")?;
    let name = localized_str(body.get("name").unwrap_or(&Value::Null));
    if name.is_empty() {
        Ok(format!("Tienda {store_id}"))
    } else {
        Ok(name)
    }
}

fn localized_str(v: &Value) -> String {
    if let Some(s) = v.as_str() {
        return s.trim().to_string();
    }
    if let Some(obj) = v.as_object() {
        for key in ["es_AR", "es", "pt", "en", "es_MX"] {
            if let Some(s) = obj.get(key).and_then(|x| x.as_str()) {
                let t = s.trim();
                if !t.is_empty() {
                    return t.to_string();
                }
            }
        }
        for val in obj.values() {
            if let Some(s) = val.as_str() {
                let t = s.trim();
                if !t.is_empty() {
                    return t.to_string();
                }
            }
        }
    }
    String::new()
}

fn json_f64(v: Option<&Value>) -> f64 {
    match v {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.replace(',', ".").parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn json_i64(v: Option<&Value>) -> Option<i64> {
    match v {
        Some(Value::Number(n)) => n.as_i64().or_else(|| n.as_u64().map(|u| u as i64)),
        Some(Value::String(s)) => s.trim().parse().ok(),
        _ => None,
    }
}

fn variant_label(variant: &Value) -> String {
    let mut parts = Vec::new();
    if let Some(arr) = variant.get("values").and_then(|v| v.as_array()) {
        for item in arr {
            let s = localized_str(item);
            if !s.is_empty() {
                parts.push(s);
            } else if let Some(obj) = item.as_object() {
                for val in obj.values() {
                    let s = localized_str(val);
                    if !s.is_empty() {
                        parts.push(s);
                        break;
                    }
                }
            }
        }
    }
    parts.join(" / ")
}

/// Nombres de atributos TN (Color, Talle, etc.) en español usable para ropa/calzado.
fn attribute_names(product: &Value) -> Vec<String> {
    let mut names = Vec::new();
    if let Some(arr) = product.get("attributes").and_then(|v| v.as_array()) {
        for (i, item) in arr.iter().enumerate() {
            let raw = localized_str(item);
            names.push(normalize_attr_name(&raw, i));
        }
    }
    names
}

fn normalize_attr_name(raw: &str, index: usize) -> String {
    let t = raw.trim();
    if t.is_empty() {
        return match index {
            0 => "Opción 1".into(),
            1 => "Opción 2".into(),
            _ => format!("Opción {}", index + 1),
        };
    }
    let lower = t.to_lowercase();
    if matches!(
        lower.as_str(),
        "color" | "colour" | "cor" | "colo" | "colors" | "colores"
    ) {
        return "Color".into();
    }
    if matches!(
        lower.as_str(),
        "size" | "talle" | "tamanho" | "talla" | "sizes" | "talles"
    ) || lower.contains("talle")
        || lower.contains("size")
        || lower.contains("talla")
        || lower.contains("numerac")
    {
        return "Talle".into();
    }
    if lower.contains("material") || lower == "tela" || lower == "fabric" {
        return "Material".into();
    }
    if lower.contains("estilo") || lower == "style" {
        return "Estilo".into();
    }
    // Capitalizar primera letra
    let mut chars = t.chars();
    match chars.next() {
        Some(c) => format!("{}{}", c.to_uppercase(), chars.as_str()),
        None => t.to_string(),
    }
}

fn variant_attributes_json(product: &Value, variant: &Value) -> String {
    let names = attribute_names(product);
    let mut map = serde_json::Map::new();
    if let Some(arr) = variant.get("values").and_then(|v| v.as_array()) {
        for (i, item) in arr.iter().enumerate() {
            let val = localized_str(item);
            if val.is_empty() {
                continue;
            }
            let key = names
                .get(i)
                .cloned()
                .unwrap_or_else(|| normalize_attr_name("", i));
            map.insert(key, Value::String(val));
        }
    }
    Value::Object(map).to_string()
}

fn variant_has_real_options(variant: &Value) -> bool {
    let label = variant_label(variant);
    !label.is_empty()
}

fn free_plan_limit(conn: &Connection) -> Result<(bool, u32), String> {
    let status = get_license_status();
    let limited = status.plan == "free";
    if !limited {
        return Ok((false, 0));
    }
    let count: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM products WHERE active = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok((true, count))
}

fn find_flat_product_id(
    conn: &Connection,
    tn_variant_id: i64,
) -> Result<Option<i64>, String> {
    conn.query_row(
        "SELECT id FROM products WHERE tn_variant_id = ?1 LIMIT 1",
        [tn_variant_id],
        |r| r.get::<_, i64>(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn find_parent_product_id(conn: &Connection, tn_product_id: i64) -> Result<Option<i64>, String> {
    conn.query_row(
        "SELECT id FROM products
         WHERE tn_product_id = ?1 AND active = 1
           AND (tn_variant_id IS NULL OR has_variants = 1)
         LIMIT 1",
        [tn_product_id],
        |r| r.get::<_, i64>(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn json_stock_opt(v: Option<&Value>) -> Option<f64> {
    match v {
        None | Some(Value::Null) => None,
        Some(Value::Number(n)) => n.as_f64(),
        Some(Value::String(s)) => {
            let t = s.trim();
            if t.is_empty() || t.eq_ignore_ascii_case("null") {
                None
            } else {
                t.replace(',', ".").parse().ok()
            }
        }
        _ => None,
    }
}

fn stock_epoch(conn: &Connection) -> i64 {
    read_setting(conn, "tn_stock_epoch")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

fn bump_stock_epoch(conn: &Connection) {
    let next = stock_epoch(conn) + 1;
    let _ = write_setting(conn, "tn_stock_epoch", &next.to_string());
}

fn remote_snapshot_is_stale(conn: &Connection) -> bool {
    let before = *STOCK_EPOCH_AT_FETCH
        .lock()
        .unwrap_or_else(|p| p.into_inner());
    before >= 0 && stock_epoch(conn) != before
}

fn variant_outbox_pending(conn: &Connection, tn_variant_id: i64) -> bool {
    conn.query_row(
        "SELECT 1 FROM tn_stock_outbox WHERE tn_variant_id = ?1 LIMIT 1",
        [tn_variant_id],
        |_| Ok(true),
    )
    .optional()
    .ok()
    .flatten()
    .unwrap_or(false)
}

fn log_remote_stock_delta(conn: &Connection, product_id: i64, delta: f64) {
    if delta.abs() < 0.0001 {
        return;
    }
    let sync_id = Uuid::new_v4().simple().to_string();
    let _ = conn.execute(
        "INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, sync_id)
         VALUES (?1, 'adjustment', ?2, 'tiendanube', ?3)",
        params![product_id, delta, sync_id],
    );
}

fn local_attr_values(raw: &str) -> Vec<String> {
    let Ok(v) = serde_json::from_str::<Value>(raw) else {
        return Vec::new();
    };
    match v {
        Value::Object(map) => map
            .into_values()
            .filter_map(|item| {
                let text = localized_str(&item);
                if text.is_empty() { None } else { Some(text) }
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn tn_variant_values(variant: &Value) -> Vec<String> {
    let label = variant_label(variant);
    if label.is_empty() {
        Vec::new()
    } else {
        vec![label]
    }
}

struct OpenVariant {
    id: i64,
    tn_variant_id: Option<i64>,
    sku: Option<String>,
    barcode: Option<String>,
    attributes: String,
    stock: f64,
}

fn load_open_variants(conn: &Connection, product_id: i64) -> Result<Vec<OpenVariant>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, tn_variant_id, sku, barcode, IFNULL(attributes,'{}'), stock
             FROM product_variants WHERE product_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([product_id], |r| {
            Ok(OpenVariant {
                id: r.get(0)?,
                tn_variant_id: r.get(1)?,
                sku: r.get(2)?,
                barcode: r.get(3)?,
                attributes: r.get(4)?,
                stock: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn pick_variant_row(
    rows: &[OpenVariant],
    tn_variant_id: i64,
    sku: Option<&str>,
    barcode: Option<&str>,
    sig: &str,
) -> Option<usize> {
    if let Some(i) = rows
        .iter()
        .position(|r| r.tn_variant_id == Some(tn_variant_id))
    {
        return Some(i);
    }
    if let Some(sku) = sku.map(str::trim).filter(|s| !s.is_empty()) {
        let hits: Vec<usize> = rows
            .iter()
            .enumerate()
            .filter(|(_, r)| {
                r.tn_variant_id.is_none()
                    && r.sku
                        .as_deref()
                        .is_some_and(|s| s.eq_ignore_ascii_case(sku))
            })
            .map(|(i, _)| i)
            .collect();
        if hits.len() == 1 {
            return Some(hits[0]);
        }
    }
    if let Some(barcode) = barcode.map(str::trim).filter(|s| !s.is_empty()) {
        let hits: Vec<usize> = rows
            .iter()
            .enumerate()
            .filter(|(_, r)| {
                r.tn_variant_id.is_none()
                    && r.barcode
                        .as_deref()
                        .is_some_and(|s| s.eq_ignore_ascii_case(barcode))
            })
            .map(|(i, _)| i)
            .collect();
        if hits.len() == 1 {
            return Some(hits[0]);
        }
    }
    if sig.is_empty() {
        return None;
    }
    let hits: Vec<usize> = rows
        .iter()
        .enumerate()
        .filter(|(_, r)| {
            r.tn_variant_id.is_none()
                && variant_signature(&local_attr_values(&r.attributes)) == sig
        })
        .map(|(i, _)| i)
        .collect();
    if hits.len() == 1 {
        Some(hits[0])
    } else {
        None
    }
}

fn without_tag(name: &str) -> &str {
    name.split(" [").next().unwrap_or(name).trim()
}

fn find_local_parent_by_name(conn: &Connection, name: &str) -> Result<Option<i64>, String> {
    let want = fold_key(name);
    if want.is_empty() {
        return Ok(None);
    }
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.name FROM products p
             WHERE p.active = 1
               AND p.tn_product_id IS NULL
               AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut hits = Vec::new();
    for row in rows {
        let (id, product_name) = row.map_err(|e| e.to_string())?;
        if fold_key(&product_name) == want {
            hits.push(id);
        }
    }
    Ok(if hits.len() == 1 { Some(hits[0]) } else { None })
}

fn find_local_flat(
    conn: &Connection,
    base_name: &str,
    flat_name: &str,
    sku: Option<&str>,
    barcode: Option<&str>,
) -> Result<Option<i64>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, sku, barcode FROM products
             WHERE active = 1 AND IFNULL(has_variants,0) = 0 AND tn_variant_id IS NULL",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut loaded = Vec::new();
    for row in rows {
        loaded.push(row.map_err(|e| e.to_string())?);
    }
    if let Some(sku) = sku.map(str::trim).filter(|s| !s.is_empty()) {
        let hits: Vec<i64> = loaded
            .iter()
            .filter(|r| r.2.as_deref().is_some_and(|s| s.eq_ignore_ascii_case(sku)))
            .map(|r| r.0)
            .collect();
        if hits.len() == 1 {
            return Ok(Some(hits[0]));
        }
    }
    if let Some(barcode) = barcode.map(str::trim).filter(|s| !s.is_empty()) {
        let hits: Vec<i64> = loaded
            .iter()
            .filter(|r| {
                r.3.as_deref()
                    .is_some_and(|s| s.eq_ignore_ascii_case(barcode))
            })
            .map(|r| r.0)
            .collect();
        if hits.len() == 1 {
            return Ok(Some(hits[0]));
        }
    }
    let want_base = fold_key(base_name);
    let want_flat = fold_key(flat_name);
    let hits: Vec<i64> = loaded
        .iter()
        .filter(|r| {
            let key = fold_key(&r.1);
            (!want_base.is_empty() && key == want_base) || (!want_flat.is_empty() && key == want_flat)
        })
        .map(|r| r.0)
        .collect();
    Ok(if hits.len() == 1 { Some(hits[0]) } else { None })
}

fn product_has_sales(conn: &Connection, product_id: i64) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sale_items WHERE product_id = ?1",
        [product_id],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

fn deactivate_unused_tn_duplicate(conn: &Connection, product_id: i64) {
    let _ = conn.execute(
        "UPDATE product_variants SET tn_variant_id = NULL WHERE product_id = ?1",
        [product_id],
    );
    let _ = conn.execute(
        "UPDATE products SET
            active = 0, tn_product_id = NULL, tn_variant_id = NULL,
            updated_at = datetime('now')
         WHERE id = ?1 AND catalog_source = 'tiendanube'
           AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.product_id = products.id)",
        [product_id],
    );
}

fn upsert_flat_product(
    conn: &Connection,
    tn_product_id: i64,
    tn_variant_id: i64,
    base_name: &str,
    name: &str,
    barcode: Option<&str>,
    sku: Option<&str>,
    price: f64,
    cost: f64,
    remote_stock: Option<f64>,
    free_limited: bool,
    free_count: &mut u32,
    pulled: &mut HashSet<i64>,
) -> Result<&'static str, String> {
    if let Some(id) = find_flat_product_id(conn, tn_variant_id)? {
        let old_stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id = ?1", [id], |r| r.get(0))
            .unwrap_or(0.0);
        let pending = variant_outbox_pending(conn, tn_variant_id) || remote_snapshot_is_stale(conn);
        if pending || remote_stock.is_none() {
            conn.execute(
                "UPDATE products SET
                    name = ?1, price = ?2, cost = ?3,
                    sku = COALESCE(?4, sku), barcode = COALESCE(?5, barcode),
                    tn_product_id = ?6, tn_variant_id = ?7,
                    catalog_source = 'tiendanube', has_variants = 0,
                    updated_at = datetime('now'), active = 1
                 WHERE id = ?8",
                params![name, price, cost, sku, barcode, tn_product_id, tn_variant_id, id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            let stock = remote_stock.unwrap_or(old_stock);
            conn.execute(
                "UPDATE products SET
                    name = ?1, price = ?2, cost = ?3, stock = ?4,
                    sku = COALESCE(?5, sku), barcode = COALESCE(?6, barcode),
                    tn_product_id = ?7, tn_variant_id = ?8,
                    catalog_source = 'tiendanube', has_variants = 0,
                    updated_at = datetime('now'), active = 1
                 WHERE id = ?9",
                params![
                    name,
                    price,
                    cost,
                    stock,
                    sku,
                    barcode,
                    tn_product_id,
                    tn_variant_id,
                    id
                ],
            )
            .map_err(|e| e.to_string())?;
            log_remote_stock_delta(conn, id, stock - old_stock);
            pulled.insert(tn_variant_id);
        }
        return Ok("updated");
    }

    if let Some(id) = find_local_flat(conn, base_name, name, sku, barcode)? {
        conn.execute(
            "UPDATE products SET
                tn_product_id = ?1, tn_variant_id = ?2, has_variants = 0,
                sku = COALESCE(?3, sku), barcode = COALESCE(?4, barcode),
                updated_at = datetime('now')
             WHERE id = ?5",
            params![tn_product_id, tn_variant_id, sku, barcode, id],
        )
        .map_err(|e| e.to_string())?;
        let _ = enqueue_stock_push_inner(conn, id);
        return Ok("updated");
    }

    if free_limited && *free_count >= FREE_PLAN_PRODUCT_LIMIT {
        return Ok("skipped");
    }

    let stock = remote_stock.unwrap_or(0.0);
    conn.execute(
        "INSERT INTO products (
            sku, barcode, name, cost, price, stock, min_stock, unit, tax_rate,
            catalog_source, tn_product_id, tn_variant_id, has_variants, sync_id, active
         ) VALUES (?1,?2,?3,?4,?5,?6,0,'unidad',21,'tiendanube',?7,?8,0, lower(hex(randomblob(16))), 1)",
        params![
            sku,
            barcode,
            name,
            cost,
            price,
            stock,
            tn_product_id,
            tn_variant_id
        ],
    )
    .map_err(|e| e.to_string())?;
    *free_count += 1;
    pulled.insert(tn_variant_id);
    Ok("inserted")
}

fn upsert_parent_with_variants(
    conn: &Connection,
    tn_product_id: i64,
    name: &str,
    variants: &[Value],
    product: &Value,
    free_limited: bool,
    free_count: &mut u32,
    pulled: &mut HashSet<i64>,
) -> Result<&'static str, String> {
    let mut price = 0.0;
    let mut cost = 0.0;
    let mut first = true;
    for v in variants {
        let p = json_f64(v.get("price"));
        let c = json_f64(v.get("cost"));
        if first || p > 0.0 {
            if first || price <= 0.0 {
                price = p;
            }
            if first || cost <= 0.0 {
                cost = c;
            }
            first = false;
        }
    }

    let local_named = find_local_parent_by_name(conn, without_tag(name))?
        .or(find_local_parent_by_name(conn, name).unwrap_or(None));
    let by_tn = find_parent_product_id(conn, tn_product_id)?;
    let (parent_id, status, first_link) = if let Some(local_id) = local_named {
        let dup_keeps_link = by_tn
            .filter(|dup_id| *dup_id != local_id && product_has_sales(conn, *dup_id));
        if let Some(dup_id) = by_tn {
            if dup_id != local_id && !product_has_sales(conn, dup_id) {
                deactivate_unused_tn_duplicate(conn, dup_id);
            }
        }
        if let Some(dup_id) = dup_keeps_link {
            conn.execute(
                "UPDATE products SET
                    name = ?1, price = ?2, cost = ?3,
                    tn_product_id = ?4, tn_variant_id = NULL,
                    catalog_source = 'tiendanube', has_variants = 1,
                    updated_at = datetime('now'), active = 1
                 WHERE id = ?5",
                params![name, price, cost, tn_product_id, dup_id],
            )
            .map_err(|e| e.to_string())?;
            (dup_id, "updated", false)
        } else {
            conn.execute(
                "UPDATE products SET
                    tn_product_id = ?1, tn_variant_id = NULL, has_variants = 1,
                    updated_at = datetime('now')
                 WHERE id = ?2",
                params![tn_product_id, local_id],
            )
            .map_err(|e| e.to_string())?;
            (local_id, "updated", true)
        }
    } else if let Some(id) = by_tn {
        let source: String = conn
            .query_row(
                "SELECT IFNULL(catalog_source, '') FROM products WHERE id = ?1",
                [id],
                |r| r.get(0),
            )
            .unwrap_or_default();
        if source == "tiendanube" {
            conn.execute(
                "UPDATE products SET
                    name = ?1, price = ?2, cost = ?3,
                    tn_product_id = ?4, tn_variant_id = NULL,
                    has_variants = 1, updated_at = datetime('now'), active = 1
                 WHERE id = ?5",
                params![name, price, cost, tn_product_id, id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "UPDATE products SET
                    tn_product_id = ?1, tn_variant_id = NULL, has_variants = 1,
                    updated_at = datetime('now'), active = 1
                 WHERE id = ?2",
                params![tn_product_id, id],
            )
            .map_err(|e| e.to_string())?;
        }
        (id, "updated", false)
    } else {
        if free_limited && *free_count >= FREE_PLAN_PRODUCT_LIMIT {
            return Ok("skipped");
        }
        conn.execute(
            "INSERT INTO products (
                name, cost, price, stock, min_stock, unit, tax_rate,
                catalog_source, tn_product_id, tn_variant_id, has_variants, sync_id, active
             ) VALUES (?1,?2,?3,0,0,'unidad',21,'tiendanube',?4,NULL,1, lower(hex(randomblob(16))), 1)",
            params![name, cost, price, tn_product_id],
        )
        .map_err(|e| e.to_string())?;
        *free_count += 1;
        (conn.last_insert_rowid(), "inserted", false)
    };

    let mut rows = load_open_variants(conn, parent_id)?;
    let mut push_local = first_link;

    for v in variants {
        let tn_variant_id = match json_i64(v.get("id")) {
            Some(id) => id,
            None => continue,
        };
        let attrs = variant_attributes_json(product, v);
        let barcode = v
            .get("barcode")
            .and_then(|x| x.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let sku = v
            .get("sku")
            .and_then(|x| x.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let vprice = json_f64(v.get("price"));
        let remote_stock = json_stock_opt(v.get("stock"));
        let sig = variant_signature(&tn_variant_values(v));

        if let Some(idx) = pick_variant_row(
            &rows,
            tn_variant_id,
            sku.as_deref(),
            barcode.as_deref(),
            &sig,
        ) {
            let row = &rows[idx];
            let already = row.tn_variant_id == Some(tn_variant_id);
            let pending =
                variant_outbox_pending(conn, tn_variant_id) || remote_snapshot_is_stale(conn);
            if !already || first_link {
                conn.execute(
                    "UPDATE product_variants SET
                        tn_variant_id = ?1,
                        sku = COALESCE(?2, sku),
                        barcode = COALESCE(?3, barcode)
                     WHERE id = ?4",
                    params![tn_variant_id, sku, barcode, row.id],
                )
                .map_err(|e| e.to_string())?;
                push_local = true;
            } else if !pending {
                if let Some(stock) = remote_stock {
                    let delta = stock - row.stock;
                    conn.execute(
                        "UPDATE product_variants SET
                            stock = ?1, price = ?2, attributes = ?3, tn_variant_id = ?4,
                            sku = COALESCE(?5, sku), barcode = COALESCE(?6, barcode)
                         WHERE id = ?7",
                        params![stock, vprice, attrs, tn_variant_id, sku, barcode, row.id],
                    )
                    .map_err(|e| e.to_string())?;
                    log_remote_stock_delta(conn, parent_id, delta);
                    pulled.insert(tn_variant_id);
                }
            }
            rows[idx].tn_variant_id = Some(tn_variant_id);
            if let Some(stock) = remote_stock {
                if already && !first_link && !pending {
                    rows[idx].stock = stock;
                }
            }
        } else {
            let stock = remote_stock.unwrap_or(0.0);
            conn.execute(
                "INSERT INTO product_variants
                   (product_id, attributes, sku, barcode, price, stock, tn_variant_id)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![parent_id, attrs, sku, barcode, vprice, stock, tn_variant_id],
            )
            .map_err(|e| e.to_string())?;
            let new_id = conn.last_insert_rowid();
            rows.push(OpenVariant {
                id: new_id,
                tn_variant_id: Some(tn_variant_id),
                sku: sku.clone(),
                barcode: barcode.clone(),
                attributes: attrs,
                stock,
            });
            if !first_link {
                pulled.insert(tn_variant_id);
                log_remote_stock_delta(conn, parent_id, stock);
            }
        }

        let _ = conn.execute(
            "UPDATE products SET active = 0, updated_at = datetime('now')
             WHERE tn_variant_id = ?1 AND id != ?2 AND catalog_source = 'tiendanube'",
            params![tn_variant_id, parent_id],
        );
    }

    let total_stock: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = ?1",
            [parent_id],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    conn.execute(
        "UPDATE products SET stock = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![total_stock, parent_id],
    )
    .map_err(|e| e.to_string())?;

    if push_local {
        let _ = enqueue_stock_push_inner(conn, parent_id);
    }

    Ok(status)
}

fn import_catalog() -> Result<(TnImportResult, HashSet<i64>), String> {
    if let Ok(conn) = open_exclusive() {
        let epoch = stock_epoch(&conn);
        *STOCK_EPOCH_AT_FETCH
            .lock()
            .unwrap_or_else(|p| p.into_inner()) = epoch;
    }
    let (store_id, token) = {
        let conn = open_exclusive()?;
        if !read_setting_flag(&conn, "tn_enabled") && !read_setting_flag(&conn, "tn_oauth_connected")
        {
            let _ = credentials(&conn)?;
        }
        credentials(&conn)?
    };

    // 1) Bajar todo el catálogo TN (HTTP sin lock de SQLite).
    let mut remote: Vec<Value> = Vec::new();
    let mut pages = 0u32;
    let mut next: Option<String> =
        Some(format!("/products?page=1&per_page=200"));
    let mut api_total: Option<u64> = None;
    let mut errors = Vec::new();

    while let Some(path) = next.take() {
        pages += 1;
        if pages > 500 {
            errors.push("Se alcanzó el límite de páginas de importación (500).".into());
            break;
        }
        match tn_get_page(&store_id, &token, &path) {
            Ok((body, total, link_next)) => {
                if api_total.is_none() {
                    api_total = total;
                }
                match body.as_array() {
                    Some(arr) if !arr.is_empty() => {
                        remote.extend(arr.iter().cloned());
                        next = link_next.or_else(|| {
                            // Fallback si no hay Link: seguir mientras vengan 200
                            if arr.len() >= 200 {
                                Some(format!("/products?page={}&per_page=200", pages + 1))
                            } else {
                                None
                            }
                        });
                    }
                    Some(_) => break,
                    None => {
                        errors.push("La API no devolvió una lista de productos.".into());
                        break;
                    }
                }
            }
            Err(e) => {
                errors.push(format!("Página {pages}: {e}"));
                break;
            }
        }
        // Evitar rate limit
        thread::sleep(Duration::from_millis(80));
    }

    // Completar variantes si el listado vino vacío.
    for product in remote.iter_mut() {
        let has_variants = product
            .get("variants")
            .and_then(|v| v.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);
        if has_variants {
            continue;
        }
        let Some(pid) = json_i64(product.get("id")) else {
            continue;
        };
        if let Ok(vars) = tn_get(&store_id, &token, &format!("/products/{pid}/variants")) {
            if let Some(arr) = vars.as_array() {
                if let Some(obj) = product.as_object_mut() {
                    obj.insert("variants".into(), Value::Array(arr.clone()));
                }
            }
        }
        thread::sleep(Duration::from_millis(40));
    }

    // 2) Upsert en DB.
    let conn = open_exclusive()?;
    let (free_limited, mut free_count) = free_plan_limit(&conn)?;
    let mut inserted = 0u32;
    let mut updated = 0u32;
    let mut skipped = 0u32;
    let mut products_seen = 0u32;
    let mut variants_seen = 0u32;
    let mut pulled: HashSet<i64> = HashSet::new();

    for product in &remote {
        products_seen += 1;
        let tn_product_id = match json_i64(product.get("id")) {
            Some(id) => id,
            None => {
                skipped += 1;
                continue;
            }
        };
        let base_name = localized_str(product.get("name").unwrap_or(&Value::Null));
        let tags = product
            .get("tags")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let mut variants = product
            .get("variants")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        if variants.is_empty() {
            variants.push(json!({
                "id": tn_product_id,
                "price": product.get("price").cloned().unwrap_or(Value::Null),
                "cost": product.get("cost").cloned().unwrap_or(Value::Null),
                "stock": product.get("stock").cloned().unwrap_or(Value::from(0)),
                "barcode": product.get("barcode").cloned().unwrap_or(Value::Null),
                "sku": product.get("sku").cloned().unwrap_or(Value::Null),
            }));
        }

        variants_seen += variants.len() as u32;

        let mut name = if base_name.is_empty() {
            format!("Producto TN {tn_product_id}")
        } else {
            base_name.clone()
        };
        if !tags.is_empty() {
            let first_tag = tags
                .split(',')
                .map(|t| t.trim())
                .find(|t| !t.is_empty())
                .unwrap_or("");
            if !first_tag.is_empty() && !name.to_lowercase().contains(&first_tag.to_lowercase()) {
                name = format!("{name} [{first_tag}]");
            }
        }

        let multi = variants.len() > 1
            || variants.iter().any(variant_has_real_options)
            || !attribute_names(product).is_empty();

        let result = if multi {
            upsert_parent_with_variants(
                &conn,
                tn_product_id,
                &name,
                &variants,
                product,
                free_limited,
                &mut free_count,
                &mut pulled,
            )
        } else {
            let variant = &variants[0];
            let tn_variant_id = match json_i64(variant.get("id")) {
                Some(id) => id,
                None => {
                    skipped += 1;
                    continue;
                }
            };
            let label = variant_label(variant);
            let flat_name = if label.is_empty() {
                name.clone()
            } else {
                format!("{name} — {label}")
            };
            let barcode = variant
                .get("barcode")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            let sku = variant
                .get("sku")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            upsert_flat_product(
                &conn,
                tn_product_id,
                tn_variant_id,
                &base_name,
                &flat_name,
                barcode.as_deref(),
                sku.as_deref(),
                json_f64(variant.get("price")),
                json_f64(variant.get("cost")),
                json_stock_opt(variant.get("stock")),
                free_limited,
                &mut free_count,
                &mut pulled,
            )
        };

        match result {
            Ok("inserted") => inserted += 1,
            Ok("updated") => updated += 1,
            Ok("skipped") => skipped += 1,
            Ok(_) => skipped += 1,
            Err(e) => errors.push(format!("{name}: {e}")),
        }
    }

    if let Some(total) = api_total {
        if (products_seen as u64) < total {
            errors.push(format!(
                "TN reportó {total} productos y se leyeron {products_seen}. Reintentá importar."
            ));
        }
    }

    let _ = rebuild_products_fts(&conn);
    let now = chrono_now();
    write_setting(&conn, "tn_last_import_at", &now)?;

    Ok((
        TnImportResult {
            inserted,
            updated,
            skipped,
            pages,
            products_seen,
            variants_seen,
            errors,
        },
        pulled,
    ))
}

pub fn import_products_from_tn() -> Result<TnImportResult, String> {
    let result = {
        let _guard = TN_JOB.lock().unwrap_or_else(|p| p.into_inner());
        import_catalog().map(|(result, _)| result)?
    };
    let _ = flush_stock_outbox();
    Ok(result)
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // ISO-ish UTC for settings; enough for display
    format!("{secs}")
}

fn iso_now_approx() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    fallback_iso(secs)
}

fn fallback_iso(secs: u64) -> String {
    let days = secs / 86400;
    let rem = secs % 86400;
    let hour = rem / 3600;
    let min = (rem % 3600) / 60;
    let sec = rem % 60;
    let (y, m, d) = civil_from_days(days as i64);
    format!("{y:04}-{m:02}-{d:02}T{hour:02}:{min:02}:{sec:02}Z")
}

/// Howard Hinnant civil_from_days
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m as u32, d as u32)
}

pub fn enqueue_stock_push(product_id: i64) -> Result<(), String> {
    DbManager::with_connection(|conn| enqueue_stock_push_inner(conn, product_id))?;
    thread::spawn(|| {
        let _ = flush_stock_outbox();
    });
    Ok(())
}

fn enqueue_stock_push_inner(conn: &Connection, product_id: i64) -> Result<(), String> {
    if !read_setting_flag(conn, "tn_enabled") && !read_setting_flag(conn, "tn_oauth_connected") {
        return Ok(());
    }
    let raw = read_setting(conn, "tn_sync_stock");
    if raw.as_deref() == Some("0") {
        return Ok(());
    }

    // Producto plano (1 variante TN)
    let flat: Option<(i64, i64, f64)> = conn
        .query_row(
            "SELECT tn_product_id, tn_variant_id, stock FROM products
             WHERE id = ?1 AND tn_variant_id IS NOT NULL AND tn_product_id IS NOT NULL
               AND IFNULL(has_variants,0) = 0",
            [product_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((tn_product_id, tn_variant_id, stock)) = flat {
        bump_stock_epoch(conn);
        conn.execute(
            "INSERT INTO tn_stock_outbox (product_id, tn_product_id, tn_variant_id, stock)
             VALUES (?1,?2,?3,?4)",
            params![product_id, tn_product_id, tn_variant_id, stock],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Padre con variantes (ropa/calzado)
    let tn_product_id: Option<i64> = conn
        .query_row(
            "SELECT tn_product_id FROM products
             WHERE id = ?1 AND tn_product_id IS NOT NULL AND IFNULL(has_variants,0) = 1",
            [product_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(tn_product_id) = tn_product_id else {
        return Ok(());
    };

    let mut stmt = conn
        .prepare(
            "SELECT tn_variant_id, stock FROM product_variants
             WHERE product_id = ?1 AND tn_variant_id IS NOT NULL",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, f64)> = stmt
        .query_map([product_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    if !rows.is_empty() {
        bump_stock_epoch(conn);
    }
    for (tn_variant_id, stock) in rows {
        conn.execute(
            "INSERT INTO tn_stock_outbox (product_id, tn_product_id, tn_variant_id, stock)
             VALUES (?1,?2,?3,?4)",
            params![product_id, tn_product_id, tn_variant_id, stock],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn push_variant_stock(
    store_id: &str,
    token: &str,
    tn_product_id: i64,
    tn_variant_id: i64,
    stock: f64,
) -> Result<(), String> {
    let value = if stock < 0.0 {
        0
    } else {
        stock.round() as i64
    };
    let path = format!("/products/{tn_product_id}/variants/stock");
    let body = json!({
        "action": "replace",
        "value": value,
        "id": tn_variant_id,
    });
    tn_request(
        reqwest::Method::POST,
        store_id,
        token,
        &path,
        Some(body),
    )?;
    Ok(())
}

pub fn flush_stock_outbox() -> Result<TnPushStockResult, String> {
    let conn = open_exclusive()?;
    let (store_id, token) = match credentials(&conn) {
        Ok(c) => c,
        Err(_) => {
            return Ok(TnPushStockResult {
                pushed: 0,
                failed: 0,
                errors: vec![],
            });
        }
    };

    let rows: Vec<(i64, i64, i64, i64, f64)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, product_id, tn_product_id, tn_variant_id, stock
                 FROM tn_stock_outbox
                 ORDER BY id ASC
                 LIMIT 80",
            )
            .map_err(|e| e.to_string())?;
        let mapped: Vec<(i64, i64, i64, i64, f64)> = stmt
            .query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        mapped
    };

    // Último stock por variante; acumular ids de outbox a borrar.
    let mut latest: std::collections::HashMap<i64, (i64, i64, f64)> =
        std::collections::HashMap::new();
    let mut ids_by_variant: std::collections::HashMap<i64, Vec<i64>> =
        std::collections::HashMap::new();
    for (id, _product_id, tn_product_id, tn_variant_id, stock) in rows {
        latest.insert(tn_variant_id, (tn_product_id, tn_variant_id, stock));
        ids_by_variant
            .entry(tn_variant_id)
            .or_default()
            .push(id);
    }

    let mut pushed = 0u32;
    let mut failed = 0u32;
    let mut errors = Vec::new();

    for (tn_variant_id, (tn_product_id, _, stock)) in &latest {
        match push_variant_stock(&store_id, &token, *tn_product_id, *tn_variant_id, *stock) {
            Ok(()) => {
                pushed += 1;
                if let Some(ids) = ids_by_variant.get(tn_variant_id) {
                    for id in ids {
                        let _ = conn.execute("DELETE FROM tn_stock_outbox WHERE id = ?1", [id]);
                    }
                }
            }
            Err(e) => {
                failed += 1;
                errors.push(format!("variante {tn_variant_id}: {e}"));
                if let Some(ids) = ids_by_variant.get(tn_variant_id) {
                    for id in ids {
                        let _ = conn.execute(
                            "UPDATE tn_stock_outbox SET attempts = attempts + 1, last_error = ?1 WHERE id = ?2",
                            params![e, id],
                        );
                    }
                }
            }
        }
    }

    let _ = conn.execute("DELETE FROM tn_stock_outbox WHERE attempts > 12", []);

    Ok(TnPushStockResult {
        pushed,
        failed,
        errors,
    })
}

pub fn sync_paid_orders_from_tn() -> Result<TnOrderSyncResult, String> {
    sync_paid_orders_inner(&HashSet::new())
}

fn sync_paid_orders_inner(pulled: &HashSet<i64>) -> Result<TnOrderSyncResult, String> {
    let conn = open_exclusive()?;
    let (store_id, token) = credentials(&conn)?;

    let last = read_setting_or(&conn, "tn_last_order_sync_iso", "");
    let since = if last.trim().is_empty() {
        // últimos 3 días
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
            .saturating_sub(3 * 86400);
        fallback_iso(secs)
    } else {
        last
    };

    let path = format!(
        "/orders?payment_status=paid&per_page=50&page=1&created_at_min={}",
        urlencoding::encode(&since)
    );
    let body = tn_get(&store_id, &token, &path)?;
    let orders = body.as_array().cloned().unwrap_or_default();

    let mut orders_processed = 0u32;
    let mut stock_deducted = 0u32;
    let mut skipped = 0u32;
    let mut retry_later = false;
    let mut errors = Vec::new();

    for order in orders {
        let order_id = match json_i64(order.get("id")) {
            Some(id) => id,
            None => {
                skipped += 1;
                continue;
            }
        };

        let already: bool = conn
            .query_row(
                "SELECT 1 FROM tn_synced_orders WHERE tn_order_id = ?1",
                [order_id],
                |_| Ok(true),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or(false);
        if already {
            skipped += 1;
            continue;
        }

        let products = order
            .get("products")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut ok = true;
        let mut matched = 0u32;
        let mut unmatched = 0u32;
        for line in &products {
            let variant_id = json_i64(line.get("variant_id"));
            let qty = json_f64(line.get("quantity"));
            if qty <= 0.0 {
                continue;
            }
            let Some(variant_id) = variant_id else {
                continue;
            };
            if pulled.contains(&variant_id) {
                matched += 1;
                continue;
            }
            let local_flat: Option<(i64, bool)> = conn
                .query_row(
                    "SELECT id, IFNULL(has_variants,0) FROM products
                     WHERE tn_variant_id = ?1 AND active = 1 LIMIT 1",
                    [variant_id],
                    |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)? != 0)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let local_child: Option<(i64, i64)> = if local_flat.is_none() {
                conn.query_row(
                    "SELECT pv.product_id, pv.id FROM product_variants pv
                     JOIN products p ON p.id = pv.product_id
                     WHERE pv.tn_variant_id = ?1 AND p.active = 1 LIMIT 1",
                    [variant_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?
            } else {
                None
            };

            if let Some((product_id, _)) = local_flat {
                if let Err(e) = conn.execute(
                    "UPDATE products SET stock = stock - ?1, updated_at = datetime('now') WHERE id = ?2",
                    params![qty, product_id],
                ) {
                    errors.push(format!("orden {order_id}: {e}"));
                    ok = false;
                    break;
                }
                let sync_id = Uuid::new_v4().simple().to_string();
                let _ = conn.execute(
                    "INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, sync_id)
                     VALUES (?1, 'sale', ?2, 'tiendanube_order', ?3, ?4)",
                    params![product_id, -qty, order_id, sync_id],
                );
                stock_deducted += 1;
                matched += 1;
                let _ = enqueue_stock_push_inner(&conn, product_id);
            } else if let Some((product_id, local_variant_id)) = local_child {
                if let Err(e) = conn.execute(
                    "UPDATE product_variants SET stock = stock - ?1 WHERE id = ?2",
                    params![qty, local_variant_id],
                ) {
                    errors.push(format!("orden {order_id}: {e}"));
                    ok = false;
                    break;
                }
                let _ = conn.execute(
                    "UPDATE products SET stock = stock - ?1, updated_at = datetime('now') WHERE id = ?2",
                    params![qty, product_id],
                );
                let sync_id = Uuid::new_v4().simple().to_string();
                let _ = conn.execute(
                    "INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, sync_id)
                     VALUES (?1, 'sale', ?2, 'tiendanube_order', ?3, ?4)",
                    params![product_id, -qty, order_id, sync_id],
                );
                stock_deducted += 1;
                matched += 1;
                let _ = enqueue_stock_push_inner(&conn, product_id);
            } else {
                unmatched += 1;
            }
        }

        if ok && (unmatched == 0 || matched > 0) {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO tn_synced_orders (tn_order_id) VALUES (?1)",
                [order_id],
            );
            orders_processed += 1;
        } else if unmatched > 0 {
            skipped += 1;
            retry_later = true;
        }
    }

    if !retry_later {
        write_setting(&conn, "tn_last_order_sync_iso", &iso_now_approx())?;
    }
    write_setting(&conn, "tn_last_order_sync_at", &chrono_now())?;

    Ok(TnOrderSyncResult {
        orders_processed,
        stock_deducted,
        skipped,
        errors,
    })
}

#[tauri::command]
pub fn get_tn_config_status() -> Result<TnConfigStatus, String> {
    let conn = open_exclusive()?;
    let connected = {
        let sid = read_setting_or(&conn, "tn_store_id", "");
        let tok = read_setting_or(&conn, "tn_access_token", "");
        !sid.trim().is_empty() && !tok.trim().is_empty()
    };
    let mapped: u32 = conn
        .query_row(
            "SELECT
                (SELECT COUNT(*) FROM products WHERE active = 1 AND tn_variant_id IS NOT NULL)
              + (SELECT COUNT(*) FROM product_variants pv
                 JOIN products p ON p.id = pv.product_id
                 WHERE p.active = 1 AND pv.tn_variant_id IS NOT NULL)",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let outbox: u32 = conn
        .query_row("SELECT COUNT(*) FROM tn_stock_outbox", [], |r| r.get(0))
        .unwrap_or(0);

    let sync_stock = read_setting(&conn, "tn_sync_stock")
        .map(|v| v != "0")
        .unwrap_or(true);

    let install_url = crate::tn_app_credentials::load_tn_app_config().map(|c| {
        format!("https://www.tiendanube.com/apps/{}/authorize", c.client_id.trim())
    });

    Ok(TnConfigStatus {
        enabled: read_setting_flag(&conn, "tn_enabled") || connected,
        connected,
        oauth_available: tn_oauth_available(),
        sync_stock,
        store_id: read_setting(&conn, "tn_store_id").filter(|s| !s.is_empty()),
        store_name: read_setting(&conn, "tn_store_name").filter(|s| !s.is_empty()),
        last_import_at: read_setting(&conn, "tn_last_import_at").filter(|s| !s.is_empty()),
        last_order_sync_at: read_setting(&conn, "tn_last_order_sync_at").filter(|s| !s.is_empty()),
        mapped_products: mapped,
        outbox_pending: outbox,
        install_url,
    })
}

#[tauri::command]
pub fn set_tn_sync_stock(enabled: bool) -> Result<(), String> {
    let conn = open_exclusive()?;
    write_setting_flag(&conn, "tn_sync_stock", enabled)
}

#[tauri::command]
pub async fn tn_import_products() -> Result<TnImportResult, String> {
    tauri::async_runtime::spawn_blocking(import_products_from_tn)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn tn_sync_orders() -> Result<TnOrderSyncResult, String> {
    tauri::async_runtime::spawn_blocking(sync_paid_orders_from_tn)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn tn_flush_stock() -> Result<TnPushStockResult, String> {
    tauri::async_runtime::spawn_blocking(flush_stock_outbox)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn tn_enqueue_stock_push(product_id: i64) -> Result<(), String> {
    enqueue_stock_push(product_id)
}

fn tn_background_allowed() -> bool {
    open_exclusive()
        .ok()
        .map(|c| {
            let sid = read_setting_or(&c, "tn_store_id", "");
            let tok = read_setting_or(&c, "tn_access_token", "");
            if sid.trim().is_empty() || tok.trim().is_empty() {
                return false;
            }
            read_setting(&c, "tn_sync_stock").as_deref() != Some("0")
        })
        .unwrap_or(false)
}

/// Cada ciclo: trae productos y stock de Tienda Nube, manda el stock local y baja ventas online.
pub fn spawn_tiendanube_worker(interval_secs: u64) {
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(5));
        loop {
            if tn_background_allowed() {
                let pulled = {
                    let _guard = TN_JOB.lock().unwrap_or_else(|p| p.into_inner());
                    import_catalog()
                        .map(|(_, ids)| ids)
                        .unwrap_or_default()
                };
                let _ = flush_stock_outbox();
                {
                    let _guard = TN_JOB.lock().unwrap_or_else(|p| p.into_inner());
                    let _ = sync_paid_orders_inner(&pulled);
                }
            }
            thread::sleep(Duration::from_secs(interval_secs));
        }
    });
}
