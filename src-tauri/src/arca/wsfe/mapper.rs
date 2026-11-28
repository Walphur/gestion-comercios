//! Mapeo de ventas locales → solicitud FECAESolicitar (A/B/C + NC/ND).

use crate::arca::cbte_tipo::{
    FACTURA_A, FACTURA_B, FACTURA_C, NC_A, NC_B, NC_C, ND_A, ND_B, ND_C,
};
use crate::arca::config::ArcaConfig;
use crate::arca::errors::{ArcaError, ArcaResult};
use crate::arca::utils::now_ar;
use crate::arca::wsfe::models::{
    AlicIva, CbteAsoc, FeCabReq, FeCaeSolicitud, FeDetReq, SaleInvoiceInput, SaleLineTax,
};
use crate::arca::wsfe::validation::{
    CONCEPTO_PRODUCTOS, CONDICION_IVA_CF, CONDICION_IVA_RI, DOC_TIPO_CF, DOC_TIPO_CUIT,
    DOC_TIPO_DNI, MONEDA_PES,
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

/// Mapea alícuota % → Id AlicIva de WSFE.
pub fn tax_rate_to_iva_id(rate: f64) -> u32 {
    let r = (rate * 10.0).round() / 10.0;
    if (r - 21.0).abs() < 0.05 {
        5
    } else if (r - 10.5).abs() < 0.05 {
        4
    } else if (r - 27.0).abs() < 0.05 {
        6
    } else if (r - 5.0).abs() < 0.05 {
        8
    } else if (r - 2.5).abs() < 0.05 {
        9
    } else if r.abs() < 0.05 {
        3
    } else {
        IVA_21_ID
    }
}

fn digits_only(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_digit()).collect()
}

/// DocTipo + DocNro a partir del cliente.
pub fn resolve_receptor_doc(
    doc_raw: Option<&str>,
    iva_condition: Option<u32>,
) -> (u32, u64) {
    let digits = doc_raw.map(digits_only).unwrap_or_default();
    if digits.is_empty() {
        return (DOC_TIPO_CF, 0);
    }
    let nro: u64 = digits.parse().unwrap_or(0);
    if nro == 0 {
        return (DOC_TIPO_CF, 0);
    }
    if digits.len() == 11 {
        return (DOC_TIPO_CUIT, nro);
    }
    if digits.len() >= 7 && digits.len() <= 8 {
        return (DOC_TIPO_DNI, nro);
    }
    if iva_condition == Some(CONDICION_IVA_RI) {
        return (DOC_TIPO_CUIT, nro);
    }
    (DOC_TIPO_DNI, nro)
}

/// Resuelve Factura A/B/C según emisor y cliente.
pub fn resolve_factura_tipo(
    emisor_iva: &str,
    customer_iva: Option<u32>,
    customer_doc: Option<&str>,
) -> u32 {
    let emisor = emisor_iva.trim().to_lowercase();
    if emisor != "ri" {
        return FACTURA_C;
    }
    let digits = customer_doc.map(digits_only).unwrap_or_default();
    if customer_iva == Some(CONDICION_IVA_RI) && digits.len() == 11 {
        return FACTURA_A;
    }
    FACTURA_B
}

fn letter_family(cbte: u32) -> char {
    match cbte {
        FACTURA_A | ND_A | NC_A => 'A',
        FACTURA_B | ND_B | NC_B => 'B',
        _ => 'C',
    }
}

/// NC/ND del mismo libro que el comprobante original.
pub fn adjustment_cbte_tipo(original: u32, credit: bool) -> u32 {
    match (letter_family(original), credit) {
        ('A', true) => NC_A,
        ('A', false) => ND_A,
        ('B', true) => NC_B,
        ('B', false) => ND_B,
        (_, true) => NC_C,
        (_, false) => ND_C,
    }
}

fn is_factura_c_family(cbte: u32) -> bool {
    matches!(cbte, FACTURA_C | NC_C | ND_C)
}

fn is_factura_a_family(cbte: u32) -> bool {
    matches!(cbte, FACTURA_A | NC_A | ND_A)
}

fn needs_associated(cbte: u32) -> bool {
    matches!(cbte, NC_A | NC_B | NC_C | ND_A | ND_B | ND_C)
}

