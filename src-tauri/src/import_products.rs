use crate::db_manager::DbManager;
use crate::product_search::rebuild_products_fts;
use crate::spreadsheet::load_spreadsheet;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Serialize, Clone)]
pub struct ImportProductsResult {
    pub inserted: u32,
    pub updated: u32,
    pub skipped: u32,
    pub errors: Vec<String>,
    /// Avisos útiles (columnas detectadas, fila de encabezados, etc.).
    pub notes: Vec<String>,
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
    row: &[String],
    idx_cat: Option<usize>,
    idx_cat1: Option<usize>,
    idx_cat2: Option<usize>,
    idx_cat3: Option<usize>,
) -> (Option<String>, Option<String>) {
    let c1 = idx_cat1.map(|i| row_cell(row, Some(i))).unwrap_or_default();
    let c2 = idx_cat2.map(|i| row_cell(row, Some(i))).unwrap_or_default();
    let c3 = idx_cat3.map(|i| row_cell(row, Some(i))).unwrap_or_default();
    let single = idx_cat.map(|i| row_cell(row, Some(i))).unwrap_or_default();

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

fn strip_accents(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'á' | 'à' | 'ä' | 'â' | 'ã' | 'å' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' | 'õ' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            'Á' | 'À' | 'Ä' | 'Â' | 'Ã' | 'Å' => 'a',
            'É' | 'È' | 'Ë' | 'Ê' => 'e',
            'Í' | 'Ì' | 'Ï' | 'Î' => 'i',
            'Ó' | 'Ò' | 'Ö' | 'Ô' | 'Õ' => 'o',
            'Ú' | 'Ù' | 'Ü' | 'Û' => 'u',
            'Ñ' => 'n',
            other => other.to_ascii_lowercase(),
        })
        .collect()
}

fn normalize_header(h: &str) -> String {
    let mut t = strip_accents(h.trim());
    for ch in [' ', '-', '.', '/', '(', ')', ':', ';', '\t', '"', '\''] {
        t = t.replace(ch, "_");
    }
    while t.contains("__") {
        t = t.replace("__", "_");
    }
    t.trim_matches('_').to_string()
}

fn header_keyword_score(norm: &str) -> u32 {
    const KEYS: &[&str] = &[
        "nombre", "name", "codigo", "barcode", "ean", "sku", "precio", "price", "costo", "cost",
        "stock", "categoria", "marca", "proveedor", "articulo", "producto", "descripcion",
    ];
    let mut score = 0u32;
    for k in KEYS {
        if norm == *k || norm.contains(k) {
            score += 2;
        }
    }
    score
}

fn score_row_as_header(row: &[String]) -> u32 {
    let mut score = 0u32;
    let mut non_empty = 0u32;
    for cell in row {
        let raw = cell.trim();
        if raw.is_empty() {
            continue;
        }
        non_empty += 1;
        let norm = normalize_header(raw);
        if norm.is_empty() {
            continue;
        }
        if raw.chars().all(|c| c.is_ascii_digit()) && raw.len() >= 10 {
            continue;
        }
        score += header_keyword_score(&norm);
        if norm.len() <= 40 {
            score += 1;
        }
    }
    if non_empty >= 2 {
        score += 1;
    }
    score
}

struct ResolvedSheet {
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
    header_row_note: Option<String>,
}

fn resolve_header_row(sheet: crate::spreadsheet::Spreadsheet) -> ResolvedSheet {
    let mut all_rows: Vec<Vec<String>> = Vec::new();
    all_rows.push(sheet.headers);
    all_rows.extend(sheet.rows);

    let scan = all_rows.len().min(15);
    let mut best_i = 0usize;
    let mut best_score = score_row_as_header(&all_rows[0]);
    for (i, row) in all_rows.iter().enumerate().take(scan).skip(1) {
        let s = score_row_as_header(row);
        if s > best_score {
            best_score = s;
            best_i = i;
        }
    }

    let headers = all_rows[best_i].clone();
    let header_row_note = if best_i == 0 {
        None
    } else {
        Some(format!(
            "Encabezados detectados en la fila {} del archivo.",
            best_i + 1
        ))
    };
    let rows: Vec<Vec<String>> = all_rows.into_iter().skip(best_i + 1).collect();

    ResolvedSheet {
        headers,
        rows,
        header_row_note,
    }
}

