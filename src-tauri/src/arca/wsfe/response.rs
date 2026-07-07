//! Parseo de respuestas SOAP de WSFEv1.

use crate::arca::errors::{ArcaError, ArcaResult};
use crate::arca::models::DummyStatus;
use crate::arca::wsfe::models::{
    CotizacionMoneda, FeCabResp, FeCaeRespuesta, FeCompConsultaResp, FeDetResp, FeMessage,
    FeResultado, TipoComprobante, TipoDocumento, TipoIva, TipoMoneda,
};
use crate::arca::xml::{
    collect_wsfe_messages, contains_element, find_first_text, require_text, WsfeMessage,
};

fn wsfe_messages(msgs: Vec<WsfeMessage>) -> Vec<FeMessage> {
    msgs.into_iter()
        .map(|m| FeMessage {
            code: m.code,
            msg: m.msg,
        })
        .collect()
}

fn parse_f64_opt(s: &str) -> Option<f64> {
    s.trim().parse().ok()
}

fn parse_u32(s: &str, field: &str) -> ArcaResult<u32> {
    s.trim()
        .parse()
        .map_err(|e| ArcaError::InvalidResponse(format!("{field} no numérico: {e}")))
}

fn parse_u64(s: &str, field: &str) -> ArcaResult<u64> {
    s.trim()
        .parse()
        .map_err(|e| ArcaError::InvalidResponse(format!("{field} no numérico: {e}")))
}

/// Si hay bloque `<Errors>` a nivel raíz, falla antes de parsear el resultado.
pub fn ensure_no_wsfe_errors(xml: &[u8]) -> ArcaResult<()> {
    if !contains_element(xml, "Errors")? {
        return Ok(());
    }
    let errs = collect_wsfe_messages(xml, "Err", "Code", "Msg")?;
    if errs.is_empty() {
        let code = find_first_text(xml, "Code")?.unwrap_or_else(|| "?".into());
        let msg = find_first_text(xml, "Msg")?.unwrap_or_else(|| "Error WSFE".into());
        return Err(ArcaError::Authentication(format!("WSFE [{code}]: {msg}")));
    }
    let detail: Vec<String> = errs
        .iter()
        .map(|e| format!("[{}] {}", e.code, e.msg))
        .collect();
    Err(ArcaError::Authentication(detail.join("; ")))
}

/// `FEDummy`
pub fn parse_fe_dummy(xml: &[u8]) -> ArcaResult<DummyStatus> {
    Ok(DummyStatus {
        app_server: find_first_text(xml, "AppServer")?.unwrap_or_default(),
        db_server: find_first_text(xml, "DbServer")?.unwrap_or_default(),
        auth_server: find_first_text(xml, "AuthServer")?.unwrap_or_default(),
    })
}

/// `FECompUltimoAutorizado`
pub fn parse_fe_comp_ultimo_autorizado(xml: &[u8]) -> ArcaResult<i64> {
    ensure_no_wsfe_errors(xml)?;
    let cbte_nro = require_text(xml, "CbteNro")?;
    cbte_nro
        .trim()
        .parse::<i64>()
        .map_err(|e| ArcaError::InvalidResponse(format!("CbteNro inválido: {e}")))
}

