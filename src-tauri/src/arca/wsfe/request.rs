//! Construcción de cuerpos SOAP para métodos WSFEv1.

use quick_xml::events::{BytesEnd, BytesStart, Event};
use quick_xml::Writer;

use crate::arca::errors::{ArcaError, ArcaResult};
use crate::arca::models::WsfeAuth;
use crate::arca::wsfe::models::{FeCaeSolicitud, FeCompConsultaReq};
use crate::arca::xml::write_text_element;

const SOAP_ACTION_BASE: &str = "http://ar.gov.afip.dif.FEV1/";

pub fn soap_action(method: &str) -> String {
    format!("{SOAP_ACTION_BASE}{method}")
}

fn writer_to_string(writer: Writer<Vec<u8>>) -> ArcaResult<String> {
    String::from_utf8(writer.into_inner()).map_err(ArcaError::from)
}

/// Escribe el nodo `<ar:Auth>` común a todos los métodos autenticados.
fn write_auth(writer: &mut Writer<Vec<u8>>, auth: &WsfeAuth) -> ArcaResult<()> {
    writer.write_event(Event::Start(BytesStart::new("ar:Auth")))?;
    write_text_element(writer, "ar:Token", &auth.token)?;
    write_text_element(writer, "ar:Sign", &auth.sign)?;
    write_text_element(writer, "ar:Cuit", &auth.cuit.to_string())?;
    writer.write_event(Event::End(BytesEnd::new("ar:Auth")))?;
    Ok(())
}

/// `<ar:FEDummy/>`
pub fn build_fe_dummy() -> ArcaResult<String> {
    let mut writer = Writer::new(Vec::new());
    writer.write_event(Event::Start(BytesStart::new("ar:FEDummy")))?;
    writer.write_event(Event::End(BytesEnd::new("ar:FEDummy")))?;
    writer_to_string(writer)
}

/// `<ar:FECompUltimoAutorizado>`
pub fn build_fe_comp_ultimo_autorizado(
    auth: &WsfeAuth,
    pto_vta: u32,
    cbte_tipo: u32,
) -> ArcaResult<String> {
    let mut writer = Writer::new(Vec::new());
    writer.write_event(Event::Start(BytesStart::new("ar:FECompUltimoAutorizado")))?;
    write_auth(&mut writer, auth)?;
    write_text_element(&mut writer, "ar:PtoVta", &pto_vta.to_string())?;
    write_text_element(&mut writer, "ar:CbteTipo", &cbte_tipo.to_string())?;
    writer.write_event(Event::End(BytesEnd::new("ar:FECompUltimoAutorizado")))?;
    writer_to_string(writer)
}

/// `<ar:FECAESolicitar>` con cabecera y un detalle.
pub fn build_fe_cae_solicitar_body(auth: &WsfeAuth, req: &FeCaeSolicitud) -> ArcaResult<String> {
    let mut writer = Writer::new(Vec::new());
    writer.write_event(Event::Start(BytesStart::new("ar:FECAESolicitar")))?;
    write_auth(&mut writer, auth)?;

    writer.write_event(Event::Start(BytesStart::new("ar:FeCAEReq")))?;

    // Cabecera
    writer.write_event(Event::Start(BytesStart::new("ar:FeCabReq")))?;
    write_text_element(&mut writer, "ar:CantReg", &req.cab.cant_reg.to_string())?;
    write_text_element(&mut writer, "ar:PtoVta", &req.cab.pto_vta.to_string())?;
    write_text_element(&mut writer, "ar:CbteTipo", &req.cab.cbte_tipo.to_string())?;
    writer.write_event(Event::End(BytesEnd::new("ar:FeCabReq")))?;

    // Detalle
    writer.write_event(Event::Start(BytesStart::new("ar:FeDetReq")))?;
    writer.write_event(Event::Start(BytesStart::new("ar:FECAEDetRequest")))?;
    let d = &req.det;
    write_text_element(&mut writer, "ar:Concepto", &d.concepto.to_string())?;
    write_text_element(&mut writer, "ar:DocTipo", &d.doc_tipo.to_string())?;
    write_text_element(&mut writer, "ar:DocNro", &d.doc_nro.to_string())?;
    write_text_element(
        &mut writer,
        "ar:CondicionIVAReceptor",
        &d.condicion_iva_receptor.to_string(),
    )?;
    write_text_element(&mut writer, "ar:CbteDesde", &d.cbte_desde.to_string())?;
    write_text_element(&mut writer, "ar:CbteHasta", &d.cbte_hasta.to_string())?;
    write_text_element(&mut writer, "ar:CbteFch", &d.cbte_fch)?;
    write_text_element(&mut writer, "ar:ImpTotal", &format_amount(d.imp_total))?;
    write_text_element(&mut writer, "ar:ImpTotConc", &format_amount(d.imp_tot_conc))?;
    write_text_element(&mut writer, "ar:ImpNeto", &format_amount(d.imp_neto))?;
    write_text_element(&mut writer, "ar:ImpOpEx", &format_amount(d.imp_op_ex))?;
    write_text_element(&mut writer, "ar:ImpTrib", &format_amount(d.imp_trib))?;
    write_text_element(&mut writer, "ar:ImpIVA", &format_amount(d.imp_iva))?;
    write_text_element(&mut writer, "ar:MonId", &d.mon_id)?;
    write_text_element(&mut writer, "ar:MonCotiz", &format_amount(d.mon_cotiz))?;

    if !d.iva.is_empty() {
        writer.write_event(Event::Start(BytesStart::new("ar:Iva")))?;
        for alic in &d.iva {
            writer.write_event(Event::Start(BytesStart::new("ar:AlicIva")))?;
            write_text_element(&mut writer, "ar:Id", &alic.id.to_string())?;
            write_text_element(&mut writer, "ar:BaseImp", &format_amount(alic.base_imp))?;
            write_text_element(&mut writer, "ar:Importe", &format_amount(alic.importe))?;
            writer.write_event(Event::End(BytesEnd::new("ar:AlicIva")))?;
        }
        writer.write_event(Event::End(BytesEnd::new("ar:Iva")))?;
    }

    writer.write_event(Event::End(BytesEnd::new("ar:FECAEDetRequest")))?;
    writer.write_event(Event::End(BytesEnd::new("ar:FeDetReq")))?;

    writer.write_event(Event::End(BytesEnd::new("ar:FeCAEReq")))?;
    writer.write_event(Event::End(BytesEnd::new("ar:FECAESolicitar")))?;
    writer_to_string(writer)
}

