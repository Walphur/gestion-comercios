//! Mapeo de ventas locales → solicitud FECAESolicitar.

use crate::arca::cbte_tipo::{FACTURA_B, FACTURA_C};
use crate::arca::config::ArcaConfig;
use crate::arca::errors::{ArcaError, ArcaResult};
use crate::arca::utils::now_ar;
use crate::arca::wsfe::models::{AlicIva, FeCabReq, FeCaeSolicitud, FeDetReq, SaleInvoiceInput};
use crate::arca::wsfe::validation::{
    CONCEPTO_PRODUCTOS, CONDICION_IVA_CF, DOC_TIPO_CF, MONEDA_PES,
};

/// IVA 21% (código WSFE).
const IVA_21_ID: u32 = 5;

/// Redondea a 2 decimales (centavos).
pub fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Convierte fecha de venta SQLite (`YYYY-MM-DD HH:MM:SS`) a `AAAAMMDD`.
pub fn sale_date_to_cbte_fch(created_at: &str) -> ArcaResult<String> {
    let date_part = created_at
        .trim()
        .get(0..10)
        .ok_or_else(|| ArcaError::Config(format!("fecha de venta inválida: '{created_at}'")))?;
    let normalized = date_part.replace('-', "");
    if normalized.len() != 8 {
        return Err(ArcaError::Config(format!(
            "no se pudo derivar CbteFch de '{created_at}'"
        )));
    }
    Ok(normalized)
}

/// Fecha de hoy en Argentina como `AAAAMMDD`.
pub fn today_cbte_fch() -> ArcaResult<String> {
    let now = now_ar()?;
    Ok(now.format("%Y%m%d").to_string())
}

/// Construye la solicitud de CAE a partir de una venta y el próximo número.
pub fn map_sale_to_cae_request(
    config: &ArcaConfig,
    sale: &SaleInvoiceInput,
    next_cbte_nro: u64,
) -> ArcaResult<FeCaeSolicitud> {
    let cbte_fch = sale_date_to_cbte_fch(&sale.created_at).or_else(|_| today_cbte_fch())?;
    let (doc_tipo, doc_nro) = match (sale.customer_doc_tipo, sale.customer_doc_nro) {
        (Some(t), Some(n)) => (t, n),
        _ => (DOC_TIPO_CF, 0),
    };

    let det = match sale.cbte_tipo {
        FACTURA_C => map_factura_c(sale.total, doc_tipo, doc_nro, next_cbte_nro, &cbte_fch),
        FACTURA_B => map_factura_b(sale.total, doc_tipo, doc_nro, next_cbte_nro, &cbte_fch),
        other => {
            return Err(ArcaError::Config(format!(
                "tipo de comprobante {other} no implementado en el mapper"
            )));
        }
    };

    Ok(FeCaeSolicitud {
        cab: FeCabReq {
            cant_reg: 1,
            pto_vta: config.punto_venta(),
            cbte_tipo: sale.cbte_tipo,
        },
        det,
    })
}

fn map_factura_c(total: f64, doc_tipo: u32, doc_nro: u64, nro: u64, cbte_fch: &str) -> FeDetReq {
    let imp = round2(total);
    FeDetReq {
        concepto: CONCEPTO_PRODUCTOS,
        doc_tipo,
        doc_nro,
        cbte_desde: nro,
        cbte_hasta: nro,
        cbte_fch: cbte_fch.to_string(),
        imp_total: imp,
        imp_tot_conc: 0.0,
        imp_neto: imp,
        imp_op_ex: 0.0,
        imp_trib: 0.0,
        imp_iva: 0.0,
        mon_id: MONEDA_PES.into(),
        mon_cotiz: 1.0,
        condicion_iva_receptor: CONDICION_IVA_CF,
        iva: vec![],
    }
}

fn map_factura_b(total: f64, doc_tipo: u32, doc_nro: u64, nro: u64, cbte_fch: &str) -> FeDetReq {
    let imp_total = round2(total);
    let base = round2(imp_total / 1.21);
    let iva = round2(imp_total - base);
    FeDetReq {
        concepto: CONCEPTO_PRODUCTOS,
        doc_tipo,
        doc_nro,
        cbte_desde: nro,
        cbte_hasta: nro,
        cbte_fch: cbte_fch.to_string(),
        imp_total,
        imp_tot_conc: 0.0,
        imp_neto: base,
        imp_op_ex: 0.0,
        imp_trib: 0.0,
        imp_iva: iva,
        mon_id: MONEDA_PES.into(),
        mon_cotiz: 1.0,
        condicion_iva_receptor: CONDICION_IVA_CF,
        iva: vec![AlicIva {
            id: IVA_21_ID,
            base_imp: base,
            importe: iva,
        }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn factura_c_sin_iva() {
        let det = map_factura_c(121.0, 99, 0, 5, "20260707");
        assert_eq!(det.imp_total, 121.0);
        assert_eq!(det.imp_iva, 0.0);
        assert!(det.iva.is_empty());
    }

    #[test]
    fn factura_b_discrimina_iva_21() {
        let det = map_factura_b(121.0, 99, 0, 1, "20260707");
        assert_eq!(det.imp_total, 121.0);
        assert_eq!(det.imp_neto, 100.0);
        assert_eq!(det.imp_iva, 21.0);
        assert_eq!(det.iva.len(), 1);
    }
}