fn build_iva_alicuotas(total: f64, lines: &[SaleLineTax]) -> (f64, f64, Vec<AlicIva>) {
    if lines.is_empty() {
        let imp_total = round2(total);
        let base = round2(imp_total / 1.21);
        let iva = round2(imp_total - base);
        return (
            base,
            iva,
            vec![AlicIva {
                id: IVA_21_ID,
                base_imp: base,
                importe: iva,
            }],
        );
    }

    // Agrupar por Id de alícuota. Los precios de venta se tratan como IVA incluido.
    use std::collections::BTreeMap;
    let mut by_id: BTreeMap<u32, (f64, f64)> = BTreeMap::new();
    let mut sum_lines = 0.0_f64;
    for line in lines {
        let gross = round2(line.line_total);
        sum_lines += gross;
        let rate = if line.tax_rate > 0.0 {
            line.tax_rate
        } else {
            21.0
        };
        let id = tax_rate_to_iva_id(rate);
        let base = round2(gross / (1.0 + rate / 100.0));
        let iva = round2(gross - base);
        let entry = by_id.entry(id).or_insert((0.0, 0.0));
        entry.0 = round2(entry.0 + base);
        entry.1 = round2(entry.1 + iva);
    }

    // Escalar si hay descuento global y el total de venta difiere de la suma de líneas.
    let target = round2(total);
    let scale = if sum_lines > 0.0 && (sum_lines - target).abs() > 0.02 {
        target / sum_lines
    } else {
        1.0
    };

    let mut alic = Vec::new();
    let mut neto = 0.0;
    let mut iva_sum = 0.0;
    for (id, (base, iva)) in by_id {
        let b = round2(base * scale);
        let i = round2(iva * scale);
        neto = round2(neto + b);
        iva_sum = round2(iva_sum + i);
        alic.push(AlicIva {
            id,
            base_imp: b,
            importe: i,
        });
    }
    // Ajuste de centavos: ImpNeto + ImpIVA debe cerrar con ImpTotal.
    let diff = round2(target - neto - iva_sum);
    if diff.abs() >= 0.01 {
        if let Some(last) = alic.last_mut() {
            last.importe = round2(last.importe + diff);
            iva_sum = round2(iva_sum + diff);
        }
    }
    (neto, iva_sum, alic)
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
        cbtes_asoc: vec![],
    }
}