/// `FECAESolicitar`
pub fn parse_fe_cae_solicitar(xml: &[u8]) -> ArcaResult<FeCaeRespuesta> {
    ensure_no_wsfe_errors(xml)?;

    let resultado_cab = find_first_text(xml, "Resultado")?
        .map(|s| FeResultado::from_arca(&s))
        .unwrap_or(FeResultado::Rechazado);

    let cab = FeCabResp {
        cuit: parse_u64(&require_text(xml, "Cuit")?, "Cuit")?,
        pto_vta: parse_u32(&require_text(xml, "PtoVta")?, "PtoVta")?,
        cbte_tipo: parse_u32(&require_text(xml, "CbteTipo")?, "CbteTipo")?,
        fch_proceso: find_first_text(xml, "FchProceso")?.unwrap_or_default(),
        cant_reg: parse_u32(
            &find_first_text(xml, "CantReg")?.unwrap_or_else(|| "1".into()),
            "CantReg",
        )?,
        resultado: resultado_cab,
        reproceso: find_first_text(xml, "Reproceso")?.unwrap_or_else(|| "N".into()),
    };

    let det_resultado = find_all_texts_in_det(xml, "Resultado")
        .into_iter()
        .last()
        .map(|s| FeResultado::from_arca(&s))
        .unwrap_or(FeResultado::Rechazado);

    let det = FeDetResp {
        concepto: parse_u32(
            &find_in_fecaedet(xml, "Concepto")?.unwrap_or_else(|| "1".into()),
            "Concepto",
        )?,
        doc_tipo: parse_u32(
            &find_in_fecaedet(xml, "DocTipo")?.unwrap_or_else(|| "99".into()),
            "DocTipo",
        )?,
        doc_nro: parse_u64(
            &find_in_fecaedet(xml, "DocNro")?.unwrap_or_else(|| "0".into()),
            "DocNro",
        )?,
        cbte_desde: parse_u64(
            &find_in_fecaedet(xml, "CbteDesde")?.unwrap_or_else(|| "0".into()),
            "CbteDesde",
        )?,
        cbte_hasta: parse_u64(
            &find_in_fecaedet(xml, "CbteHasta")?.unwrap_or_else(|| "0".into()),
            "CbteHasta",
        )?,
        cbte_fch: find_in_fecaedet(xml, "CbteFch")?.unwrap_or_default(),
        resultado: det_resultado,
        cae: find_in_fecaedet(xml, "CAE")?,
        cae_fch_vto: find_in_fecaedet(xml, "CAEFchVto")?,
        observaciones: wsfe_messages(collect_wsfe_messages(xml, "Obs", "Code", "Msg")?),
    };

    let errores = wsfe_messages(collect_wsfe_messages(xml, "Err", "Code", "Msg")?);
    let eventos = wsfe_messages(collect_wsfe_messages(xml, "Evt", "Code", "Msg")?);

    Ok(FeCaeRespuesta {
        cab,
        det,
        errores,
        eventos,
    })
}

/// Busca texto dentro del primer bloque `FECAEDetResponse`.
fn find_in_fecaedet(xml: &[u8], local: &str) -> ArcaResult<Option<String>> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_reader(xml);
    let mut buf = Vec::new();
    let det_target = b"FECAEDetResponse";
    let field_target = local.as_bytes();
    let mut in_det = false;
    let mut depth: u32 = 0;
    let mut capturing = false;
    let mut acc = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if in_det {
                    depth += 1;
                    if depth == 1 && e.local_name().as_ref() == field_target {
                        capturing = true;
                        acc.clear();
                    }
                } else if e.local_name().as_ref() == det_target {
                    in_det = true;
                    depth = 0;
                }
            }
            Ok(Event::Text(t)) if capturing => {
                let piece = t.unescape().map_err(ArcaError::from)?;
                acc.push_str(piece.as_ref());
            }
            Ok(Event::End(e)) if in_det => {
                if depth == 0 && e.local_name().as_ref() == det_target {
                    return Ok(None);
                }
                if capturing && depth == 1 && e.local_name().as_ref() == field_target {
                    return Ok(Some(acc));
                }
                if depth > 0 {
                    depth = depth.saturating_sub(1);
                }
            }
            Ok(Event::Eof) => return Ok(None),
            Err(e) => return Err(ArcaError::Xml(e.to_string())),
            _ => {}
        }
        buf.clear();
    }
}

fn find_all_texts_in_det(xml: &[u8], local: &str) -> Vec<String> {
    find_in_fecaedet(xml, local)
        .ok()
        .flatten()
        .into_iter()
        .collect()
}

/// `FECompConsultar`
pub fn parse_fe_comp_consultar(xml: &[u8]) -> ArcaResult<FeCompConsultaResp> {
    ensure_no_wsfe_errors(xml)?;
    let resultado = find_first_text(xml, "Resultado")?
        .map(|s| FeResultado::from_arca(&s))
        .unwrap_or(FeResultado::Rechazado);
    let imp = find_first_text(xml, "ImpTotal")?;
    Ok(FeCompConsultaResp {
        resultado,
        cae: find_first_text(xml, "CodAutorizacion")?.or(find_first_text(xml, "CAE")?),
        cae_fch_vto: find_first_text(xml, "FchVto")?.or(find_first_text(xml, "CAEFchVto")?),
        cbte_fch: find_first_text(xml, "CbteFch")?,
        imp_total: imp.and_then(|s| parse_f64_opt(&s)),
        observaciones: wsfe_messages(collect_wsfe_messages(xml, "Obs", "Code", "Msg")?),
        errores: wsfe_messages(collect_wsfe_messages(xml, "Err", "Code", "Msg")?),
    })
}

