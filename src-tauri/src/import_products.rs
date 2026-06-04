use crate::db_path::get_db_path;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::path::Path;

#[derive(Serialize, Clone)]
pub struct ImportProductsResult {
    pub inserted: u32,
    pub updated: u32,
    pub skipped: u32,
    pub errors: Vec<String>,
}

struct RowData {
    barcode: Option<String>,
    sku: Option<String>,
    name: String,
    description: Option<String>,
    price: f64,
    cost: f64,
    stock: f64,
    min_stock: f64,
    category: Option<String>,
    brand: Option<String>,
    supplier: Option<String>,
    unit: String,
    tax_rate: f64,
}

fn build_category_and_description(
    record: &csv::StringRecord,
    idx_cat: Option<usize>,
    idx_cat1: Option<usize>,
    idx_cat2: Option<usize>,
    idx_cat3: Option<usize>,
) -> (Option<String>, Option<String>) {
    let c1 = idx_cat1.map(|i| cell(record, Some(i))).unwrap_or_default();
    let c2 = idx_cat2.map(|i| cell(record, Some(i))).unwrap_or_default();
    let c3 = idx_cat3.map(|i| cell(record, Some(i))).unwrap_or_default();
    let single = idx_cat.map(|i| cell(record, Some(i))).unwrap_or_default();

    let primary = if !c1.is_empty() {
        c1
    } else if !single.is_empty() {
        single
    } else {
        String::new()
    };

    let category = if primary.is_empty() {
        None
    } else {
        Some(primary)
    };

    let sub: Vec<String> = [c2, c3]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect();
    let description = if sub.is_empty() {
        None
    } else {
        Some(sub.join(" / "))
    };

    (category, description)
}

fn normalize_header(h: &str) -> String {
    h.trim()
        .to_lowercase()
        .replace([' ', '-', '.'], "_")
}

fn parse_f64(s: &str) -> f64 {
    let t = s.trim().replace(',', ".");
    t.parse().unwrap_or(0.0)
}

fn field_index(headers: &HashMap<String, usize>, aliases: &[&str]) -> Option<usize> {
    for a in aliases {
        if let Some(&i) = headers.get(*a) {
            return Some(i);
        }
    }
    None
}

fn cell(record: &csv::StringRecord, idx: Option<usize>) -> String {
    idx.and_then(|i| record.get(i))
        .unwrap_or("")
        .trim()
        .to_string()
}

pub struct ImportCsvOptions {
    pub update_existing: bool,
    /// Si está definido, solo importa filas cuya categoría principal (cat1) está en el set (minúsculas).
    pub categories_filter: Option<HashSet<String>>,
    /// Ej. `supermarket` para poder borrar el catálogo masivo después.
    pub catalog_source: Option<String>,
}

