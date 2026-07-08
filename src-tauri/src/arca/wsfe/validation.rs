//! Validación previa al envío: nunca mandar solicitudes inválidas a ARCA.

use chrono::NaiveDate;

use crate::arca::config::ArcaConfig;
use crate::arca::errors::{ArcaError, ArcaResult};
use crate::arca::wsfe::models::{FeCaeSolicitud, FeDetReq};

/// Documento consumidor final (sin identificar).
pub const DOC_TIPO_CF: u32 = 99;

/// Condición frente al IVA del receptor: Consumidor Final (RG 5615).
pub const CONDICION_IVA_CF: u32 = 5;

/// Moneda pesos argentinos.
pub const MONEDA_PES: &str = "PES";

/// Concepto productos.
pub const CONCEPTO_PRODUCTOS: u32 = 1;

/// Valida la solicitud de CAE y la configuración antes de enviar a WSFE.
pub fn validate_cae_request(config: &ArcaConfig, req: &FeCaeSolicitud) -> ArcaResult<()> {
    validate_cuit(config.cuit())?;
    validate_punto_venta(config.punto_venta(), req.cab.pto_vta)?;
    validate_cbte_tipo(req.cab.cbte_tipo)?;
    validate_fecha_cbte(&req.det.cbte_fch)?;
    validate_doc(req.det.doc_tipo, req.det.doc_nro)?;
    validate_condicion_iva_receptor(req.det.condicion_iva_receptor)?;
    validate_moneda(&req.det.mon_id, req.det.mon_cotiz)?;
    validate_importes(&req.det)?;
    validate_numeracion(req.det.cbte_desde, req.det.cbte_hasta)?;
    if req.cab.cant_reg != 1 {
        return Err(ArcaError::Config(
            "solo se admite un comprobante por solicitud".into(),
        ));
    }
    Ok(())
}

pub fn validate_cuit(cuit: u64) -> ArcaResult<()> {
    if !(10_000_000_000..=99_999_999_999).contains(&cuit) {
        return Err(ArcaError::Config("el CUIT debe tener 11 dígitos".into()));
    }
    Ok(())
}

pub fn validate_punto_venta(config_pv: u32, req_pv: u32) -> ArcaResult<()> {
    if config_pv == 0 {
        return Err(ArcaError::Config("punto de venta no configurado".into()));
    }
    if config_pv != req_pv {
        return Err(ArcaError::Config(format!(
            "el punto de venta de la solicitud ({req_pv}) no coincide con la configuración ({config_pv})"
        )));
    }
    Ok(())
}

pub fn validate_cbte_tipo(cbte_tipo: u32) -> ArcaResult<()> {
    match cbte_tipo {
        1 | 6 | 11 | 3 | 8 | 13 => Ok(()),
        _ => Err(ArcaError::Config(format!(
            "tipo de comprobante {cbte_tipo} no soportado en esta versión"
        ))),
    }
}

pub fn validate_fecha_cbte(fch: &str) -> ArcaResult<()> {
    if fch.len() != 8 || !fch.chars().all(|c| c.is_ascii_digit()) {
        return Err(ArcaError::Config(format!(
            "fecha de comprobante inválida '{fch}' (debe ser AAAAMMDD)"
        )));
    }
    let y: i32 = fch[0..4]
        .parse()
        .map_err(|_| ArcaError::Config("año inválido".into()))?;
    let m: u32 = fch[4..6]
        .parse()
        .map_err(|_| ArcaError::Config("mes inválido".into()))?;
    let d: u32 = fch[6..8]
        .parse()
        .map_err(|_| ArcaError::Config("día inválido".into()))?;
    NaiveDate::from_ymd_opt(y, m, d)
        .ok_or_else(|| ArcaError::Config(format!("fecha de comprobante inválida '{fch}'")))?;
    Ok(())
}

pub fn validate_doc(doc_tipo: u32, doc_nro: u64) -> ArcaResult<()> {
    if doc_tipo == DOC_TIPO_CF {
        if doc_nro != 0 {
            return Err(ArcaError::Config(
                "consumidor final debe tener DocNro = 0".into(),
            ));
        }
        return Ok(());
    }
    if doc_nro == 0 {
        return Err(ArcaError::Config(
            "el número de documento del receptor no puede ser cero".into(),
        ));
    }
    Ok(())
}