fn field_index_fuzzy(headers: &HashMap<String, usize>, aliases: &[&str], contains: &[&str]) -> Option<usize> {
    for a in aliases {
        if let Some(&i) = headers.get(*a) {
            return Some(i);
        }
    }
    for (h, &i) in headers {
        for sub in contains {
            if h.contains(sub) {
                return Some(i);
            }
        }
    }
    None
}

struct ColumnMap {
    name: Option<usize>,
    barcode: Option<usize>,
    sku: Option<usize>,
    price: Option<usize>,
    cost: Option<usize>,
    stock: Option<usize>,
    min_stock: Option<usize>,
    category: Option<usize>,
    cat1: Option<usize>,
    cat2: Option<usize>,
    cat3: Option<usize>,
    brand: Option<usize>,
    supplier: Option<usize>,
    unit: Option<usize>,
    tax: Option<usize>,
}

fn map_columns(headers: &HashMap<String, usize>) -> ColumnMap {
    ColumnMap {
        name: field_index_fuzzy(
            headers,
            &["name", "nombre", "producto", "articulo", "item", "denominacion", "detalle"],
            &["nombre", "descrip", "product", "articul", "item", "denomin", "detalle"],
        ),
        barcode: field_index_fuzzy(
            headers,
            &[
                "barcode", "codigo", "codigo_barras", "cod_barras", "cod_barra", "ean", "ean13",
                "barra", "gtin", "upc", "codigo_de_barras", "cod_producto", "codigo_producto",
            ],
            &["barcode", "codigo", "barras", "ean", "gtin", "upc"],
        ),
        sku: field_index_fuzzy(
            headers,
            &["sku", "codigo_interno", "cod_interno", "id_producto", "cod_articulo"],
            &["sku", "interno", "articulo"],
        ),
        price: field_index_fuzzy(
            headers,
            &["price", "precio", "precio_venta", "pvp", "venta", "importe", "precio_publico"],
            &["precio", "price", "pvp", "venta", "importe"],
        ),
        cost: field_index_fuzzy(
            headers,
            &["cost", "costo", "costo_compra", "precio_costo", "compra"],
            &["costo", "cost", "compra"],
        ),
        stock: field_index_fuzzy(
            headers,
            &["stock", "cantidad", "existencia", "existencias", "inventario", "qty"],
            &["stock", "cantidad", "existenc", "invent"],
        ),
        min_stock: field_index_fuzzy(
            headers,
            &["min_stock", "stock_minimo", "minimo", "stock_min"],
            &["minimo", "min_stock"],
        ),
        category: field_index_fuzzy(
            headers,
            &["category", "categoria", "rubro", "familia", "linea", "tipo", "seccion"],
            &["categoria", "category", "rubro", "familia", "linea", "seccion"],
        ),
        cat1: field_index_fuzzy(
            headers,
            &["cat1", "categoria_1", "rubro_1"],
            &["cat1", "categoria_1"],
        ),
        cat2: field_index_fuzzy(
            headers,
            &["cat2", "categoria_2", "rubro_2"],
            &["cat2", "categoria_2"],
        ),
        cat3: field_index_fuzzy(
            headers,
            &["cat3", "categoria_3", "rubro_3"],
            &["cat3", "categoria_3"],
        ),
        brand: field_index_fuzzy(
            headers,
            &["brand", "marca"],
            &["marca", "brand"],
        ),
        supplier: field_index_fuzzy(
            headers,
            &["supplier", "proveedor", "proveedores"],
            &["proveedor", "supplier"],
        ),
        unit: field_index_fuzzy(headers, &["unit", "unidad", "um"], &["unidad", "unit"]),
        tax: field_index_fuzzy(
            headers,
            &["tax_rate", "iva", "alicuota", "impuesto"],
            &["iva", "alicuota", "tax"],
        ),
    }
}

