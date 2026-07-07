//! Utilidades transversales: tiempo en horario de Argentina, identificadores
//! únicos y formateo de fechas para ARCA.
//!
//! ARCA valida los tiempos del TRA contra su propio reloj, por eso todo se
//! expresa con offset explícito de Argentina (UTC-03:00) y en formato
//! ISO 8601 exactamente como lo espera WSAA.

use chrono::{DateTime, FixedOffset, Utc};

use crate::arca::errors::{ArcaError, ArcaResult};

/// Offset horario de Argentina (UTC-03:00), en segundos.
const AR_OFFSET_SECS: i32 = -3 * 3600;

/// Devuelve el offset fijo de Argentina.
pub fn ar_offset() -> ArcaResult<FixedOffset> {
    FixedOffset::east_opt(AR_OFFSET_SECS)
        .ok_or_else(|| ArcaError::Internal("offset horario de Argentina inválido".to_string()))
}

/// Instante actual en horario de Argentina.
pub fn now_ar() -> ArcaResult<DateTime<FixedOffset>> {
    Ok(Utc::now().with_timezone(&ar_offset()?))
}

/// Formatea una fecha en ISO 8601 con offset, tal como lo exige WSAA.
///
/// Ejemplo de salida: `2026-07-07T10:56:00-03:00`.
pub fn format_iso8601(dt: &DateTime<FixedOffset>) -> String {
    dt.format("%Y-%m-%dT%H:%M:%S%:z").to_string()
}

/// Parsea una fecha ISO 8601 con offset proveniente de una respuesta de ARCA.
pub fn parse_iso8601(value: &str) -> ArcaResult<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(value.trim())
        .map_err(|e| ArcaError::InvalidResponse(format!("fecha ISO 8601 inválida '{value}': {e}")))
}

/// Genera un `uniqueId` para el TRA basado en el epoch en segundos.
///
/// Es monótono a escala de segundos; combinado con `generationTime` alcanza
/// para que ARCA no lo considere duplicado en el uso normal.
pub fn unique_id() -> ArcaResult<u32> {
    let secs = Utc::now().timestamp();
    u32::try_from(secs & 0xFFFF_FFFF)
        .map_err(|_| ArcaError::Internal("no se pudo derivar un uniqueId".to_string()))
}

/// Recorta un texto para incluirlo de forma segura en mensajes de error/log.
///
/// Evita volcar cuerpos enormes y no incluye credenciales porque quien llama
/// decide qué texto pasar (nunca se le pasan token/sign/clave).
pub fn truncate_for_log(text: &str, max: usize) -> String {
    let trimmed = text.trim();
    if trimmed.len() <= max {
        trimmed.to_string()
    } else {
        let mut end = max;
        while end > 0 && !trimmed.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…", &trimmed[..end])
    }
}
