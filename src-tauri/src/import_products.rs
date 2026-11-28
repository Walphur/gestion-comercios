use crate::db_manager::DbManager;
use crate::license::get_license_status;
use crate::product_images::{save_product_image, save_product_image_bytes};
use crate::product_search::rebuild_products_fts;
use crate::spreadsheet::load_spreadsheet;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;

/// show_on_menu de un producto nuevo: en gastronomía sale en la carta; en el resto la tienda
/// web es por elección. Igual que SHOW_ON_MENU_DEFAULT_SQL en src/lib/webStoreDefault.ts.
pub const WEB_STORE_DEFAULT_SQL: &str = "(CASE WHEN COALESCE((SELECT value FROM settings WHERE key = 'rubro'), 'general') = 'gastronomia' THEN 1 ELSE 0 END)";

const FREE_PLAN_PRODUCT_LIMIT: u32 = 25;
/// Peluquería, barbería y estética (rubro `estetica`). Igual que freePlanLimits() en src/config/pricing.ts.
const FREE_PLAN_SALON_LIMIT: u32 = 5;

struct FreePlanLimit {
    enabled: bool,
    current_count: u32,
    max: u32,
    label: &'static str,
    /// «El plan gratis» o «La licencia Permanente», para los avisos.
    plan_name: &'static str,
}

impl Default for FreePlanLimit {
    fn default() -> Self {
        FreePlanLimit {
            enabled: false,
            current_count: 0,
            max: FREE_PLAN_PRODUCT_LIMIT,
            label: "productos",
            plan_name: "El plan gratis",
        }
    }
}

/// 10000 → «10.000», como toLocaleString("es-AR").
fn thousands(n: u32) -> String {
    let digits = n.to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push('.');
        }
        out.push(c);
    }
    out
}

fn free_plan_limit_for_rubro(conn: &Connection) -> (u32, &'static str) {
    let rubro: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = 'rubro'", [], |r| r.get(0))
        .ok();
    if rubro.as_deref() == Some("estetica") {
        (FREE_PLAN_SALON_LIMIT, "servicios")
    } else {
        (FREE_PLAN_PRODUCT_LIMIT, "productos")
    }
}

/// Plan gratis: (tope del rubro, lugar que queda) para los productos que se cargan desde el celular.
pub fn free_plan_product_room(conn: &Connection) -> Result<(u32, u32), String> {
    let (max, _) = free_plan_limit_for_rubro(conn);
    let count = free_plan_product_count(conn)?;
    Ok((max, max.saturating_sub(count)))
}

#[derive(Serialize, Clone)]
pub struct ImportProductsResult {
    pub inserted: u32,
    pub updated: u32,
    pub skipped: u32,
    pub errors: Vec<String>,
    /// Avisos útiles (columnas detectadas, fila de encabezados, etc.).
    pub notes: Vec<String>,
    /// Fotos aplicadas (columna imagen, URL o carpeta imagenes/{codigo}).
    #[serde(default)]
    pub images_attached: u32,
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
    image: Option<String>,
}

struct PendingImage {
    product_id: i64,
    image: String,
    barcode: Option<String>,
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