pub fn import_products_csv(file_path: &str, options: ImportCsvOptions) -> Result<ImportProductsResult, String> {
    let update_existing = options.update_existing;
    let categories_filter = options.categories_filter;
    let catalog_source = options.catalog_source;
    let path = Path::new(file_path);
    if !path.exists() {
        return Err("El archivo no existe.".into());
    }

    let db_path = get_db_path()?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-64000;",
    )
    .map_err(|e| e.to_string())?;
    let mut result = ImportProductsResult {
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: vec![],
    };

    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(file);

    let headers_raw = rdr.headers().map_err(|e| e.to_string())?.clone();
    let mut headers: HashMap<String, usize> = HashMap::new();
    for (i, h) in headers_raw.iter().enumerate() {
        headers.insert(normalize_header(h), i);
    }

    let idx_name = field_index(
        &headers,
        &["name", "nombre", "descripcion", "producto", "articulo"],
    );
    let idx_barcode = field_index(
        &headers,
        &["barcode", "codigo", "codigo_barras", "ean", "barra"],
    );
    let idx_sku = field_index(&headers, &["sku", "codigo_interno"]);
    let idx_price = field_index(&headers, &["price", "precio", "precio_venta"]);
    let idx_cost = field_index(&headers, &["cost", "costo"]);
    let idx_stock = field_index(&headers, &["stock", "cantidad", "existencia"]);
    let idx_min = field_index(&headers, &["min_stock", "stock_minimo", "minimo"]);
    let idx_cat = field_index(&headers, &["category", "categoria", "rubro"]);
    let idx_cat1 = field_index(&headers, &["cat1", "categoria_1", "rubro_1"]);
    let idx_cat2 = field_index(&headers, &["cat2", "categoria_2", "rubro_2"]);
    let idx_cat3 = field_index(&headers, &["cat3", "categoria_3", "rubro_3"]);
    let idx_brand = field_index(&headers, &["brand", "marca"]);
    let idx_sup = field_index(&headers, &["supplier", "proveedor"]);
    let idx_unit = field_index(&headers, &["unit", "unidad"]);
    let idx_tax = field_index(&headers, &["tax_rate", "iva", "alicuota"]);

    if idx_name.is_none() && idx_barcode.is_none() && idx_sku.is_none() {
        return Err(
            "El CSV debe tener columnas como: nombre, barcode/codigo o sku.".into(),
        );
    }

    let mut batch: Vec<RowData> = Vec::with_capacity(2000);

    for (line_no, record) in rdr.records().enumerate() {
        let row_num = line_no + 2;
        let record = match record {
            Ok(r) => r,
            Err(e) => {
                if result.errors.len() < 50 {
                    result.errors.push(format!("Fila {row_num}: {e}"));
                }
                continue;
            }
        };

        let name = if let Some(i) = idx_name {
            cell(&record, Some(i))
        } else {
            String::new()
        };
        let barcode = idx_barcode
            .map(|i| cell(&record, Some(i)))
            .filter(|s| !s.is_empty());
        let sku = idx_sku
            .map(|i| cell(&record, Some(i)))
            .filter(|s| !s.is_empty());

        let display_name = if !name.is_empty() {
            name
        } else if let Some(ref b) = barcode {
            format!("Producto {b}")
        } else if let Some(ref s) = sku {
            format!("Producto {s}")
        } else {
            result.skipped += 1;
            continue;
        };

        let (category, description) =
            build_category_and_description(&record, idx_cat, idx_cat1, idx_cat2, idx_cat3);

        if let Some(ref filter) = categories_filter {
            let key = category
                .as_deref()
                .unwrap_or("")
                .trim()
                .to_lowercase();
            if key.is_empty() || !filter.contains(&key) {
                result.skipped += 1;
                continue;
            }
        }

        let row = RowData {
            barcode: barcode.clone(),
            sku,
            name: display_name,
            description,
            price: idx_price.map(|i| parse_f64(&cell(&record, Some(i)))).unwrap_or(0.0),
            cost: idx_cost.map(|i| parse_f64(&cell(&record, Some(i)))).unwrap_or(0.0),
            stock: idx_stock.map(|i| parse_f64(&cell(&record, Some(i)))).unwrap_or(0.0),
            min_stock: idx_min.map(|i| parse_f64(&cell(&record, Some(i)))).unwrap_or(0.0),
            category,
            brand: idx_brand
                .map(|i| cell(&record, Some(i)))
                .filter(|s| !s.is_empty()),
            supplier: idx_sup
                .map(|i| cell(&record, Some(i)))
                .filter(|s| !s.is_empty()),
            unit: idx_unit
                .map(|i| cell(&record, Some(i)))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "unidad".into()),
            tax_rate: idx_tax
                .map(|i| parse_f64(&cell(&record, Some(i))))
                .unwrap_or(21.0),
        };

        batch.push(row);
        if batch.len() >= 2000 {
            flush_batch(
                &mut conn,
                &mut batch,
                update_existing,
                catalog_source.as_deref(),
                &mut result,
            )?;
        }
    }

    if !batch.is_empty() {
        flush_batch(
            &mut conn,
            &mut batch,
            update_existing,
            catalog_source.as_deref(),
            &mut result,
        )?;
    }

    let _ = crate::product_search::rebuild_products_fts(&conn);

    Ok(result)
}

