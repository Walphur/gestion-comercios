//! WSFEv1 — Web Service de Facturación Electrónica.
//!
//! En esta etapa se implementan por completo dos métodos:
//! - [`Wsfe::fe_dummy`]: verificación de disponibilidad (no requiere TA).
//! - [`Wsfe::fe_comp_ultimo_autorizado`]: último comprobante autorizado (requiere TA).
//!
//! El resto de los métodos del negocio (`FECAESolicitar`, `FECompConsultar`,
//! `FEParamGetTiposCbte`, `FEParamGetTiposDoc`, `FEParamGetTiposIva`) siguen
//! exactamente el mismo patrón: construir el fragmento con `quick-xml`,
//! envolverlo con [`build_wsfe_envelope`], enviarlo con [`send_soap`] usando la
//! `SOAPAction` del método y parsear la respuesta con los helpers de `xml.rs`.
//! Se implementarán cuando se aborde la emisión de comprobantes.

use quick_xml::events::{BytesEnd, BytesStart, Event};
use quick_xml::writer::Writer;
use reqwest::Client;

use crate::arca::config::ArcaConfig;
use crate::arca::errors::{ArcaError, ArcaResult};
use crate::arca::models::{DummyStatus, WsfeAuth};
use crate::arca::soap::{build_wsfe_envelope, send_soap};
use crate::arca::xml::{contains_element, find_first_text, require_text, write_text_element};

/// Prefijo de `SOAPAction` de todos los métodos de WSFEv1.
const SOAP_ACTION_BASE: &str = "http://ar.gov.afip.dif.FEV1/";

/// Cliente WSFEv1 ligado a una configuración y a un cliente HTTP compartido.
pub struct Wsfe<'a> {
    config: &'a ArcaConfig,
    client: &'a Client,
}

impl<'a> Wsfe<'a> {
    /// Crea un cliente WSFEv1.
    pub fn new(config: &'a ArcaConfig, client: &'a Client) -> Self {
        Self { config, client }
    }

    /// `FEDummy`: chequeo de disponibilidad de los subsistemas de ARCA.
    ///
    /// No requiere Ticket de Acceso; sirve como "ping" fiscal.
    pub async fn fe_dummy(&self) -> ArcaResult<DummyStatus> {
        let mut writer = Writer::new(Vec::new());
        writer.write_event(Event::Start(BytesStart::new("ar:FEDummy")))?;
        writer.write_event(Event::End(BytesEnd::new("ar:FEDummy")))?;
        let fragment = String::from_utf8(writer.into_inner()).map_err(ArcaError::from)?;

        let envelope = build_wsfe_envelope(&fragment);
        let action = format!("{SOAP_ACTION_BASE}FEDummy");
        let response = send_soap(
            self.client,
            self.config.environment().wsfe_url(),
            &action,
            envelope,
        )
        .await?;

        let bytes = response.as_bytes();
        Ok(DummyStatus {
            app_server: find_first_text(bytes, "AppServer")?.unwrap_or_default(),
            db_server: find_first_text(bytes, "DbServer")?.unwrap_or_default(),
            auth_server: find_first_text(bytes, "AuthServer")?.unwrap_or_default(),
        })
    }

    /// `FECompUltimoAutorizado`: número del último comprobante autorizado para
    /// un punto de venta y tipo de comprobante dados.
    ///
    /// Requiere las credenciales del TA. Devuelve `0` cuando aún no se emitió
    /// ningún comprobante de ese tipo (siguiente número a emitir = resultado+1).
    pub async fn fe_comp_ultimo_autorizado(
        &self,
        auth: &WsfeAuth,
        cbte_tipo: u32,
    ) -> ArcaResult<i64> {
        let fragment = self.build_ultimo_autorizado_body(auth, cbte_tipo)?;
        let envelope = build_wsfe_envelope(&fragment);
        let action = format!("{SOAP_ACTION_BASE}FECompUltimoAutorizado");
        let response = send_soap(
            self.client,
            self.config.environment().wsfe_url(),
            &action,
            envelope,
        )
        .await?;

        let bytes = response.as_bytes();
        ensure_no_wsfe_errors(bytes)?;

        let cbte_nro = require_text(bytes, "CbteNro")?;
        cbte_nro.trim().parse::<i64>().map_err(|e| {
            ArcaError::InvalidResponse(format!("CbteNro no numérico '{cbte_nro}': {e}"))
        })
    }

    /// Construye el cuerpo `<ar:FECompUltimoAutorizado>` con el nodo `<ar:Auth>`.
    fn build_ultimo_autorizado_body(&self, auth: &WsfeAuth, cbte_tipo: u32) -> ArcaResult<String> {
        let mut writer = Writer::new(Vec::new());

        writer.write_event(Event::Start(BytesStart::new("ar:FECompUltimoAutorizado")))?;

        // Nodo de autenticación.
        writer.write_event(Event::Start(BytesStart::new("ar:Auth")))?;
        write_text_element(&mut writer, "ar:Token", &auth.token)?;
        write_text_element(&mut writer, "ar:Sign", &auth.sign)?;
        write_text_element(&mut writer, "ar:Cuit", &auth.cuit.to_string())?;
        writer.write_event(Event::End(BytesEnd::new("ar:Auth")))?;

        // Parámetros del método.
        write_text_element(
            &mut writer,
            "ar:PtoVta",
            &self.config.punto_venta().to_string(),
        )?;
        write_text_element(&mut writer, "ar:CbteTipo", &cbte_tipo.to_string())?;

        writer.write_event(Event::End(BytesEnd::new("ar:FECompUltimoAutorizado")))?;

        String::from_utf8(writer.into_inner()).map_err(ArcaError::from)
    }
}

/// Detecta el bloque `<Errors>` que WSFEv1 devuelve dentro del resultado
/// (a diferencia de un `soap:Fault`) y lo convierte en [`ArcaError`].
fn ensure_no_wsfe_errors(xml: &[u8]) -> ArcaResult<()> {
    if !contains_element(xml, "Errors")? {
        return Ok(());
    }
    let code = find_first_text(xml, "Code")?.unwrap_or_else(|| "?".to_string());
    let msg = find_first_text(xml, "Msg")?
        .unwrap_or_else(|| "WSFE devolvió un error sin descripción".to_string());
    Err(ArcaError::Authentication(format!("WSFE [{code}]: {msg}")))
}