fn apply_positional_fallback(cols: &mut ColumnMap, header_count: usize, notes: &mut Vec<String>) {
    if cols.name.is_some() || cols.barcode.is_some() || cols.sku.is_some() {
        return;
    }
    if header_count >= 2 {
        cols.name = Some(0);
        cols.barcode = Some(1);
        notes.push(
            "No reconocimos los títulos de columna: usamos la 1.ª columna como nombre y la 2.ª como código."
                .into(),
        );
        if header_count >= 3 && cols.price.is_none() {
            cols.price = Some(2);
        }
        if header_count >= 4 && cols.cost.is_none() {
            cols.cost = Some(3);
        }
        if header_count >= 5 && cols.stock.is_none() {
            cols.stock = Some(4);
        }
    } else if header_count == 1 {
        cols.name = Some(0);
        notes.push("Una sola columna: se tomó como nombre del producto.".into());
    }
}

fn format_headers_hint(raw: &[String]) -> String {
    let shown: Vec<String> = raw
        .iter()
        .map(|h| h.trim())
        .filter(|h| !h.is_empty())
        .take(12)
        .map(|h| format!("«{h}»"))
        .collect();
    if shown.is_empty() {
        "El archivo no tiene títulos de columna en la primera fila.".into()
    } else {
        format!("Columnas leídas: {}", shown.join(", "))
    }
}

fn parse_f64(s: &str) -> f64 {
    let t = s.trim().replace(',', ".");
    t.parse().unwrap_or(0.0)
}