pub fn validate_condicion_iva_receptor(condicion: u32) -> ArcaResult<()> {
    // Códigos habituales de FEParamGetCondicionIvaReceptor (RG 5615).
    match condicion {
        1 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 13 => Ok(()),
        _ => Err(ArcaError::Config(format!(
            "condición IVA del receptor {condicion} no soportada"
        ))),
    }
}

pub fn validate_moneda(mon_id: &str, cotiz: f64) -> ArcaResult<()> {
    if mon_id != MONEDA_PES {
        return Err(ArcaError::Config(format!(
            "moneda '{mon_id}' no soportada; use {MONEDA_PES}"
        )));
    }
    if cotiz <= 0.0 {
        return Err(ArcaError::Config("la cotización debe ser positiva".into()));
    }
    Ok(())
}

pub fn validate_importes(det: &FeDetReq) -> ArcaResult<()> {
    if det.imp_total <= 0.0 {
        return Err(ArcaError::Config(
            "el importe total debe ser mayor a cero".into(),
        ));
    }
    if det.imp_total < 0.0 || det.imp_neto < 0.0 {
        return Err(ArcaError::Config(
            "los importes no pueden ser negativos".into(),
        ));
    }

    // Factura B (tipo 6): neto + IVA ≈ total
    if det.imp_iva > 0.0 {
        let iva_sum: f64 = det.iva.iter().map(|a| a.importe).sum();
        if (iva_sum - det.imp_iva).abs() > 0.02 {
            return Err(ArcaError::Config(
                "la suma de alícuotas de IVA no coincide con ImpIVA".into(),
            ));
        }
        let neto_sum: f64 = det.iva.iter().map(|a| a.base_imp).sum();
        if (neto_sum - det.imp_neto).abs() > 0.02 {
            return Err(ArcaError::Config(
                "la base imponible no coincide con las alícuotas de IVA".into(),
            ));
        }
        let total_calc =
            det.imp_neto + det.imp_iva + det.imp_tot_conc + det.imp_op_ex + det.imp_trib;
        if (total_calc - det.imp_total).abs() > 0.02 {
            return Err(ArcaError::Config(format!(
                "ImpTotal ({}) no coincide con neto+IVA ({total_calc})",
                det.imp_total
            )));
        }
    }

    Ok(())
}

pub fn validate_numeracion(desde: u64, hasta: u64) -> ArcaResult<()> {
    if desde == 0 || hasta == 0 {
        return Err(ArcaError::Config(
            "el número de comprobante debe ser mayor a cero".into(),
        ));
    }
    if desde != hasta {
        return Err(ArcaError::Config(
            "CbteDesde y CbteHasta deben ser iguales para un solo comprobante".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::arca::wsfe::models::{FeCabReq, FeCaeSolicitud, FeDetReq};

    fn sample_req() -> FeCaeSolicitud {
        FeCaeSolicitud {
            cab: FeCabReq {
                cant_reg: 1,
                pto_vta: 1,
                cbte_tipo: 11,
            },
            det: FeDetReq {
                concepto: 1,
                doc_tipo: 99,
                doc_nro: 0,
                cbte_desde: 1,
                cbte_hasta: 1,
                cbte_fch: "20260707".into(),
                imp_total: 100.0,
                imp_tot_conc: 0.0,
                imp_neto: 100.0,
                imp_op_ex: 0.0,
                imp_trib: 0.0,
                imp_iva: 0.0,
                mon_id: "PES".into(),
                mon_cotiz: 1.0,
                condicion_iva_receptor: CONDICION_IVA_CF,
                iva: vec![],
            },
        }
    }

    #[test]
    fn valida_solicitud_correcta() {
        let cfg = ArcaConfig::new(
            20_304_050_607,
            1,
            "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
            "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
            crate::arca::config::ArcaEnvironment::Homologacion,
        )
        .unwrap();
        assert!(validate_cae_request(&cfg, &sample_req()).is_ok());
    }

    #[test]
    fn rechaza_total_cero() {
        let cfg = ArcaConfig::new(
            20_304_050_607,
            1,
            "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
            "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
            crate::arca::config::ArcaEnvironment::Homologacion,
        )
        .unwrap();
        let mut req = sample_req();
        req.det.imp_total = 0.0;
        assert!(validate_cae_request(&cfg, &req).is_err());
    }
}
