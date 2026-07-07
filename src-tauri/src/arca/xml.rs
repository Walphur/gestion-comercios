//! Construcción y parseo de XML con `quick-xml`.
//!
//! Regla del módulo: **nunca** parseamos XML con búsquedas de texto ni regex.
//! Todo se procesa con el lector de eventos de `quick-xml`, comparando por
//! *local name* (ignorando el prefijo de namespace, que ARCA no fija).

use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::reader::Reader;
use quick_xml::writer::Writer;

use crate::arca::errors::{ArcaError, ArcaResult};
use crate::arca::models::Tra;
use crate::arca::utils::format_iso8601;

/// Escribe `<name>text</name>` en el `Writer`, escapando el texto.
pub fn write_text_element(writer: &mut Writer<Vec<u8>>, name: &str, text: &str) -> ArcaResult<()> {
    writer.write_event(Event::Start(BytesStart::new(name)))?;
    writer.write_event(Event::Text(BytesText::new(text)))?;
    writer.write_event(Event::End(BytesEnd::new(name)))?;
    Ok(())
}

/// Construye el XML del TRA exactamente en el formato que exige WSAA.
///
/// ```xml
/// <?xml version="1.0" encoding="UTF-8"?>
/// <loginTicketRequest version="1.0">
///   <header>
///     <uniqueId>...</uniqueId>
///     <generationTime>...</generationTime>
///     <expirationTime>...</expirationTime>
///   </header>
///   <service>wsfe</service>
/// </loginTicketRequest>
/// ```
pub fn build_tra_xml(tra: &Tra) -> ArcaResult<String> {
    let mut writer = Writer::new(Vec::new());

    writer.write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None)))?;

    let mut root = BytesStart::new("loginTicketRequest");
    root.push_attribute(("version", "1.0"));
    writer.write_event(Event::Start(root))?;

    writer.write_event(Event::Start(BytesStart::new("header")))?;
    write_text_element(&mut writer, "uniqueId", &tra.unique_id.to_string())?;
    write_text_element(
        &mut writer,
        "generationTime",
        &format_iso8601(&tra.generation_time),
    )?;
    write_text_element(
        &mut writer,
        "expirationTime",
        &format_iso8601(&tra.expiration_time),
    )?;
    writer.write_event(Event::End(BytesEnd::new("header")))?;

    write_text_element(&mut writer, "service", &tra.service)?;

    writer.write_event(Event::End(BytesEnd::new("loginTicketRequest")))?;

    let bytes = writer.into_inner();
    String::from_utf8(bytes).map_err(ArcaError::from)
}

/// Devuelve el texto del primer elemento cuyo *local name* coincide con `local`.
///
/// Recorre los eventos del documento; al encontrar un `Start` con el nombre
/// buscado, acumula el/los `Text` hasta el `End` correspondiente. El texto se
/// devuelve **desescapado** (entidades XML resueltas).
pub fn find_first_text(xml: &[u8], local: &str) -> ArcaResult<Option<String>> {
    let mut reader = Reader::from_reader(xml);
    let mut buf = Vec::new();
    let target = local.as_bytes();

    let mut capturing = false;
    let mut depth: u32 = 0;
    let mut acc = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if capturing {
                    depth += 1;
                } else if e.local_name().as_ref() == target {
                    capturing = true;
                    depth = 0;
                    acc.clear();
                }
            }
            Ok(Event::Text(t)) if capturing => {
                let piece = t.unescape().map_err(ArcaError::from)?;
                acc.push_str(piece.as_ref());
            }
            Ok(Event::CData(t)) if capturing => {
                let bytes = t.into_inner();
                let text = String::from_utf8(bytes.into_owned()).map_err(ArcaError::from)?;
                acc.push_str(&text);
            }
            Ok(Event::End(e)) if capturing => {
                if depth == 0 && e.local_name().as_ref() == target {
                    return Ok(Some(acc));
                }
                depth = depth.saturating_sub(1);
            }
            Ok(Event::Eof) => return Ok(None),
            Err(e) => return Err(ArcaError::Xml(e.to_string())),
            _ => {}
        }
        buf.clear();
    }
}

/// Igual que [`find_first_text`] pero exige que el elemento exista.
pub fn require_text(xml: &[u8], local: &str) -> ArcaResult<String> {
    find_first_text(xml, local)?
        .ok_or_else(|| ArcaError::InvalidResponse(format!("falta el elemento <{local}>")))
}

/// Detecta y parsea un `soap:Fault`.
///
/// Devuelve `Some((code, message))` si el documento contiene un `Fault`, o
/// `None` en caso contrario. Soporta SOAP 1.1 (`faultcode`/`faultstring`) y
/// SOAP 1.2 (`Code`/`Reason` → se toma el texto disponible).
pub fn parse_soap_fault(xml: &[u8]) -> ArcaResult<Option<(String, String)>> {
    // Presencia del nodo Fault (por local name).
    if find_first_text(xml, "Fault")?.is_none() && !contains_element(xml, "Fault")? {
        return Ok(None);
    }

    let code = find_first_text(xml, "faultcode")?
        .or(find_first_text(xml, "Value")?)
        .unwrap_or_else(|| "Fault".to_string());

    let message = find_first_text(xml, "faultstring")?
        .or(find_first_text(xml, "Text")?)
        .or(find_first_text(xml, "Reason")?)
        .unwrap_or_else(|| "SOAP Fault sin descripción".to_string());

    Ok(Some((code, message)))
}

/// Indica si existe al menos un elemento con el *local name* dado.
pub fn contains_element(xml: &[u8], local: &str) -> ArcaResult<bool> {
    let mut reader = Reader::from_reader(xml);
    let mut buf = Vec::new();
    let target = local.as_bytes();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                if e.local_name().as_ref() == target {
                    return Ok(true);
                }
            }
            Ok(Event::Eof) => return Ok(false),
            Err(e) => return Err(ArcaError::Xml(e.to_string())),
            _ => {}
        }
        buf.clear();
    }
}