/// `<ar:FECompConsultar>`
pub fn build_fe_comp_consultar(
    auth: &WsfeAuth,
    pto_vta: u32,
    req: &FeCompConsultaReq,
) -> ArcaResult<String> {
    let mut writer = Writer::new(Vec::new());
    writer.write_event(Event::Start(BytesStart::new("ar:FECompConsultar")))?;
    write_auth(&mut writer, auth)?;
    writer.write_event(Event::Start(BytesStart::new("ar:FeCompConsReq")))?;
    write_text_element(&mut writer, "ar:CbteTipo", &req.cbte_tipo.to_string())?;
    write_text_element(&mut writer, "ar:CbteNro", &req.cbte_nro.to_string())?;
    writer.write_event(Event::End(BytesEnd::new("ar:FeCompConsReq")))?;
    write_text_element(&mut writer, "ar:PtoVta", &pto_vta.to_string())?;
    writer.write_event(Event::End(BytesEnd::new("ar:FECompConsultar")))?;
    writer_to_string(writer)
}

/// Métodos paramétricos sin parámetros adicionales.
pub fn build_param_get(auth: &WsfeAuth, method: &str) -> ArcaResult<String> {
    let mut writer = Writer::new(Vec::new());
    let tag = format!("ar:{method}");
    writer.write_event(Event::Start(BytesStart::new(tag.as_str())))?;
    write_auth(&mut writer, auth)?;
    writer.write_event(Event::End(BytesEnd::new(tag.as_str())))?;
    writer_to_string(writer)
}

/// `<ar:FEParamGetCotizacion>`
pub fn build_param_get_cotizacion(auth: &WsfeAuth, mon_id: &str) -> ArcaResult<String> {
    let mut writer = Writer::new(Vec::new());
    writer.write_event(Event::Start(BytesStart::new("ar:FEParamGetCotizacion")))?;
    write_auth(&mut writer, auth)?;
    write_text_element(&mut writer, "ar:MonId", mon_id)?;
    writer.write_event(Event::End(BytesEnd::new("ar:FEParamGetCotizacion")))?;
    writer_to_string(writer)
}

/// Formatea importes con hasta 2 decimales (ARCA exige punto decimal).
pub fn format_amount(v: f64) -> String {
    format!("{:.2}", v)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::arca::models::WsfeAuth;
    use crate::arca::wsfe::models::{FeCabReq, FeCaeSolicitud, FeDetReq};

    fn test_auth() -> WsfeAuth {
        WsfeAuth {
            token: "TOKEN".into(),
            sign: "SIGN".into(),
            cuit: 20_304_050_607,
        }
    }

    #[test]
    fn build_cae_solicitar_incluye_campos_obligatorios() {
        let req = FeCaeSolicitud {
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
                imp_total: 1000.0,
                imp_tot_conc: 0.0,
                imp_neto: 1000.0,
                imp_op_ex: 0.0,
                imp_trib: 0.0,
                imp_iva: 0.0,
                mon_id: "PES".into(),
                mon_cotiz: 1.0,
                condicion_iva_receptor: 5,
                iva: vec![],
            },
        };
        let xml = build_fe_cae_solicitar_body(&test_auth(), &req).unwrap();
        assert!(xml.contains("FECAESolicitar"));
        assert!(xml.contains("<ar:CbteTipo>11</ar:CbteTipo>"));
        assert!(xml.contains("<ar:CondicionIVAReceptor>5</ar:CondicionIVAReceptor>"));
        assert!(xml.contains("<ar:ImpTotal>1000.00</ar:ImpTotal>"));
        assert!(xml.contains("<ar:MonId>PES</ar:MonId>"));
    }
}
