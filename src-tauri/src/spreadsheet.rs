use calamine::{open_workbook_auto, Data, Reader};
use std::fs::File;
use std::io::Read;
use std::path::Path;

pub struct Spreadsheet {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

fn extension_lower(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

fn data_to_string(d: Data) -> String {
    match d {
        Data::Empty => String::new(),
        Data::String(s) => s.trim().to_string(),
        Data::Float(f) => {
            if (f.fract()).abs() < f64::EPSILON {
                format!("{}", f as i64)
            } else {
                format!("{f}")
            }
        }
        Data::Int(i) => format!("{i}"),
        Data::Bool(b) => {
            if b {
                "1".into()
            } else {
                "0".into()
            }
        }
        Data::DateTime(f) => format!("{f}"),
        Data::DateTimeIso(s) | Data::DurationIso(s) => s,
        Data::Error(_) => String::new(),
    }
}

fn load_csv(path: &Path) -> Result<Spreadsheet, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(file);
    let headers_raw = rdr.headers().map_err(|e| e.to_string())?.clone();
    let headers: Vec<String> = headers_raw.iter().map(|h| h.trim().to_string()).collect();
    let mut rows = Vec::new();
    for record in rdr.records() {
        let record = record.map_err(|e| e.to_string())?;
        let mut row = vec![String::new(); headers.len()];
        for (i, field) in record.iter().enumerate() {
            if i < row.len() {
                row[i] = field.trim().to_string();
            } else {
                row.push(field.trim().to_string());
            }
        }
        rows.push(row);
    }
    Ok(Spreadsheet { headers, rows })
}

fn load_excel(path: &Path) -> Result<Spreadsheet, String> {
    let mut workbook =
        open_workbook_auto(path).map_err(|e| format!("No se pudo abrir Excel: {e}"))?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or("El archivo Excel no tiene hojas.")?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| e.to_string())?;

    let mut iter = range.rows();
    let header_row = iter.next().ok_or("El archivo Excel está vacío.")?;
    let headers: Vec<String> = header_row
        .iter()
        .map(|c| data_to_string(c.clone()))
        .collect();
    let col_count = headers.len().max(1);

    let mut rows = Vec::new();
    for row in iter {
        let mut cells = vec![String::new(); col_count];
        for (i, cell) in row.iter().enumerate() {
            if i < col_count {
                cells[i] = data_to_string(cell.clone());
            }
        }
        if cells.iter().all(|c| c.is_empty()) {
            continue;
        }
        rows.push(cells);
    }

    Ok(Spreadsheet { headers, rows })
}

/// Detecta CSV por extensión o contenido (Excel a veces guarda .csv con BOM).
fn load_csv_flexible(path: &Path) -> Result<Spreadsheet, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut head = [0u8; 8];
    let n = file.read(&mut head).unwrap_or(0);
    // ZIP / XLSX
    if n >= 2 && head[0] == b'P' && head[1] == b'K' {
        return Err(
            "Parece un archivo Excel (.xlsx). Renombralo con extensión .xlsx o elegilo de nuevo."
                .into(),
        );
    }
    // OLE / XLS
    if n >= 8 && head[..8] == [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] {
        return load_excel(path);
    }
    load_csv(path)
}

pub fn load_spreadsheet(path: &str) -> Result<Spreadsheet, String> {
    let path = Path::new(path);
    if !path.exists() {
        return Err("El archivo no existe.".into());
    }
    let ext = extension_lower(path);
    match ext.as_str() {
        "xlsx" | "xls" | "xlsm" => load_excel(path),
        "csv" | "txt" => load_csv_flexible(path),
        _ => {
            if let Ok(s) = load_excel(path) {
                Ok(s)
            } else {
                load_csv_flexible(path)
            }
        }
    }
}
