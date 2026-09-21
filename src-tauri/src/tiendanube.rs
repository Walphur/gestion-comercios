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
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use std::thread;
use std::time::Duration;
use uuid::Uuid;

const API_VERSION: &str = "2025-03";
const USER_AGENT: &str = "WalQo (juank.gagliano@gmail.com)";
const FREE_PLAN_PRODUCT_LIMIT: u32 = 25;

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
    let url = format!("{}{}", api_base(store_id), path);
    let client = http_client()?;
    let response = client
        .get(&url)
        .header("Authentication", format!("bearer {token}"))
        .header("Authorization", format!("bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .send()
        .map_err(|e| format!("Sin conexión con Tienda Nube: {e}"))?;
    let status = response.status();
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
    Ok(body)
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
        .header("Authorization", format!("bearer {token}"))
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

fn find_product_id(
    conn: &Connection,
    tn_product_id: i64,
    tn_variant_id: i64,
    barcode: Option<&str>,
    sku: Option<&str>,
) -> Result<Option<i64>, String> {
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM products WHERE tn_variant_id = ?1 LIMIT 1",
            [tn_variant_id],
            |r| r.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
    {
        return Ok(Some(id));
    }

    if let Some(bc) = barcode.filter(|s| !s.is_empty()) {
        if let Some(id) = conn
            .query_row(
                "SELECT id FROM products WHERE barcode = ?1 COLLATE NOCASE AND active = 1 LIMIT 1",
                [bc],
                |r| r.get::<_, i64>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            return Ok(Some(id));
        }
        if let Some(id) = conn
            .query_row(
                "SELECT product_id FROM product_barcodes WHERE barcode = ?1 COLLATE NOCASE LIMIT 1",
                [bc],
                |r| r.get::<_, i64>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            return Ok(Some(id));
        }
    }

    if let Some(sku) = sku.filter(|s| !s.is_empty()) {
        if let Some(id) = conn
            .query_row(
                "SELECT id FROM products WHERE sku = ?1 COLLATE NOCASE AND active = 1 LIMIT 1",
                [sku],
                |r| r.get::<_, i64>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            return Ok(Some(id));
        }
    }

    // Evitar match ambiguo solo por product_id TN sin variante.
    let _ = tn_product_id;
    Ok(None)
}

fn upsert_variant_product(
    conn: &Connection,
    tn_product_id: i64,
    tn_variant_id: i64,
    name: &str,
    barcode: Option<&str>,
    sku: Option<&str>,
    price: f64,
    stock: f64,
    free_limited: bool,
    free_count: &mut u32,
) -> Result<&'static str, String> {
    if let Some(id) = find_product_id(conn, tn_product_id, tn_variant_id, barcode, sku)? {
        conn.execute(
            "UPDATE products SET
                name = ?1,
                price = ?2,
                stock = ?3,
                sku = COALESCE(?4, sku),
                barcode = COALESCE(?5, barcode),
                tn_product_id = ?6,
                tn_variant_id = ?7,
                catalog_source = 'tiendanube',
                updated_at = datetime('now'),
                active = 1
             WHERE id = ?8",
            params![
                name,
                price,
                stock,
                sku,
                barcode,
                tn_product_id,
                tn_variant_id,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        return Ok("updated");
    }

    if free_limited && *free_count >= FREE_PLAN_PRODUCT_LIMIT {
        return Ok("skipped");
    }

    conn.execute(
        "INSERT INTO products (
            sku, barcode, name, cost, price, stock, min_stock, unit, tax_rate,
            catalog_source, tn_product_id, tn_variant_id, sync_id, active
         ) VALUES (?1,?2,?3,0,?4,?5,0,'unidad',21,'tiendanube',?6,?7, lower(hex(randomblob(16))), 1)",
        params![
            sku,
            barcode,
            name,
            price,
            stock,
            tn_product_id,
            tn_variant_id
        ],
    )
    .map_err(|e| e.to_string())?;
    *free_count += 1;
    Ok("inserted")
}

pub fn import_products_from_tn() -> Result<TnImportResult, String> {
    let conn = open_exclusive()?;
    if !read_setting_flag(&conn, "tn_enabled") && !read_setting_flag(&conn, "tn_oauth_connected") {
        // permitir si hay credenciales aunque enabled esté off
        let _ = credentials(&conn)?;
    }
    let (store_id, token) = credentials(&conn)?;
    let (free_limited, mut free_count) = free_plan_limit(&conn)?;

    let mut inserted = 0u32;
    let mut updated = 0u32;
    let mut skipped = 0u32;
    let mut errors = Vec::new();
    let mut page = 1u32;

    loop {
        let path = format!("/products?page={page}&per_page=50");
        let body = match tn_get(&store_id, &token, &path) {
            Ok(b) => b,
            Err(e) => {
                errors.push(format!("Página {page}: {e}"));
                break;
            }
        };
        let products = match body.as_array() {
            Some(arr) if !arr.is_empty() => arr,
            Some(_) => break,
            None => {
                errors.push("La API no devolvió una lista de productos.".into());
                break;
            }
        };

        for product in products {
            let tn_product_id = match json_i64(product.get("id")) {
                Some(id) => id,
                None => {
                    skipped += 1;
                    continue;
                }
            };
            let base_name = localized_str(product.get("name").unwrap_or(&Value::Null));
            let variants = product
                .get("variants")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            if variants.is_empty() {
                skipped += 1;
                continue;
            }

            for variant in &variants {
                let tn_variant_id = match json_i64(variant.get("id")) {
                    Some(id) => id,
                    None => {
                        skipped += 1;
                        continue;
                    }
                };
                let label = variant_label(variant);
                let name = if label.is_empty() || variants.len() == 1 {
                    if base_name.is_empty() {
                        format!("Producto TN {tn_product_id}")
                    } else {
                        base_name.clone()
                    }
                } else {
                    format!("{base_name} — {label}")
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
                let price = json_f64(variant.get("price"));
                let stock = json_f64(variant.get("stock"));

                match upsert_variant_product(
                    &conn,
                    tn_product_id,
                    tn_variant_id,
                    &name,
                    barcode.as_deref(),
                    sku.as_deref(),
                    price,
                    stock,
                    free_limited,
                    &mut free_count,
                ) {
                    Ok("inserted") => inserted += 1,
                    Ok("updated") => updated += 1,
                    Ok("skipped") => skipped += 1,
                    Ok(_) => skipped += 1,
                    Err(e) => errors.push(format!("{name}: {e}")),
                }
            }
        }

        if products.len() < 50 {
            break;
        }
        page += 1;
        if page > 200 {
            errors.push("Se alcanzó el límite de páginas de importación.".into());
            break;
        }
    }

    let _ = rebuild_products_fts(&conn);
    let now = chrono_now();
    write_setting(&conn, "tn_last_import_at", &now)?;

    Ok(TnImportResult {
        inserted,
        updated,
        skipped,
        errors,
    })
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
    DbManager::with_connection(|conn| {
        if !read_setting_flag(conn, "tn_enabled") && !read_setting_flag(conn, "tn_oauth_connected")
        {
            return Ok(());
        }
        if !read_setting_flag(conn, "tn_sync_stock") {
            // default on if key missing
            let raw = read_setting(conn, "tn_sync_stock");
            if raw.as_deref() == Some("0") {
                return Ok(());
            }
        }
        let row: Option<(i64, i64, f64)> = conn
            .query_row(
                "SELECT tn_product_id, tn_variant_id, stock FROM products
                 WHERE id = ?1 AND tn_variant_id IS NOT NULL AND tn_product_id IS NOT NULL",
                [product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((tn_product_id, tn_variant_id, stock)) = row else {
            return Ok(());
        };
        conn.execute(
            "INSERT INTO tn_stock_outbox (product_id, tn_product_id, tn_variant_id, stock)
             VALUES (?1,?2,?3,?4)",
            params![product_id, tn_product_id, tn_variant_id, stock],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    // Fire-and-forget flush
    thread::spawn(|| {
        let _ = flush_stock_outbox();
    });
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
        for line in &products {
            let variant_id = json_i64(line.get("variant_id"));
            let qty = json_f64(line.get("quantity"));
            if qty <= 0.0 {
                continue;
            }
            let Some(variant_id) = variant_id else {
                continue;
            };
            let local: Option<(i64, f64)> = conn
                .query_row(
                    "SELECT id, stock FROM products WHERE tn_variant_id = ?1 AND active = 1 LIMIT 1",
                    [variant_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let Some((product_id, _stock)) = local else {
                continue;
            };

            if let Err(e) = conn.execute(
                "UPDATE products SET stock = stock - ?1, updated_at = datetime('now') WHERE id = ?2",
                params![qty, product_id],
            ) {
                errors.push(format!("orden {order_id}: {e}"));
                ok = false;
                break;
            }
            let sync_id = Uuid::new_v4().simple().to_string();
            if let Err(e) = conn.execute(
                "INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, sync_id)
                 VALUES (?1, 'sale', ?2, 'tiendanube_order', ?3, ?4)",
                params![product_id, -qty, order_id, sync_id],
            ) {
                errors.push(format!("orden {order_id} movimiento: {e}"));
                ok = false;
                break;
            }
            stock_deducted += 1;
            // Re-enqueue push so TN mirrors after local deduct (idempotent replace)
            let _ = enqueue_stock_push_inner(&conn, product_id);
        }

        if ok {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO tn_synced_orders (tn_order_id) VALUES (?1)",
                [order_id],
            );
            orders_processed += 1;
        }
    }

    write_setting(&conn, "tn_last_order_sync_iso", &iso_now_approx())?;
    write_setting(&conn, "tn_last_order_sync_at", &chrono_now())?;

    Ok(TnOrderSyncResult {
        orders_processed,
        stock_deducted,
        skipped,
        errors,
    })
}

fn enqueue_stock_push_inner(conn: &Connection, product_id: i64) -> Result<(), String> {
    let row: Option<(i64, i64, f64)> = conn
        .query_row(
            "SELECT tn_product_id, tn_variant_id, stock FROM products
             WHERE id = ?1 AND tn_variant_id IS NOT NULL AND tn_product_id IS NOT NULL",
            [product_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((tn_product_id, tn_variant_id, stock)) = row else {
        return Ok(());
    };
    conn.execute(
        "INSERT INTO tn_stock_outbox (product_id, tn_product_id, tn_variant_id, stock)
         VALUES (?1,?2,?3,?4)",
        params![product_id, tn_product_id, tn_variant_id, stock],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
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
            "SELECT COUNT(*) FROM products WHERE tn_variant_id IS NOT NULL AND active = 1",
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

/// Worker liviano: vacía outbox y tira de órdenes pagadas cada N segundos.
pub fn spawn_tiendanube_worker(interval_secs: u64) {
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_secs(interval_secs));
            let connected = open_exclusive()
                .ok()
                .map(|c| {
                    let sid = read_setting_or(&c, "tn_store_id", "");
                    let tok = read_setting_or(&c, "tn_access_token", "");
                    !sid.trim().is_empty() && !tok.trim().is_empty()
                })
                .unwrap_or(false);
            if !connected {
                continue;
            }
            let _ = flush_stock_outbox();
            let _ = sync_paid_orders_from_tn();
        }
    });
}