fn map_factura_con_iva(
    total: f64,
    doc_tipo: u32,
    doc_nro: u64,
    nro: u64,
    cbte_fch: &str,
    condicion_iva: u32,
    lines: &[SaleLineTax],
) -> FeDetReq {
    let imp_total = round2(total);
    let (neto, iva, alic) = build_iva_alicuotas(imp_total, lines);
    FeDetReq {
        concepto: CONCEPTO_PRODUCTOS,
        doc_tipo,
        doc_nro,
        cbte_desde: nro,
        cbte_hasta: nro,
        cbte_fch: cbte_fch.to_string(),
        imp_total,
        imp_tot_conc: 0.0,
        imp_neto: neto,
        imp_op_ex: 0.0,
        imp_trib: 0.0,
        imp_iva: iva,
        mon_id: MONEDA_PES.into(),
        mon_cotiz: 1.0,
        condicion_iva_receptor: condicion_iva,
        iva: alic,
        cbtes_asoc: vec![],
    }
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
        _ => resolve_receptor_doc(
            sale.customer_doc_raw.as_deref(),
            sale.customer_iva_condition,
        ),
    };

    if needs_associated(sale.cbte_tipo) && sale.cbtes_asoc.is_empty() {
        return Err(ArcaError::Config(
            "las notas de crédito/débito requieren el comprobante asociado".into(),
        ));
    }

    if is_factura_a_family(sale.cbte_tipo) {
        if doc_tipo != DOC_TIPO_CUIT || doc_nro == 0 {
            return Err(ArcaError::Config(
                "Factura A / NC-ND A exige CUIT del cliente (11 dígitos)".into(),
            ));
        }
        let cond = sale.customer_iva_condition.unwrap_or(CONDICION_IVA_RI);
        if cond != CONDICION_IVA_RI {
            return Err(ArcaError::Config(
                "Factura A requiere cliente IVA Responsable Inscripto".into(),
            ));
        }
    }

    let mut det = if is_factura_c_family(sale.cbte_tipo) {
        let (dt, dn) = if doc_tipo == DOC_TIPO_CF {
            (DOC_TIPO_CF, 0)
        } else {
            (doc_tipo, doc_nro)
        };
        map_factura_c(sale.total, dt, dn, next_cbte_nro, &cbte_fch)
    } else if is_factura_a_family(sale.cbte_tipo) {
        map_factura_con_iva(
            sale.total,
            doc_tipo,
            doc_nro,
            next_cbte_nro,
            &cbte_fch,
            sale.customer_iva_condition.unwrap_or(CONDICION_IVA_RI),
            &sale.lines,
        )
    } else if matches!(sale.cbte_tipo, FACTURA_B | NC_B | ND_B) {
        let cond = sale
            .customer_iva_condition
            .unwrap_or(CONDICION_IVA_CF);
        let (dt, dn) = if cond == CONDICION_IVA_CF || doc_tipo == DOC_TIPO_CF {
            (DOC_TIPO_CF, 0)
        } else {
            (doc_tipo, doc_nro)
        };
        map_factura_con_iva(
            sale.total,
            dt,
            dn,
            next_cbte_nro,
            &cbte_fch,
            cond,
            &sale.lines,
        )
    } else {
        return Err(ArcaError::Config(format!(
            "tipo de comprobante {} no implementado en el mapper",
            sale.cbte_tipo
        )));
    };

    det.cbtes_asoc = sale.cbtes_asoc.clone();

    let _ = config; // pto_vta sale de config en cabecera
    Ok(FeCaeSolicitud {
        cab: FeCabReq {
            cant_reg: 1,
            pto_vta: config.punto_venta(),
            cbte_tipo: sale.cbte_tipo,
        },
        det,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::arca::config::ArcaEnvironment;

    fn cfg() -> ArcaConfig {
        ArcaConfig::new(
            20_304_050_607,
            3,
            "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
            "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
            ArcaEnvironment::Homologacion,
        )
        .unwrap()
    }

    #[test]
    fn factura_c_sin_iva() {
        let det = map_factura_c(121.0, 99, 0, 5, "20260707");
        assert_eq!(det.imp_total, 121.0);
        assert_eq!(det.imp_iva, 0.0);
        assert!(det.iva.is_empty());
    }

    #[test]
    fn factura_b_discrimina_iva_21() {
        let det = map_factura_con_iva(121.0, 99, 0, 1, "20260707", CONDICION_IVA_CF, &[]);
        assert_eq!(det.imp_total, 121.0);
        assert_eq!(det.imp_neto, 100.0);
        assert_eq!(det.imp_iva, 21.0);
        assert_eq!(det.iva.len(), 1);
    }

    #[test]
    fn resolve_a_para_ri_con_cuit() {
        assert_eq!(
            resolve_factura_tipo("ri", Some(CONDICION_IVA_RI), Some("20304050607")),
            FACTURA_A
        );
        assert_eq!(
            resolve_factura_tipo("ri", Some(CONDICION_IVA_CF), Some("20304050607")),
            FACTURA_B
        );
        assert_eq!(resolve_factura_tipo("monotributo", None, None), FACTURA_C);
    }

    #[test]
    fn map_factura_a_exige_cuit() {
        let sale = SaleInvoiceInput {
            sale_id: 1,
            total: 121.0,
            subtotal: 121.0,
            discount_pct: 0.0,
            payment_method: "efectivo".into(),
            created_at: "2026-07-07 12:00:00".into(),
            customer_doc_tipo: Some(DOC_TIPO_CUIT),
            customer_doc_nro: Some(20_304_050_607),
            customer_doc_raw: Some("20304050607".into()),
            customer_iva_condition: Some(CONDICION_IVA_RI),
            emisor_iva: "ri".into(),
            cbte_tipo: FACTURA_A,
            lines: vec![],
            cbtes_asoc: vec![],
        };
        let req = map_sale_to_cae_request(&cfg(), &sale, 2).unwrap();
        assert_eq!(req.cab.cbte_tipo, FACTURA_A);
        assert_eq!(req.det.doc_tipo, DOC_TIPO_CUIT);
        assert_eq!(req.det.condicion_iva_receptor, CONDICION_IVA_RI);
        assert!(!req.det.iva.is_empty());
    }

    #[test]
    fn nc_requiere_asociado() {
        let sale = SaleInvoiceInput {
            sale_id: 2,
            total: 121.0,
            subtotal: 121.0,
            discount_pct: 0.0,
            payment_method: "efectivo".into(),
            created_at: "2026-07-07 12:00:00".into(),
            customer_doc_tipo: Some(99),
            customer_doc_nro: Some(0),
            customer_doc_raw: None,
            customer_iva_condition: Some(CONDICION_IVA_CF),
            emisor_iva: "ri".into(),
            cbte_tipo: NC_B,
            lines: vec![],
            cbtes_asoc: vec![],
        };
        assert!(map_sale_to_cae_request(&cfg(), &sale, 3).is_err());
    }

    #[test]
    fn nc_b_con_asociado_ok() {
        let sale = SaleInvoiceInput {
            sale_id: 2,
            total: 121.0,
            subtotal: 121.0,
            discount_pct: 0.0,
            payment_method: "efectivo".into(),
            created_at: "2026-07-07 12:00:00".into(),
            customer_doc_tipo: Some(99),
            customer_doc_nro: Some(0),
            customer_doc_raw: None,
            customer_iva_condition: Some(CONDICION_IVA_CF),
            emisor_iva: "ri".into(),
            cbte_tipo: NC_B,
            lines: vec![],
            cbtes_asoc: vec![CbteAsoc {
                tipo: FACTURA_B,
                pto_vta: 3,
                nro: 1,
                cuit: Some(20_304_050_607),
                cbte_fch: Some("20260707".into()),
            }],
        };
        let req = map_sale_to_cae_request(&cfg(), &sale, 4).unwrap();
        assert_eq!(req.det.cbtes_asoc.len(), 1);
        assert_eq!(req.cab.cbte_tipo, NC_B);
    }

    #[test]
    fn adjustment_tipos() {
        assert_eq!(adjustment_cbte_tipo(FACTURA_A, true), NC_A);
        assert_eq!(adjustment_cbte_tipo(FACTURA_B, false), ND_B);
        assert_eq!(adjustment_cbte_tipo(FACTURA_C, true), NC_C);
    }
}