fn lookup_or_create(conn: &Connection, table: &str, name: &str) -> Result<i64, String> {
    conn.execute(
        &format!("INSERT OR IGNORE INTO {table} (name) VALUES (?1)"),
        params![name],
    )
    .map_err(|e| e.to_string())?;
    let id: i64 = conn
        .query_row(
            &format!("SELECT id FROM {table} WHERE name = ?1"),
            params![name],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(id)
}

fn find_existing_id(conn: &Connection, barcode: &Option<String>, sku: &Option<String>) -> Option<i64> {
    if let Some(b) = barcode {
        if let Ok(id) = conn.query_row(
            "SELECT product_id FROM product_barcodes WHERE barcode = ?1 LIMIT 1",
            params![b],
            |r| r.get::<_, i64>(0),
        ) {
            return Some(id);
        }
        if let Ok(id) = conn.query_row(
            "SELECT id FROM products WHERE barcode = ?1 AND active = 1 LIMIT 1",
            params![b],
            |r| r.get(0),
        ) {
            return Some(id);
        }
    }
    if let Some(s) = sku {
        if let Ok(id) = conn.query_row(
            "SELECT id FROM products WHERE sku = ?1 AND active = 1 LIMIT 1",
            params![s],
            |r| r.get(0),
        ) {
            return Some(id);
        }
    }
    None
}

/// Lista categorías principales (cat1) del CSV de supermercado con cantidad de filas.
pub fn list_csv_primary_categories(file_path: &str) -> Result<Vec<(String, u32)>, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err("El archivo no existe.".into());
    }
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(file);
    let headers_raw = rdr.headers().map_err(|e| e.to_string())?.clone();
    let mut headers: HashMap<String, usize> = HashMap::new();
    for (i, h) in headers_raw.iter().enumerate() {
        headers.insert(normalize_header(h), i);
    }
    let idx_cat = field_index(&headers, &["category", "categoria", "rubro"]);
    let idx_cat1 = field_index(&headers, &["cat1", "categoria_1", "rubro_1"]);
    let idx_cat2 = field_index(&headers, &["cat2", "categoria_2", "rubro_2"]);
    let idx_cat3 = field_index(&headers, &["cat3", "categoria_3", "rubro_3"]);

    let mut counts: HashMap<String, u32> = HashMap::new();
    for record in rdr.records() {
        let record = record.map_err(|e| e.to_string())?;
        let (category, _) =
            build_category_and_description(&record, idx_cat, idx_cat1, idx_cat2, idx_cat3);
        if let Some(c) = category {
            let key = c.trim().to_string();
            if !key.is_empty() {
                *counts.entry(key).or_insert(0) += 1;
            }
        }
    }
    let mut list: Vec<(String, u32)> = counts.into_iter().collect();
    list.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    Ok(list)
}

fn flush_batch(
    conn: &mut Connection,
    batch: &mut Vec<RowData>,
    update_existing: bool,
    catalog_source: Option<&str>,
    result: &mut ImportProductsResult,
) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for row in batch.drain(..) {
        let cat_id = match &row.category {
            Some(c) => Some(lookup_or_create(&tx, "categories", c)?),
            None => None,
        };
        let brand_id = match &row.brand {
            Some(b) => Some(lookup_or_create(&tx, "brands", b)?),
            None => None,
        };
        let supplier_id = match &row.supplier {
            Some(s) => Some(lookup_or_create(&tx, "suppliers", s)?),
            None => None,
        };

        if let Some(id) = find_existing_id(&tx, &row.barcode, &row.sku) {
            if update_existing {
                tx.execute(
                    "UPDATE products SET name=?1, description=?2, cost=?3, price=?4, stock=?5,
                     min_stock=?6, category_id=?7, brand_id=?8, supplier_id=?9, unit=?10, tax_rate=?11,
                     sku=COALESCE(?12, sku), barcode=COALESCE(?13, barcode),
                     catalog_source=COALESCE(?14, catalog_source),
                     updated_at=datetime('now','localtime')
                     WHERE id=?15",
                    params![
                        row.name,
                        row.description,
                        row.cost,
                        row.price,
                        row.stock,
                        row.min_stock,
                        cat_id,
                        brand_id,
                        supplier_id,
                        row.unit,
                        row.tax_rate,
                        row.sku,
                        row.barcode,
                        catalog_source,
                        id,
                    ],
                )
                .map_err(|e| e.to_string())?;
                result.updated += 1;
            } else {
                result.skipped += 1;
            }
            continue;
        }

        tx.execute(
            "INSERT INTO products (sku, barcode, name, description, category_id, brand_id, supplier_id,
             cost, price, stock, min_stock, unit, tax_rate, catalog_source)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![
                row.sku,
                row.barcode,
                row.name,
                row.description,
                cat_id,
                brand_id,
                supplier_id,
                row.cost,
                row.price,
                row.stock,
                row.min_stock,
                row.unit,
                row.tax_rate,
                catalog_source,
            ],
        )
        .map_err(|e| e.to_string())?;
        let pid = tx.last_insert_rowid();
        if let Some(ref b) = row.barcode {
            let _ = tx.execute(
                "INSERT OR IGNORE INTO product_barcodes (product_id, barcode, label, quantity_factor, is_primary)
                 VALUES (?1,?2,'Principal',1,1)",
                params![pid, b],
            );
        }
        result.inserted += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
