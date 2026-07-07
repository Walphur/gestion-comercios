//! Carga de configuración ARCA persistida (settings cifrados).

use crate::arca::{ArcaConfig, ArcaEnvironment};
use crate::db_manager::DbManager;
use crate::settings_util::{read_setting, read_setting_flag};

const K_CUIT: &str = "arca_cuit";
const K_PV: &str = "arca_punto_venta";
const K_AMB: &str = "arca_ambiente";
const K_CERT: &str = "arca_cert_enc";
const K_KEY: &str = "arca_key_enc";
const K_SIM: &str = "arca_simulation";
const K_CBTE_TIPO: &str = "arca_cbte_tipo";

/// ¿Modo simulación activo? (no consume servicios ARCA reales).
pub fn is_simulation_mode() -> bool {
    DbManager::with_connection(|conn| Ok(read_setting_flag(conn, K_SIM))).unwrap_or(false)
}

/// Tipo de comprobante por defecto (11 = Factura C).
pub fn default_cbte_tipo() -> u32 {
    DbManager::with_connection(|conn| {
        Ok(read_setting(conn, K_CBTE_TIPO)
            .and_then(|s| s.parse().ok())
            .unwrap_or(11))
    })
    .unwrap_or(11)
}

/// ¿Hay configuración ARCA mínima guardada?
pub fn is_configured() -> bool {
    DbManager::with_connection(|conn| {
        let cuit = read_setting(conn, K_CUIT).filter(|s| !s.trim().is_empty());
        let cert = read_setting(conn, K_CERT);
        let key = read_setting(conn, K_KEY);
        Ok(cuit.is_some() && cert.is_some() && key.is_some())
    })
    .unwrap_or(false)
}

/// Reconstruye [`ArcaConfig`] desde la base de datos.
pub fn load_arca_config() -> Result<ArcaConfig, String> {
    let (cuit, pv, amb, cert_enc, key_enc) = DbManager::with_connection(|conn| {
        let cuit = read_setting(conn, K_CUIT)
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| "Falta el CUIT.".to_string())?;
        let pv = read_setting(conn, K_PV)
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| "Falta el punto de venta.".to_string())?;
        let amb = read_setting(conn, K_AMB).unwrap_or_else(|| "homo".to_string());
        let cert_enc =
            read_setting(conn, K_CERT).ok_or_else(|| "Falta el certificado.".to_string())?;
        let key_enc =
            read_setting(conn, K_KEY).ok_or_else(|| "Falta la clave privada.".to_string())?;
        Ok((cuit, pv, amb, cert_enc, key_enc))
    })?;

    let cuit_num: u64 = cuit
        .trim()
        .parse()
        .map_err(|_| "El CUIT almacenado es inválido.".to_string())?;
    let pv_num: u32 = pv
        .trim()
        .parse()
        .map_err(|_| "El punto de venta almacenado es inválido.".to_string())?;

    let cert_pem = crate::arca::secrets::decrypt_secret(&cert_enc)?;
    let key_pem = crate::arca::secrets::decrypt_secret(&key_enc)?;

    let environment = if amb == "prod" {
        ArcaEnvironment::Produccion
    } else {
        ArcaEnvironment::Homologacion
    };

    ArcaConfig::new(cuit_num, pv_num, cert_pem, key_pem, environment).map_err(|e| e.to_string())
}