    let sub: Vec<String> = [c2, c3].into_iter().filter(|s| !s.is_empty()).collect();
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
        "nombre",
        "name",
        "codigo",
        "barcode",
        "ean",
        "sku",
        "precio",
        "price",
        "costo",
        "cost",
        "stock",
        "categoria",
        "marca",
        "proveedor",
        "articulo",
        "producto",
        "descripcion",
        "imagen",
        "foto",
        "image",
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

fn field_index_fuzzy(
    headers: &HashMap<String, usize>,
    aliases: &[&str],
    contains: &[&str],
) -> Option<usize> {
    for a in aliases {
        if let Some(&i) = headers.get(*a) {
            return Some(i);
        }
    }
    // Preferí el encabezado más corto que matchee (evita que un título
    // "codigo;nombre;marca…" robe todas las columnas).
    let mut best: Option<(usize, usize)> = None;
    for (h, &i) in headers {
        for sub in contains {
            if h == *sub || h.contains(sub) {
                let len = h.len();
                if best.map(|(l, _)| len < l).unwrap_or(true) {
                    best = Some((len, i));
                }
            }
        }
    }
    best.map(|(_, i)| i)
}

/// Índice de costo: prioriza columnas de costo con IVA si existen.
fn field_index_cost(headers: &HashMap<String, usize>) -> Option<usize> {
    for a in [
        "costo_iva",
        "costo_con_iva",
        "costoiva",
        "precio_costo_iva",
        "cost_iva",
    ] {
        if let Some(&i) = headers.get(a) {
            return Some(i);
        }
    }
    field_index_fuzzy(
        headers,
        &["cost", "costo", "costo_compra", "precio_costo", "compra"],
        &["costo", "cost", "compra"],
    )
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
    image: Option<usize>,
}

fn map_columns(headers: &HashMap<String, usize>) -> ColumnMap {
    ColumnMap {
        name: field_index_fuzzy(
            headers,
            &[
                "name",
                "nombre",
                "producto",
                "articulo",
                "item",
                "denominacion",
                "detalle",
            ],
            &[
                "nombre", "descrip", "product", "articul", "item", "denomin", "detalle",
            ],
        ),
        barcode: field_index_fuzzy(
            headers,
            &[
                "barcode",
                "codigo",
                "codigo_barras",
                "cod_barras",
                "cod_barra",
                "ean",
                "ean13",
                "barra",
                "gtin",
                "upc",
                "codigo_de_barras",
                "cod_producto",
                "codigo_producto",
            ],
            &["barcode", "codigo", "barras", "ean", "gtin", "upc"],
        ),
        sku: field_index_fuzzy(
            headers,
            &[
                "sku",
                "codigo_interno",
                "cod_interno",
                "id_producto",
                "cod_articulo",
            ],
            &["sku", "interno", "articulo"],
        ),
        price: field_index_fuzzy(
            headers,
            &[
                "price",
                "precio",
                "precio_venta",
                "pvp",
                "venta",
                "importe",
                "precio_publico",
            ],
            &["precio", "price", "pvp", "venta", "importe"],
        ),
        cost: field_index_cost(headers),
        stock: field_index_fuzzy(
            headers,
            &[
                "stock",
                "cantidad",
                "existencia",
                "existencias",
                "inventario",
                "qty",
            ],
            &["stock", "cantidad", "existenc", "invent"],
        ),
        min_stock: field_index_fuzzy(
            headers,
            &["min_stock", "stock_minimo", "minimo", "stock_min"],
            &["minimo", "min_stock"],
        ),
        category: field_index_fuzzy(
            headers,
            &[
                "category",
                "categoria",
                "rubro",
                "familia",
                "linea",
                "tipo",
                "seccion",
            ],
            &[
                "categoria",
                "category",
                "rubro",
                "familia",
                "linea",
                "seccion",
            ],
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
        brand: field_index_fuzzy(headers, &["brand", "marca"], &["marca", "brand"]),
        supplier: field_index_fuzzy(
            headers,
            &["supplier", "proveedor", "proveedores"],
            &["proveedor", "supplier"],
        ),
        unit: field_index_fuzzy(headers, &["unit", "unidad", "um"], &["unidad", "unit"]),
        image: field_index_fuzzy(
            headers,
            &[
                "imagen",
                "foto",
                "image",
                "image_url",
                "imagen_url",
                "url_imagen",
                "foto_url",
                "url_foto",
                "photo",
                "photo_url",
            ],
            &["imagen", "foto", "image_url", "photo"],
        ),
        // Solo títulos claros de alícuota — no confundir con «Costo IVA».
        tax: {
            let mut found = None;
            for a in ["tax_rate", "alicuota", "alicuota_iva", "porcentaje_iva", "iva_pct"] {
                if let Some(&i) = headers.get(a) {
                    found = Some(i);
                    break;
                }
            }
            if found.is_none() {
                if let Some(&i) = headers.get("iva") {
                    found = Some(i);
                }
            }
            found
        },
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
    let t = s.trim();
    if t.is_empty() {
        return 0.0;
    }
    // 1.234,56 (ES) o 1234.56 / 1234,56
    let normalized = if t.contains('.') && t.contains(',') {
        t.replace('.', "").replace(',', ".")
    } else if t.matches(',').count() == 1 && !t.contains('.') {
        t.replace(',', ".")
    } else {
        t.to_string()
    };
    normalized.parse().unwrap_or(0.0)
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
    /// Si el precio de venta viene vacío/0 y hay costo, venta = costo × (1 + margen/100).
    /// Ej. 40 → precio = costo × 1.40 cuando no hay columna de venta.
    pub margin_percent: Option<f64>,
}

pub fn import_products_csv(
    file_path: &str,
    options: ImportCsvOptions,
) -> Result<ImportProductsResult, String> {
    import_products_file(None, file_path, options)
}

/// Importa productos desde CSV, Excel (.xlsx) o .xls.
pub fn import_products_file(
    app: Option<&AppHandle>,
    file_path: &str,
    options: ImportCsvOptions,
) -> Result<ImportProductsResult, String> {
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
        images_attached: 0,
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

    let margin_percent = options.margin_percent;
    if margin_percent.is_some() && cols.price.is_none() {
        result.notes.push(
            "Sin columna de precio: se calculará venta = costo × (1 + margen%).".into(),
        );
    }

    // Notas de columnas detectadas (ayuda a depurar imports).
    {
        let col_name = |idx: Option<usize>| -> String {
            idx.and_then(|i| resolved.headers.get(i).cloned())
                .unwrap_or_else(|| "—".into())
        };
        result.notes.push(format!(
            "Columnas: código={}, nombre={}, marca={}, costo={}, precio={}, imagen={}.",
            col_name(cols.barcode),
            col_name(cols.name),
            col_name(cols.brand),
            col_name(cols.cost),
            col_name(cols.price),
            col_name(cols.image),
        ));
    }

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
    let idx_image = cols.image;

    let license_status = get_license_status();
    let free_plan = license_status.plan == "free";
    let permanent_max = if !free_plan && crate::license::is_permanent_plan(&license_status) {
        crate::license::permanent_max_products(&license_status)
    } else {
        None
    };
    let mut free_plan_limit = FreePlanLimit {
        enabled: free_plan || permanent_max.is_some(),
        ..FreePlanLimit::default()
    };

    let mut pending_images: Vec<PendingImage> = Vec::new();

    DbManager::with_connection(|conn| {
        if free_plan_limit.enabled {
            let (max, label) = if let Some(max) = permanent_max {
                free_plan_limit.plan_name = "La licencia Permanente";
                (max, "productos")
            } else {
                free_plan_limit_for_rubro(conn)
            };
            free_plan_limit.max = max;
            free_plan_limit.label = label;
            free_plan_limit.current_count = free_plan_product_count(conn)?;
            if free_plan_limit.current_count >= max {
                result.notes.push(format!(
                    "{} ya alcanzó el límite de {} {label} y no se pueden agregar más nuevos.",
                    free_plan_limit.plan_name,
                    thousands(max)
                ));
            }
        }

        import_rows_into_conn(
            conn,
            &resolved.rows,
            update_existing,
            &categories_filter,
            catalog_source.as_deref(),
            &mut result,
            &mut pending_images,
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
            idx_image,
            margin_percent,
            &mut free_plan_limit,
        )?;
        rebuild_products_fts(conn)?;
        Ok(())
    })?;

    if let Some(app) = app {
        if !pending_images.is_empty() {
            let sheet_dir = Path::new(file_path)
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| PathBuf::from("."));
            apply_pending_images(app, &sheet_dir, &pending_images, &mut result);
        }
    } else if !pending_images.is_empty() {
        result.notes.push(
            "Hay fotos en la planilla, pero no se pudieron guardar en esta sesión. Probá de nuevo desde la app."
                .into(),
        );
    }

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
    pending_images: &mut Vec<PendingImage>,
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
    idx_image: Option<usize>,
    margin_percent: Option<f64>,
    free_plan_limit: &mut FreePlanLimit,
) -> Result<(), String> {
    let mut batch: Vec<RowData> = Vec::with_capacity(2000);
    let mut margin_applied = 0u32;

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
            let key = category.as_deref().unwrap_or("").trim().to_lowercase();
            if key.is_empty() || !filter.contains(&key) {
                result.skipped += 1;
                continue;
            }
        }

        let cost = idx_cost
            .map(|i| parse_f64(&row_cell(record, Some(i))))
            .unwrap_or(0.0);
        let mut price = idx_price
            .map(|i| parse_f64(&row_cell(record, Some(i))))
            .unwrap_or(0.0);
        if price <= 0.0 {
            if let Some(m) = margin_percent {
                if cost > 0.0 && m >= 0.0 {
                    price = (cost * (1.0 + m / 100.0) * 100.0).round() / 100.0;
                    margin_applied += 1;
                }
            }
        }

        let image = idx_image
            .map(|i| row_cell(record, Some(i)))
            .filter(|s| !s.is_empty());

        let row = RowData {
            barcode: barcode.clone(),
            sku,
            name: display_name,
            description,
            price,
            cost,
            stock: idx_stock
                .map(|i| parse_f64(&row_cell(record, Some(i))))
                .unwrap_or(0.0),
            min_stock: idx_min
                .map(|i| parse_f64(&row_cell(record, Some(i))))
                .unwrap_or(0.0),
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
            image,
        };

        batch.push(row);
        if batch.len() >= 2000 {
            flush_batch(
                conn,
                &mut batch,
                update_existing,
                catalog_source,
                result,
                pending_images,
                free_plan_limit,
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
            pending_images,
            free_plan_limit,
        )?;
    }

    if margin_applied > 0 {
        if let Some(m) = margin_percent {
            result.notes.push(format!(
                "Precio de venta calculado con margen {m}% sobre el costo en {margin_applied} productos."
            ));
        }
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

/// Lo que ocupa lugar en el plan gratis: activos sin los ejemplos. Igual que countFreePlanProducts() en src/lib/planLimits.ts.
pub fn free_plan_product_count(conn: &Connection) -> Result<u32, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM products WHERE active = 1 AND COALESCE(catalog_source, '') <> 'demo'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count.max(0) as u32)
}

fn find_existing_id(
    conn: &Connection,
    barcode: &Option<String>,
    sku: &Option<String>,
) -> Option<i64> {
    if let Some(b) = barcode {
        // Preferí activo; si no, el desactivado (para poder reactivarlo al reimportar).
        if let Ok(id) = conn.query_row(
            "SELECT p.id FROM products p
             LEFT JOIN product_barcodes pb ON pb.product_id = p.id
             WHERE pb.barcode = ?1 OR p.barcode = ?1
             ORDER BY p.active DESC, p.id DESC
             LIMIT 1",
            params![b],
            |r| r.get::<_, i64>(0),
        ) {
            return Some(id);
        }
    }
    if let Some(s) = sku {
        if let Ok(id) = conn.query_row(
            "SELECT id FROM products WHERE sku = ?1
             ORDER BY active DESC, id DESC
             LIMIT 1",
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
    pending_images: &mut Vec<PendingImage>,
    free_plan_limit: &mut FreePlanLimit,
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
                // No pisar stock: las listas de precios suelen traer celdas no numéricas.
                tx.execute(
                    "UPDATE products SET name=?1, description=?2, cost=?3, price=?4,
                     min_stock=?5, category_id=COALESCE(?6, category_id), brand_id=COALESCE(?7, brand_id),
                     supplier_id=COALESCE(?8, supplier_id), unit=?9, tax_rate=?10,
                     sku=COALESCE(?11, sku), barcode=COALESCE(?12, barcode),
                     catalog_source=COALESCE(?13, catalog_source),
                     active=1,
                     updated_at=datetime('now','localtime')
                     WHERE id=?14",
                    params![
                        row.name,
                        row.description,
                        row.cost,
                        row.price,
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
                queue_pending_image(pending_images, id, &row);
            } else {
                result.skipped += 1;
            }
            continue;
        }

        if free_plan_limit.enabled && free_plan_limit.current_count >= free_plan_limit.max {
            let note = format!(
                "{} solo permite {} {}. Los adicionales no se importaron.",
                free_plan_limit.plan_name,
                thousands(free_plan_limit.max),
                free_plan_limit.label
            );
            if result.notes.iter().all(|n| *n != note) {
                result.notes.push(note);
            }
            result.skipped += 1;
            continue;
        }

        tx.execute(
            &format!(
                "INSERT INTO products (sku, barcode, name, description, category_id, brand_id, supplier_id,
                 cost, price, stock, min_stock, unit, tax_rate, catalog_source, sync_id, show_on_menu)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14, lower(hex(randomblob(16))), {WEB_STORE_DEFAULT_SQL})"
            ),
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
        // Sync LAN: el stock viaja solo por stock_movements (no por products.stock).
        if row.stock.abs() > 1e-9 {
            tx.execute(
                "INSERT INTO stock_movements
                   (product_id, movement_type, qty, reference_type, reference_id, sync_id)
                 VALUES (?1, 'adjustment', ?2, 'product_import', ?1, lower(hex(randomblob(16))))",
                params![pid, row.stock],
            )
            .map_err(|e| e.to_string())?;
        }
        if let Some(ref b) = row.barcode {
            let _ = tx.execute(
                "INSERT OR IGNORE INTO product_barcodes (product_id, barcode, label, quantity_factor, is_primary)
                 VALUES (?1,?2,'Principal',1,1)",
                params![pid, b],
            );
        }
        result.inserted += 1;
        queue_pending_image(pending_images, pid, &row);
        if free_plan_limit.enabled {
            free_plan_limit.current_count = free_plan_limit.current_count.saturating_add(1);
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn queue_pending_image(pending: &mut Vec<PendingImage>, product_id: i64, row: &RowData) {
    let Some(image) = row
        .image
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
    else {
        return;
    };
    pending.push(PendingImage {
        product_id,
        image,
        barcode: row.barcode.clone(),
    });
}

fn is_http_url(s: &str) -> bool {
    let t = s.trim();
    t.starts_with("http://") || t.starts_with("https://")
}

fn ext_from_url_or_type(url: &str, content_type: Option<&str>) -> String {
    if let Some(ct) = content_type {
        let ct = ct.to_lowercase();
        if ct.contains("png") {
            return "png".into();
        }
        if ct.contains("webp") {
            return "webp".into();
        }
        if ct.contains("gif") {
            return "gif".into();
        }
        if ct.contains("jpeg") || ct.contains("jpg") {
            return "jpg".into();
        }
    }
    let path = url.split('?').next().unwrap_or(url);
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .filter(|e| matches!(e.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif"))
        .unwrap_or_else(|| "jpg".into())
}

fn download_image(url: &str) -> Result<(Vec<u8>, String), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(45))
        .user_agent("WalQo/1.0 (product import)")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(url)
        .send()
        .map_err(|e| format!("No se pudo bajar la foto: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("No se pudo bajar la foto (HTTP {}).", resp.status()));
    }
    let ct = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let ext = ext_from_url_or_type(url, ct.as_deref());
    let bytes = resp
        .bytes()
        .map_err(|e| e.to_string())?
        .to_vec();
    if bytes.len() < 32 {
        return Err("La foto bajó vacía o corrupta.".into());
    }
    if bytes.len() > 12_000_000 {
        return Err("La foto pesa demasiado (máx. 12 MB).".into());
    }
    Ok((bytes, ext))
}

fn resolve_local_image(sheet_dir: &Path, image_ref: &str, barcode: Option<&str>) -> Option<PathBuf> {
    let trimmed = image_ref.trim().trim_matches('"');
    let mut candidates: Vec<PathBuf> = Vec::new();
    if !trimmed.is_empty() && !is_http_url(trimmed) {
        let p = Path::new(trimmed);
        if p.is_absolute() {
            candidates.push(p.to_path_buf());
        } else {
            candidates.push(sheet_dir.join(trimmed));
            candidates.push(sheet_dir.join("imagenes").join(trimmed));
            candidates.push(sheet_dir.join("images").join(trimmed));
            if let Some(name) = p.file_name() {
                candidates.push(sheet_dir.join("imagenes").join(name));
                candidates.push(sheet_dir.join("images").join(name));
            }
        }
    }
    if let Some(code) = barcode.map(str::trim).filter(|s| !s.is_empty()) {
        for folder in ["imagenes", "images", ""] {
            let base = if folder.is_empty() {
                sheet_dir.to_path_buf()
            } else {
                sheet_dir.join(folder)
            };
            for ext in ["jpg", "jpeg", "png", "webp", "gif"] {
                candidates.push(base.join(format!("{code}.{ext}")));
            }
        }
    }
    candidates.into_iter().find(|p| p.is_file())
}

fn apply_pending_images(
    app: &AppHandle,
    sheet_dir: &Path,
    pending: &[PendingImage],
    result: &mut ImportProductsResult,
) {
    let mut attached = 0u32;
    let mut failed = 0u32;
    for job in pending {
        let set_path = |name: String| {
            let _ = DbManager::with_connection(|conn| {
                conn.execute(
                    "UPDATE products SET image_path=?1, updated_at=datetime('now','localtime') WHERE id=?2",
                    params![name, job.product_id],
                )
                .map_err(|e| e.to_string())?;
                Ok(())
            });
        };
        let from_local = || {
            if let Some(path) = resolve_local_image(sheet_dir, &job.image, job.barcode.as_deref()) {
                match save_product_image(app.clone(), job.product_id, path.to_string_lossy().into_owned())
                {
                    Ok(name) => {
                        set_path(name);
                        true
                    }
                    Err(_) => false,
                }
            } else {
                false
            }
        };
        let applied = if is_http_url(&job.image) {
            match download_image(&job.image) {
                Ok((bytes, ext)) => match save_product_image_bytes(app, job.product_id, &bytes, &ext)
                {
                    Ok(name) => {
                        set_path(name);
                        true
                    }
                    Err(_) => from_local(),
                },
                Err(_) => from_local(),
            }
        } else {
            from_local()
        };
        if applied {
            attached += 1;
        } else if !job.image.is_empty() || job.barcode.is_some() {
            // Solo cuenta fallo si había referencia explícita o se esperaba por código.
            if !job.image.is_empty() {
                failed += 1;
            }
        }
    }
    result.images_attached = attached;
    if attached > 0 {
        result.notes.push(format!(
            "Se cargaron {attached} foto{}.",
            if attached == 1 { "" } else { "s" }
        ));
    }
    if failed > 0 {
        result.notes.push(format!(
            "No se pudieron cargar {failed} foto{}. Revisá la columna imagen o la carpeta imagenes.",
            if failed == 1 { "" } else { "s" }
        ));
    }
}