fn row_cell(row: &[String], idx: Option<usize>) -> String {
    idx.and_then(|i| row.get(i))
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

pub struct ImportCsvOptions {
    pub update_existing: bool,
    /// Si está definido, solo importa filas cuya categoría principal (cat1) está en el set (minúsculas).
    pub categories_filter: Option<HashSet<String>>,
    /// Ej. `supermarket` para poder borrar el catálogo masivo después.
    pub catalog_source: Option<String>,
}

pub fn import_products_csv(file_path: &str, options: ImportCsvOptions) -> Result<ImportProductsResult, String> {
    import_products_file(file_path, options)
}

/// Importa productos desde CSV, Excel (.xlsx) o .xls.
pub fn import_products_file(file_path: &str, options: ImportCsvOptions) -> Result<ImportProductsResult, String> {
    let update_existing = options.update_existing;
    let categories_filter = options.categories_filter;
    let catalog_source = options.catalog_source;

    let sheet = load_spreadsheet(file_path)?;
    let resolved = resolve_header_row(sheet);

    let mut result = ImportProductsResult {
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: vec![],
        notes: vec![],
    };
    if let Some(note) = resolved.header_row_note {
        result.notes.push(note);
    }

    let mut headers: HashMap<String, usize> = HashMap::new();
    for (i, h) in resolved.headers.iter().enumerate() {
        let norm = normalize_header(h);
        if !norm.is_empty() {
            headers.insert(norm, i);
        }
    }

    let mut cols = map_columns(&headers);
    apply_positional_fallback(&mut cols, resolved.headers.len(), &mut result.notes);

    if cols.name.is_none() && cols.barcode.is_none() && cols.sku.is_none() {
        return Err(format!(
            "No pudimos identificar nombre ni código de producto.\n{}\n\n\
             Poné al menos una columna con título parecido a nombre, código, EAN o SKU \
             (también sirve Código, Descripción, etc.). Las demás columnas son opcionales.",
            format_headers_hint(&resolved.headers)
        ));
    }

    let idx_name = cols.name;
    let idx_barcode = cols.barcode;
    let idx_sku = cols.sku;
    let idx_price = cols.price;
    let idx_cost = cols.cost;
    let idx_stock = cols.stock;
    let idx_min = cols.min_stock;
    let idx_cat = cols.category;
    let idx_cat1 = cols.cat1;
    let idx_cat2 = cols.cat2;
    let idx_cat3 = cols.cat3;
    let idx_brand = cols.brand;
    let idx_sup = cols.supplier;
    let idx_unit = cols.unit;
    let idx_tax = cols.tax;

    DbManager::with_connection(|conn| {
        import_rows_into_conn(
            conn,
            &resolved.rows,
            update_existing,
            &categories_filter,
            catalog_source.as_deref(),
            &mut result,
            idx_name,
            idx_barcode,
            idx_sku,
            idx_price,
            idx_cost,
            idx_stock,
            idx_min,
            idx_cat,
            idx_cat1,
            idx_cat2,
            idx_cat3,
            idx_brand,
            idx_sup,
            idx_unit,
            idx_tax,
        )?;
        rebuild_products_fts(conn)?;
        Ok(())
    })?;

    Ok(result)
}

#[allow(clippy::too_many_arguments)]
fn import_rows_into_conn(
    conn: &mut Connection,
    rows: &[Vec<String>],
    update_existing: bool,
    categories_filter: &Option<HashSet<String>>,
    catalog_source: Option<&str>,
    result: &mut ImportProductsResult,
    idx_name: Option<usize>,
    idx_barcode: Option<usize>,
    idx_sku: Option<usize>,
    idx_price: Option<usize>,
    idx_cost: Option<usize>,
    idx_stock: Option<usize>,
    idx_min: Option<usize>,
    idx_cat: Option<usize>,
    idx_cat1: Option<usize>,
    idx_cat2: Option<usize>,
    idx_cat3: Option<usize>,
    idx_brand: Option<usize>,
    idx_sup: Option<usize>,
    idx_unit: Option<usize>,
    idx_tax: Option<usize>,
) -> Result<(), String> {
    let mut batch: Vec<RowData> = Vec::with_capacity(2000);

    for (line_no, record) in rows.iter().enumerate() {
        let _row_num = line_no + 2;

        let name = if let Some(i) = idx_name {
            row_cell(record, Some(i))
        } else {
            String::new()
        };
        let barcode = idx_barcode
            .map(|i| row_cell(record, Some(i)))
            .filter(|s| !s.is_empty());
        let sku = idx_sku
            .map(|i| row_cell(record, Some(i)))
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
            build_category_and_description(record, idx_cat, idx_cat1, idx_cat2, idx_cat3);

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
            price: idx_price.map(|i| parse_f64(&row_cell(record, Some(i)))).unwrap_or(0.0),
            cost: idx_cost.map(|i| parse_f64(&row_cell(record, Some(i)))).unwrap_or(0.0),
            stock: idx_stock.map(|i| parse_f64(&row_cell(record, Some(i)))).unwrap_or(0.0),
            min_stock: idx_min.map(|i| parse_f64(&row_cell(record, Some(i)))).unwrap_or(0.0),
            category,
            brand: idx_brand
                .map(|i| row_cell(record, Some(i)))
                .filter(|s| !s.is_empty()),
            supplier: idx_sup
                .map(|i| row_cell(record, Some(i)))
                .filter(|s| !s.is_empty()),
            unit: idx_unit
                .map(|i| row_cell(record, Some(i)))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "unidad".into()),
            tax_rate: idx_tax
                .map(|i| parse_f64(&row_cell(record, Some(i))))
                .unwrap_or(21.0),
        };

        batch.push(row);
        if batch.len() >= 2000 {
            flush_batch(
                conn,
                &mut batch,
                update_existing,
                catalog_source,
                result,
            )?;
        }
    }

    if !batch.is_empty() {
        flush_batch(
            conn,
            &mut batch,
            update_existing,
            catalog_source,
            result,
        )?;
    }

    Ok(())
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

/// Lista categorías principales (cat1) de CSV o Excel con cantidad de filas.
pub fn list_csv_primary_categories(file_path: &str) -> Result<Vec<(String, u32)>, String> {
    let sheet = load_spreadsheet(file_path)?;
    let resolved = resolve_header_row(sheet);
    let mut headers: HashMap<String, usize> = HashMap::new();
    for (i, h) in resolved.headers.iter().enumerate() {
        let norm = normalize_header(h);
        if !norm.is_empty() {
            headers.insert(norm, i);
        }
    }
    let cols = map_columns(&headers);
    let idx_cat = cols.category;
    let idx_cat1 = cols.cat1;
    let idx_cat2 = cols.cat2;
    let idx_cat3 = cols.cat3;

    let mut counts: HashMap<String, u32> = HashMap::new();
    for record in &resolved.rows {
        let (category, _) =
            build_category_and_description(record, idx_cat, idx_cat1, idx_cat2, idx_cat3);
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