/// Parsea lista paramétrica `CbteTipo`.
pub fn parse_tipos_cbte(xml: &[u8]) -> ArcaResult<Vec<TipoComprobante>> {
    ensure_no_wsfe_errors(xml)?;
    parse_param_items(xml, "CbteTipo", |id, desc, desde, hasta| TipoComprobante {
        id,
        desc,
        fch_desde: desde,
        fch_hasta: hasta,
    })
}

pub fn parse_tipos_doc(xml: &[u8]) -> ArcaResult<Vec<TipoDocumento>> {
    ensure_no_wsfe_errors(xml)?;
    parse_param_items(xml, "DocTipo", |id, desc, desde, hasta| TipoDocumento {
        id,
        desc,
        fch_desde: desde,
        fch_hasta: hasta,
    })
}

pub fn parse_tipos_iva(xml: &[u8]) -> ArcaResult<Vec<TipoIva>> {
    ensure_no_wsfe_errors(xml)?;
    parse_param_items(xml, "IvaTipo", |id, desc, desde, hasta| TipoIva {
        id,
        desc,
        fch_desde: desde,
        fch_hasta: hasta,
    })
}

pub fn parse_tipos_monedas(xml: &[u8]) -> ArcaResult<Vec<TipoMoneda>> {
    ensure_no_wsfe_errors(xml)?;
    parse_param_monedas(xml)
}

pub fn parse_cotizacion(xml: &[u8]) -> ArcaResult<CotizacionMoneda> {
    ensure_no_wsfe_errors(xml)?;
    let mon_id = require_text(xml, "MonId")?;
    let mon_cotiz = require_text(xml, "MonCotiz")?;
    Ok(CotizacionMoneda {
        mon_id,
        mon_cotiz: parse_f64_opt(&mon_cotiz).unwrap_or(1.0),
        fch_cotiz: find_first_text(xml, "FchCotiz")?,
    })
}

fn parse_param_items<T, F>(xml: &[u8], item_tag: &str, map: F) -> ArcaResult<Vec<T>>
where
    F: Fn(u32, String, Option<String>, Option<String>) -> T,
{
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_reader(xml);
    let mut buf = Vec::new();
    let target = item_tag.as_bytes();
    let mut out = Vec::new();
    let mut in_item = false;
    let mut depth: u32 = 0;
    let mut id = String::new();
    let mut desc = String::new();
    let mut desde = String::new();
    let mut hasta = String::new();
    let mut field: Option<&str> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if in_item {
                    depth += 1;
                    if depth == 1 {
                        let ln = e.local_name();
                        let name = std::str::from_utf8(ln.as_ref()).unwrap_or("");
                        field = Some(match name {
                            "Id" => {
                                id.clear();
                                "Id"
                            }
                            "Desc" => {
                                desc.clear();
                                "Desc"
                            }
                            "FchDesde" => {
                                desde.clear();
                                "FchDesde"
                            }
                            "FchHasta" => {
                                hasta.clear();
                                "FchHasta"
                            }
                            _ => "",
                        });
                        if field == Some("") {
                            field = None;
                        }
                    }
                } else if e.local_name().as_ref() == target {
                    in_item = true;
                    depth = 0;
                    id.clear();
                    desc.clear();
                    desde.clear();
                    hasta.clear();
                    field = None;
                }
            }
            Ok(Event::Text(t)) if in_item && field.is_some() => {
                let piece = t.unescape().map_err(ArcaError::from)?;
                match field {
                    Some("Id") => id.push_str(piece.as_ref()),
                    Some("Desc") => desc.push_str(piece.as_ref()),
                    Some("FchDesde") => desde.push_str(piece.as_ref()),
                    Some("FchHasta") => hasta.push_str(piece.as_ref()),
                    _ => {}
                }
            }
            Ok(Event::End(e)) if in_item => {
                if depth == 0 && e.local_name().as_ref() == target {
                    if let Ok(id_num) = id.trim().parse::<u32>() {
                        out.push(map(
                            id_num,
                            desc.clone(),
                            if desde.is_empty() {
                                None
                            } else {
                                Some(desde.clone())
                            },
                            if hasta.is_empty() {
                                None
                            } else {
                                Some(hasta.clone())
                            },
                        ));
                    }
                    in_item = false;
                } else if depth > 0 {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        field = None;
                    }
                }
            }
            Ok(Event::Eof) => return Ok(out),
            Err(e) => return Err(ArcaError::Xml(e.to_string())),
            _ => {}
        }
        buf.clear();
    }
}

