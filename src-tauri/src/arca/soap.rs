//! Helpers SOAP reutilizables: construcción de sobres, envío HTTP y detección
//! de `soap:Fault`. Centraliza el transporte para que `wsaa.rs` y `wsfe.rs` no
//! dupliquen lógica de red ni de manejo de errores.

use std::time::Duration;

use reqwest::header::CONTENT_TYPE;
use reqwest::Client;

use crate::arca::errors::{ArcaError, ArcaResult};
use crate::arca::utils::truncate_for_log;
use crate::arca::xml::parse_soap_fault;

/// Namespace del sobre SOAP 1.1.
const SOAPENV_NS: &str = "http://schemas.xmlsoap.org/soap/envelope/";
/// Namespace del servicio WSAA (`loginCms`).
const WSAA_NS: &str = "http://wsaa.view.sua.dvadac.desein.afip.gov";
/// Namespace del servicio WSFEv1.
const WSFE_NS: &str = "http://ar.gov.afip.dif.FEV1/";

/// Construye un cliente HTTP con timeouts razonables.
///
/// TLS por defecto de `reqwest` (SChannel en Windows, Secure Transport en
/// macOS, OpenSSL/rustls en Linux), garantizando portabilidad sin config extra.
pub fn http_client() -> ArcaResult<Client> {
    Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(45))
        .user_agent("GestionComercios-ARCA/1.0")
        .build()
        .map_err(ArcaError::from)
}

/// Arma el sobre SOAP de `loginCms` para WSAA.
///
/// `cms_base64` es la firma CMS/PKCS#7 en Base64 (solo caracteres seguros para
/// XML), por lo que se inserta directamente en el cuerpo.
pub fn build_wsaa_login_envelope(cms_base64: &str) -> String {
    format!(
        concat!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
            "<soapenv:Envelope xmlns:soapenv=\"{ns}\" xmlns:wsaa=\"{wsaa}\">",
            "<soapenv:Header/>",
            "<soapenv:Body>",
            "<wsaa:loginCms>",
            "<wsaa:in0>{cms}</wsaa:in0>",
            "</wsaa:loginCms>",
            "</soapenv:Body>",
            "</soapenv:Envelope>"
        ),
        ns = SOAPENV_NS,
        wsaa = WSAA_NS,
        cms = cms_base64
    )
}

/// Envuelve un fragmento de cuerpo WSFEv1 (p. ej. `<ar:FEDummy/>`) en el sobre
/// SOAP con el namespace `ar` declarado.
///
/// El `body_fragment` debe ser XML bien formado (lo generan las funciones de
/// `wsfe.rs` con `quick-xml`), por lo que aquí solo se compone la estructura.
pub fn build_wsfe_envelope(body_fragment: &str) -> String {
    format!(
        concat!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
            "<soapenv:Envelope xmlns:soapenv=\"{ns}\" xmlns:ar=\"{fev1}\">",
            "<soapenv:Header/>",
            "<soapenv:Body>{body}</soapenv:Body>",
            "</soapenv:Envelope>"
        ),
        ns = SOAPENV_NS,
        fev1 = WSFE_NS,
        body = body_fragment
    )
}

/// Envía un request SOAP y devuelve el cuerpo de la respuesta como texto.
///
/// Realiza las siguientes verificaciones antes de devolver `Ok`:
/// 1. Si el estado HTTP no es 2xx, intenta parsear un `soap:Fault` (ARCA suele
///    devolver `500` con un Fault) y, si no lo hay, devuelve [`ArcaError::Http`].
/// 2. Si el cuerpo (aun con `200`) contiene un `soap:Fault`, devuelve
///    [`ArcaError::SoapFault`].
///
/// `soap_action` debe ser la acción SOAP correcta: cadena vacía para WSAA y la
/// URI del método para WSFEv1 (p. ej. `http://ar.gov.afip.dif.FEV1/FEDummy`).
pub async fn send_soap(
    client: &Client,
    url: &str,
    soap_action: &str,
    body: String,
) -> ArcaResult<String> {
    let response = client
        .post(url)
        .header(CONTENT_TYPE, "text/xml; charset=utf-8")
        .header("SOAPAction", format!("\"{soap_action}\""))
        .body(body)
        .send()
        .await
        .map_err(ArcaError::from)?;

    let status = response.status();
    let text = response.text().await.map_err(ArcaError::from)?;

    if !status.is_success() {
        if let Some((code, message)) = parse_soap_fault(text.as_bytes())? {
            return Err(ArcaError::SoapFault { code, message });
        }
        return Err(ArcaError::Http {
            status: status.as_u16(),
            body: truncate_for_log(&text, 500),
        });
    }

    if let Some((code, message)) = parse_soap_fault(text.as_bytes())? {
        return Err(ArcaError::SoapFault { code, message });
    }

    Ok(text)
}
