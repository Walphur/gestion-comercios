//! Emisión fiscal: integración ventas ↔ WSFEv1 ARCA.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::arca::soap::http_client;
use crate::arca::{
    emitir_desde_venta, is_simulation_mode, load_arca_config, shared_token_cache, SaleInvoiceInput,
};
use crate::settings_util::{read_setting, write_setting};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FiscalMessage {
    pub code: String,
    pub msg: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FiscalResult {
    pub voucher_type: String,
    pub voucher_number: String,
    pub cbte_tipo: u32,
    pub cbte_nro: u64,
    pub cae: String,
    pub cae_expires_at: String,
    pub resultado: String,
    pub qr_payload: String,
    pub observaciones: Vec<FiscalMessage>,
    pub errores: Vec<FiscalMessage>,
    pub eventos: Vec<FiscalMessage>,
    pub raw_response: String,
    pub simulated: bool,
}

fn cbte_tipo_label(cbte_tipo: u32) -> String {
    match cbte_tipo {
        1 | 2 | 3 => "A".into(),
        6 | 7 | 8 => "B".into(),
        11 | 12 | 13 => "C".into(),
        _ => format!("T{cbte_tipo}"),
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FiscalEnqueueOverride {
    pub cbte_tipo: Option<u32>,
    pub parent_sale_id: Option<i64>,
    pub adjustment_kind: Option<String>,
    pub total: Option<f64>,
}

fn map_messages(msgs: &[crate::arca::wsfe::FeMessage]) -> Vec<FiscalMessage> {
    msgs.iter()
        .map(|m| FiscalMessage {
            code: m.code.clone(),
            msg: m.msg.clone(),
        })
        .collect()
}

fn build_qr_payload(
    cuit: u64,
    cbte_tipo: u32,
    pto_vta: u32,
    cbte_nro: u64,
    total: f64,
    cae: &str,
) -> String {
    format!(
        "https://www.afip.gob.ar/fe/qr/?p={{\"ver\":1,\"fecha\":\"\",\"cuit\":{cuit},\"ptoVta\":{pto_vta},\"tipoCmp\":{cbte_tipo},\"nroCmp\":{cbte_nro},\"importe\":{total:.2},\"moneda\":\"PES\",\"ctz\":1,\"tipoCodAut\":\"E\",\"codAut\":{cae}}}"
    )
}

fn load_emisor_iva(conn: &Connection) -> String {
    if let Some(v) = read_setting(conn, "arca_emisor_iva") {
        let t = v.trim().to_lowercase();
        if t == "ri" || t == "monotributo" || t == "exento" {
            return t;
        }
    }
    match read_setting(conn, "arca_cbte_tipo")
        .and_then(|s| s.trim().parse::<u32>().ok())
        .unwrap_or(11)
    {
        1 | 6 => "ri".into(),
        _ => "monotributo".into(),
    }
}

fn load_sale_invoice_input(
    conn: &Connection,
    sale_id: i64,
    ov: &FiscalEnqueueOverride,
) -> Result<SaleInvoiceInput, String> {
    let (total, subtotal, discount_pct, payment, created_at): (f64, f64, f64, String, String) =
        conn.query_row(
            "SELECT total, subtotal, discount_pct, payment_method, created_at
             FROM sales WHERE id = ?1 AND voided = 0",
            [sale_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .map_err(|e| format!("Venta {sale_id} no encontrada: {e}"))?;

    let (doc_raw, iva_cond): (Option<String>, Option<u32>) = conn
        .query_row(
            "SELECT c.document, c.iva_condition FROM sales s
             LEFT JOIN customers c ON c.id = s.customer_id
             WHERE s.id = ?1",
            [sale_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((None, None));

    let emisor_iva = load_emisor_iva(conn);
    let (doc_tipo, doc_nro) = {
        let (t, n) = crate::arca::wsfe::mapper::resolve_receptor_doc(
            doc_raw.as_deref(),
            iva_cond,
        );
        if t == 99 {
            (None, None)
        } else {
            (Some(t), Some(n))
        }
    };

    let mut lines: Vec<crate::arca::wsfe::SaleLineTax> = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT si.line_total, COALESCE(p.tax_rate, 21)
                 FROM sale_items si
                 LEFT JOIN products p ON p.id = si.product_id
                 WHERE si.sale_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([sale_id], |r| {
                Ok(crate::arca::wsfe::SaleLineTax {
                    line_total: r.get(0)?,
                    tax_rate: r.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            lines.push(row.map_err(|e| e.to_string())?);
        }
    }

    let mut cbtes_asoc = Vec::new();
    let mut cbte_tipo = ov.cbte_tipo.unwrap_or_else(|| {
        crate::arca::wsfe::mapper::resolve_factura_tipo(
            &emisor_iva,
            iva_cond,
            doc_raw.as_deref(),
        )
    });

    if let Some(parent_id) = ov.parent_sale_id {
        let parent: Result<(u32, u64, Option<String>), _> = conn.query_row(
            "SELECT cbte_tipo, cbte_nro, cae_expires_at FROM fiscal_documents
             WHERE sale_id = ?1 AND cae IS NOT NULL AND TRIM(cae) != ''
             ORDER BY id DESC LIMIT 1",
            [parent_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        );
        let (p_tipo, p_nro, _) = parent.map_err(|_| {
            format!("No hay factura con CAE para la venta {parent_id}")
        })?;
        let pto = read_setting(conn, "arca_punto_venta")
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(1);
        let cuit = read_setting(conn, "arca_cuit")
            .and_then(|s| {
                let d: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
                d.parse().ok()
            });
        let parent_created: String = conn
            .query_row(
                "SELECT created_at FROM sales WHERE id = ?1",
                [parent_id],
                |r| r.get(0),
            )
            .unwrap_or_else(|_| created_at.clone());
        let fch = crate::arca::wsfe::mapper::sale_date_to_cbte_fch(&parent_created)
            .unwrap_or_else(|_| {
                crate::arca::wsfe::mapper::today_cbte_fch().unwrap_or_else(|_| "20260101".into())
            });
        let credit = ov
            .adjustment_kind
            .as_deref()
            .map(|k| k != "debit")
            .unwrap_or(true);
        cbte_tipo = ov
            .cbte_tipo
            .unwrap_or_else(|| crate::arca::wsfe::mapper::adjustment_cbte_tipo(p_tipo, credit));
        cbtes_asoc.push(crate::arca::wsfe::CbteAsoc {
            tipo: p_tipo,
            pto_vta: pto,
            nro: p_nro,
            cuit,
            cbte_fch: Some(fch),
        });
    }

    Ok(SaleInvoiceInput {
        sale_id,
        total: ov.total.unwrap_or(total).abs(),
        subtotal,
        discount_pct,
        payment_method: payment,
        created_at,
        customer_doc_tipo: doc_tipo,
        customer_doc_nro: doc_nro,
        customer_doc_raw: doc_raw,
        customer_iva_condition: iva_cond,
        emisor_iva,
        cbte_tipo,
        lines,
        cbtes_asoc,
    })
}

/// Solicita CAE a ARCA para una venta (real o simulación).
///
/// Importante: la llamada de red se hace **sin** mantener el lock global de la
/// base. Solo se toma la conexión brevemente para leer los datos de la venta.
pub fn request_fiscal_invoice(
    sale_id: i64,
    ov: FiscalEnqueueOverride,
) -> Result<FiscalResult, String> {
    if !crate::arca::is_configured() {
        return Err(
            "ARCA no está configurado. Completá CUIT, punto de venta y certificado en Administración."
                .into(),
        );
    }

    let sale = crate::db_manager::DbManager::with_connection(|conn| {
        load_sale_invoice_input(conn, sale_id, &ov)
    })?;
    let config = load_arca_config()?;
    let simulation = is_simulation_mode();
    let http = http_client().map_err(|e| e.to_string())?;
    let cache = shared_token_cache();

    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    let resp = rt
        .block_on(emitir_desde_venta(
            &config,
            &http,
            cache.as_ref(),
            sale.clone(),
            simulation,
        ))
        .map_err(|e| e.to_string())?;

    let pto_vta = config.punto_venta();
    let voucher_number = resp.numero_formateado(pto_vta);
    let cae = resp
        .det
        .cae
        .clone()
        .ok_or_else(|| "ARCA no devolvió CAE".to_string())?;
    let cae_vto = resp.det.cae_fch_vto.clone().unwrap_or_default();

    let raw = serde_json::to_string(&resp).map_err(|e| e.to_string())?;

    // Registrar última comunicación exitosa (lock breve, ya fuera de la red).
    let _ = crate::db_manager::DbManager::with_connection(|c| {
        write_setting(c, "arca_last_ok_at", &chrono_lite_now())
    });

    Ok(FiscalResult {
        voucher_type: cbte_tipo_label(sale.cbte_tipo),
        voucher_number,
        cbte_tipo: sale.cbte_tipo,
        cbte_nro: resp.det.cbte_desde,
        cae: cae.clone(),
        cae_expires_at: cae_vto,
        resultado: resp.det.resultado.as_str().to_string(),
        qr_payload: build_qr_payload(
            config.cuit(),
            sale.cbte_tipo,
            pto_vta,
            resp.det.cbte_desde,
            sale.total,
            &cae,
        ),
        observaciones: map_messages(&resp.det.observaciones),
        errores: map_messages(&resp.errores),
        eventos: map_messages(&resp.eventos),
        raw_response: raw,
        simulated: simulation,
    })
}

fn chrono_lite_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}

pub fn persist_fiscal_result(
    sale_id: i64,
    result: &FiscalResult,
    ov: &FiscalEnqueueOverride,
) -> Result<(), String> {
    let obs_json = serde_json::to_string(&result.observaciones).map_err(|e| e.to_string())?;
    let err_json = serde_json::to_string(&result.errores).map_err(|e| e.to_string())?;
    let evt_json = serde_json::to_string(&result.eventos).map_err(|e| e.to_string())?;

    crate::db_manager::DbManager::with_connection(|conn| {
        // Si ya hay doc de factura para esta venta, UPDATE; si es NC/ND o primero, INSERT.
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM fiscal_documents WHERE sale_id = ?1
                 AND (adjustment_kind IS NULL OR TRIM(adjustment_kind) = '')
                 LIMIT 1",
                [sale_id],
                |r| r.get(0),
            )
            .ok();

        let is_adjustment = ov.parent_sale_id.is_some()
            || ov
                .adjustment_kind
                .as_ref()
                .map(|k| !k.is_empty())
                .unwrap_or(false);

        if let Some(id) = existing.filter(|_| !is_adjustment) {
            conn.execute(
                "UPDATE fiscal_documents SET
                   voucher_type=?2, voucher_number=?3, cbte_tipo=?4, cbte_nro=?5,
                   cae=?6, cae_expires_at=?7, resultado=?8, observaciones=?9,
                   errores=?10, eventos=?11, qr_payload=?12, raw_response=?13, simulated=?14
                 WHERE id=?1",
                params![
                    id,
                    result.voucher_type,
                    result.voucher_number,
                    result.cbte_tipo,
                    result.cbte_nro,
                    result.cae,
                    result.cae_expires_at,
                    result.resultado,
                    obs_json,
                    err_json,
                    evt_json,
                    result.qr_payload,
                    result.raw_response,
                    if result.simulated { 1 } else { 0 },
                ],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO fiscal_documents
               (sale_id, voucher_type, voucher_number, cbte_tipo, cbte_nro, cae, cae_expires_at,
                resultado, observaciones, errores, eventos, qr_payload, raw_response, simulated,
                parent_sale_id, adjustment_kind)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
                params![
                    sale_id,
                    result.voucher_type,
                    result.voucher_number,
                    result.cbte_tipo,
                    result.cbte_nro,
                    result.cae,
                    result.cae_expires_at,
                    result.resultado,
                    obs_json,
                    err_json,
                    evt_json,
                    result.qr_payload,
                    result.raw_response,
                    if result.simulated { 1 } else { 0 },
                    ov.parent_sale_id,
                    ov.adjustment_kind,
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        conn.execute(
            "UPDATE sales SET fiscal_status = 'completed' WHERE id = ?1",
            [sale_id],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    })
}

/// Consulta un comprobante ya emitido en ARCA.
pub fn consultar_comprobante(
    cbte_tipo: u32,
    cbte_nro: u64,
) -> Result<crate::arca::wsfe::FeCompConsultaResp, String> {
    use crate::arca::wsfe::{FeCompConsultaReq, WsfeService};
    use crate::arca::WsfeAuth;

    let config = load_arca_config()?;
    let http = http_client().map_err(|e| e.to_string())?;
    let cache = shared_token_cache();
    let simulation = is_simulation_mode();
    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    rt.block_on(async {
        let ticket = crate::arca::auth::autenticar(&http, &config, cache.as_ref())
            .await
            .map_err(|e| e.to_string())?;
        let auth = WsfeAuth::from_ticket(&ticket, config.cuit());
        WsfeService::new(&config, &http)
            .with_simulation(simulation)
            .fe_comp_consultar(
                &auth,
                &FeCompConsultaReq {
                    cbte_tipo,
                    cbte_nro,
                },
            )
            .await
            .map_err(|e| e.to_string())
    })
}

/// Devuelve el comprobante fiscal persistido para una venta (reimpresión / consulta local).
pub fn obtener_fiscal_documento(
    conn: &Connection,
    sale_id: i64,
) -> Result<Option<FiscalResult>, String> {
    let row = conn.query_row(
        "SELECT voucher_type, voucher_number, cbte_tipo, cbte_nro, cae, cae_expires_at,
                    resultado, observaciones, errores, eventos, qr_payload, raw_response, simulated
             FROM fiscal_documents WHERE sale_id = ?1",
        [sale_id],
        |r| {
            let obs: String = r.get(7)?;
            let err: String = r.get(8)?;
            let evt: String = r.get(9)?;
            Ok(FiscalResult {
                voucher_type: r.get(0)?,
                voucher_number: r.get(1)?,
                cbte_tipo: r.get::<_, Option<u32>>(2)?.unwrap_or(11),
                cbte_nro: r.get::<_, Option<u64>>(3)?.unwrap_or(0),
                cae: r.get(4)?,
                cae_expires_at: r.get(5)?,
                resultado: r.get::<_, Option<String>>(6)?.unwrap_or_default(),
                qr_payload: r.get(10)?,
                raw_response: r.get(11)?,
                simulated: r.get::<_, i64>(12)? != 0,
                observaciones: serde_json::from_str(&obs).unwrap_or_default(),
                errores: serde_json::from_str(&err).unwrap_or_default(),
                eventos: serde_json::from_str(&evt).unwrap_or_default(),
            })
        },
    );

    match row {
        Ok(doc) => Ok(Some(doc)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Resumen de un comprobante emitido, para el listado de facturas.
#[derive(Debug, Serialize, Deserialize)]
pub struct FiscalDocResumen {
    pub sale_id: i64,
    pub voucher_type: String,
    pub voucher_number: String,
    pub cbte_tipo: u32,
    pub cbte_nro: u64,
    pub cae: String,
    pub cae_expires_at: String,
    pub resultado: String,
    pub simulated: bool,
    pub total: f64,
    pub customer_name: Option<String>,
    pub created_at: String,
    pub parent_sale_id: Option<i64>,
    pub adjustment_kind: Option<String>,
}

/// Lista los comprobantes emitidos (más recientes primero) con datos de la venta.
pub fn listar_fiscal_documentos(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<FiscalDocResumen>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT fd.sale_id, fd.voucher_type, fd.voucher_number, fd.cbte_tipo, fd.cbte_nro,
                    fd.cae, fd.cae_expires_at, fd.resultado, fd.simulated, fd.created_at,
                    s.total, c.name, fd.parent_sale_id, fd.adjustment_kind
             FROM fiscal_documents fd
             JOIN sales s ON s.id = fd.sale_id
             LEFT JOIN customers c ON c.id = s.customer_id
             ORDER BY fd.id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([limit], |r| {
            Ok(FiscalDocResumen {
                sale_id: r.get(0)?,
                voucher_type: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                voucher_number: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                cbte_tipo: r.get::<_, Option<u32>>(3)?.unwrap_or(0),
                cbte_nro: r.get::<_, Option<u64>>(4)?.unwrap_or(0),
                cae: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
                cae_expires_at: r.get::<_, Option<String>>(6)?.unwrap_or_default(),
                resultado: r.get::<_, Option<String>>(7)?.unwrap_or_default(),
                simulated: r.get::<_, i64>(8)? != 0,
                created_at: r.get(9)?,
                total: r.get(10)?,
                customer_name: r.get::<_, Option<String>>(11)?,
                parent_sale_id: r.get(12)?,
                adjustment_kind: r.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}