fn parse_param_monedas(xml: &[u8]) -> ArcaResult<Vec<TipoMoneda>> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_reader(xml);
    let mut buf = Vec::new();
    let mut out = Vec::new();
    let mut in_item = false;
    let mut depth: u32 = 0;
    let mut id = String::new();
    let mut desc = String::new();
    let mut field: Option<&str> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if in_item {
                    depth += 1;
                    if depth == 1 {
                        match e.local_name().as_ref() {
                            b"Id" => {
                                id.clear();
                                field = Some("Id");
                            }
                            b"Desc" => {
                                desc.clear();
                                field = Some("Desc");
                            }
                            _ => field = None,
                        }
                    }
                } else if e.local_name().as_ref() == b"Moneda" {
                    in_item = true;
                    depth = 0;
                }
            }
            Ok(Event::Text(t)) if in_item && field.is_some() => {
                let piece = t.unescape().map_err(ArcaError::from)?;
                match field {
                    Some("Id") => id.push_str(piece.as_ref()),
                    Some("Desc") => desc.push_str(piece.as_ref()),
                    _ => {}
                }
            }
            Ok(Event::End(e)) if in_item => {
                if depth == 0 && e.local_name().as_ref() == b"Moneda" {
                    if !id.is_empty() {
                        out.push(TipoMoneda {
                            id: id.clone(),
                            desc: desc.clone(),
                            fch_desde: None,
                            fch_hasta: None,
                        });
                    }
                    in_item = false;
                } else if depth > 0 {
                    depth = depth.saturating_sub(1);
                }
            }
            Ok(Event::Eof) => return Ok(out),
            Err(e) => return Err(ArcaError::Xml(e.to_string())),
            _ => {}
        }
        buf.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CAE_APROBADO: &str = r#"<?xml version="1.0"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <FECAESolicitarResponse>
          <FECAESolicitarResult>
            <FeCabResp>
              <Cuit>20304050607</Cuit>
              <PtoVta>1</PtoVta>
              <CbteTipo>11</CbteTipo>
              <FchProceso>20260707120000</FchProceso>
              <CantReg>1</CantReg>
              <Resultado>A</Resultado>
              <Reproceso>N</Reproceso>
            </FeCabResp>
            <FeDetResp>
              <FECAEDetResponse>
                <Concepto>1</Concepto>
                <DocTipo>99</DocTipo>
                <DocNro>0</DocNro>
                <CbteDesde>1</CbteDesde>
                <CbteHasta>1</CbteHasta>
                <CbteFch>20260707</CbteFch>
                <Resultado>A</Resultado>
                <CAE>71234567890123</CAE>
                <CAEFchVto>20260717</CAEFchVto>
                <Observaciones>
                  <Obs><Code>10245</Code><Msg>Observacion informativa</Msg></Obs>
                </Observaciones>
              </FECAEDetResponse>
            </FeDetResp>
          </FECAESolicitarResult>
        </FECAESolicitarResponse>
      </soap:Body>
    </soap:Envelope>"#;

    const CAE_RECHAZADO: &str = r#"<?xml version="1.0"?>
    <Envelope><Body><Result>
      <Errors><Err><Code>600</Code><Msg>Validacion de token fallo</Msg></Err></Errors>
    </Result></Body></Envelope>"#;

    #[test]
    fn parse_cae_aprobado_con_observaciones() {
        let r = parse_fe_cae_solicitar(CAE_APROBADO.as_bytes()).unwrap();
        assert!(r.aprobado());
        assert_eq!(r.det.cae.as_deref(), Some("71234567890123"));
        assert_eq!(r.det.observaciones.len(), 1);
        assert_eq!(r.det.observaciones[0].code, "10245");
    }

    #[test]
    fn parse_cae_rechazado_falla() {
        assert!(parse_fe_cae_solicitar(CAE_RECHAZADO.as_bytes()).is_err());
    }
}
