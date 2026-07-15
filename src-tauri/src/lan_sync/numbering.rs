//! Numeración comercial offline-first (preparación Fase 2).
//!
//! ## Alternativas evaluadas
//!
//! 1. **Secuencia central (hub)** — números globales sin huecos. Falla offline:
//!    las cajas no pueden emitir comprobantes sin servidor.
//! 2. **Reserva de rangos** — el hub otorga bloques (ej. 1000–1999). Funciona
//!    parcialmente offline hasta agotar el bloque; requiere renovación y
//!    contabilidad de rangos; riesgo de agotar rango en pico de ventas.
//! 3. **Secuencia por dispositivo** — cada PC tiene `device_code` corto (CJ01,
//!    OF01) y un contador local por tipo de documento. Formato:
//!    `{CODE}-{T}-{NNNNNNNN}` (ej. `CJ01-V-00000042`).
//!
//! ## Elección: secuencia por dispositivo
//!
//! Es la única estrategia que garantiza:
//! - 0 duplicados entre PCs (el código de dispositivo es único en el local)
//! - Emisión offline ilimitada
//! - Sin dependencia del hub para vender / facturar
//! - `sales.id` local NUNCA se usa como número visible
//!
//! Huecos por anulaciones o fallos son aceptables comercialmente.
//! Contabilidad/fiscal puede indexar por `doc_number` + CUIT del comercio.

use rusqlite::{params, Connection, OptionalExtension};

use crate::settings_util::{read_setting_or, write_setting};

use super::errors::{LanResult, LanSyncError};

/// Tipos de documento preparados (Fase 2 usará los mismos códigos).
pub mod doc_type {
    pub const SALE: &str = "V";
    pub const INVOICE: &str = "F";
    pub const QUOTE: &str = "P";
    pub const DELIVERY: &str = "R";
    pub const ORDER: &str = "O";
}

const KEY_DEVICE_CODE: &str = "lan_sync_device_code";

pub fn ensure_device_code(conn: &Connection) -> LanResult<String> {
    let existing = read_setting_or(conn, KEY_DEVICE_CODE, "");
    if !existing.trim().is_empty() {
        return Ok(existing.trim().to_ascii_uppercase());
    }
    // Derivar código corto estable desde device_id hex.
    let device_id = read_setting_or(conn, "lan_sync_device_id", "");
    let code = if device_id.len() >= 4 {
        format!("PC{}", device_id[..4].to_ascii_uppercase())
    } else {
        "PC00".into()
    };
    write_setting(conn, KEY_DEVICE_CODE, &code).map_err(LanSyncError::db)?;
    Ok(code)
}

pub fn set_device_code(conn: &Connection, code: &str) -> LanResult<()> {
    let c = code.trim().to_ascii_uppercase();
    if c.is_empty() || c.len() > 8 {
        return Err(LanSyncError::Config(
            "device_code debe tener entre 1 y 8 caracteres".into(),
        ));
    }
    if !c.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        return Err(LanSyncError::Config(
            "device_code solo letras/números".into(),
        ));
    }
    write_setting(conn, KEY_DEVICE_CODE, &c).map_err(LanSyncError::db)?;
    Ok(())
}

/// Reserva el próximo número local y devuelve el string comercial completo.
pub fn next_doc_number(conn: &Connection, doc_type: &str) -> LanResult<String> {
    let code = ensure_device_code(conn)?;
    let next: i64 = conn
        .query_row(
            "SELECT next_value FROM document_sequences WHERE device_code = ?1 AND doc_type = ?2",
            params![code, doc_type],
            |r| r.get(0),
        )
        .optional()
        .map_err(LanSyncError::db)?
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO document_sequences (device_code, doc_type, next_value)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(device_code, doc_type) DO UPDATE SET next_value = excluded.next_value",
        params![code, doc_type, next + 1],
    )
    .map_err(LanSyncError::db)?;

    Ok(format!("{code}-{doc_type}-{next:08}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sequence_monotonic_and_prefixed() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO settings VALUES ('lan_sync_device_id','abcd1234'), ('lan_sync_device_code','CJ01');
            CREATE TABLE document_sequences (
              device_code TEXT NOT NULL, doc_type TEXT NOT NULL, next_value INTEGER NOT NULL DEFAULT 1,
              PRIMARY KEY (device_code, doc_type)
            );
            ",
        )
        .unwrap();
        let a = next_doc_number(&conn, doc_type::SALE).unwrap();
        let b = next_doc_number(&conn, doc_type::SALE).unwrap();
        assert_eq!(a, "CJ01-V-00000001");
        assert_eq!(b, "CJ01-V-00000002");
    }
}
