//! WSAA — Web Service de Autenticación y Autorización.
//!
//! Flujo completo:
//! 1. [`generar_tra`]: crea el Ticket Request Authorization con tiempos válidos.
//! 2. [`firmar_tra`]: firma el TRA como CMS/PKCS#7 (Base64) usando el certificado.
//! 3. [`solicitar_token_sign`]: envía `loginCms` a WSAA y extrae el Ticket de Acceso.
//!
//! El TA devuelto (`token` + `sign`) es válido ~12 h y debe cachearse (ver
//! [`crate::arca::auth`]); ARCA rechaza pedir uno nuevo si aún hay uno vigente.

use chrono::Duration;
use reqwest::Client;

use crate::arca::config::ArcaConfig;
use crate::arca::crypto::sign_tra_cms;
use crate::arca::errors::{ArcaError, ArcaResult};
use crate::arca::models::{AccessTicket, Tra};
use crate::arca::soap::{build_wsaa_login_envelope, send_soap};
use crate::arca::utils::{now_ar, parse_iso8601, unique_id};
use crate::arca::xml::{find_first_text, require_text};

/// Servicio de negocio para el que se pide el TA.
pub const SERVICE_WSFE: &str = "wsfe";

/// Duración máxima permitida para la ventana del TRA (2 horas).
const MAX_TTL_SECS: i64 = 2 * 60 * 60;

/// Desfase hacia el pasado del `generationTime` para tolerar relojes desfasados.
const CLOCK_SKEW_SECS: i64 = 10 * 60;

/// Genera un TRA para el `service` indicado.
///
/// - `generationTime` = ahora − 10 min (tolerancia de reloj).
/// - `expirationTime` = ahora + `ttl` (acotado a 2 h como exige el requisito).
///
/// # Errores
/// [`ArcaError::Config`] si `ttl` no es positivo.
pub fn generar_tra(service: &str, ttl: Duration) -> ArcaResult<Tra> {
    let ttl_secs = ttl.num_seconds();
    if ttl_secs <= 0 {
        return Err(ArcaError::Config(
            "la duración del TRA debe ser positiva".to_string(),
        ));
    }
    let ttl_secs = ttl_secs.min(MAX_TTL_SECS);

    let now = now_ar()?;
    let generation_time = now - Duration::seconds(CLOCK_SKEW_SECS);
    let expiration_time = now + Duration::seconds(ttl_secs);

    Ok(Tra {
        unique_id: unique_id()?,
        generation_time,
        expiration_time,
        service: service.to_string(),
    })
}

/// Firma el TRA y devuelve el CMS/PKCS#7 en Base64 listo para `loginCms`.
pub fn firmar_tra(tra: &Tra, config: &ArcaConfig) -> ArcaResult<String> {
    let tra_xml = crate::arca::xml::build_tra_xml(tra)?;
    sign_tra_cms(tra_xml.as_bytes(), config.cert_pem(), config.key_pem())
}

/// Solicita el Ticket de Acceso a WSAA y devuelve el [`AccessTicket`].
///
/// Construye el TRA, lo firma, arma el sobre SOAP `loginCms`, lo envía al
/// endpoint correspondiente al ambiente y parsea la respuesta anidada
/// (`loginCmsReturn` contiene un XML escapado con el `loginTicketResponse`).
///
/// # Errores
/// - [`ArcaError::SoapFault`] / [`ArcaError::Authentication`] si ARCA rechaza.
/// - [`ArcaError::InvalidResponse`] si faltan campos esperados.
pub async fn solicitar_token_sign(
    client: &Client,
    config: &ArcaConfig,
    service: &str,
) -> ArcaResult<AccessTicket> {
    // 1) TRA con ventana de 2 h.
    let tra = generar_tra(service, Duration::seconds(MAX_TTL_SECS))?;

    // 2) Firma CMS/PKCS#7 (Base64).
    let cms_base64 = firmar_tra(&tra, config)?;

    // 3) Sobre SOAP + envío. WSAA usa SOAPAction vacío.
    let envelope = build_wsaa_login_envelope(&cms_base64);
    let url = config.environment().wsaa_url();
    let response = send_soap(client, url, "", envelope).await?;

    // 4) La respuesta trae <loginCmsReturn> con el loginTicketResponse escapado.
    let inner_xml = find_first_text(response.as_bytes(), "loginCmsReturn")?.ok_or_else(|| {
        ArcaError::Authentication(
            "WSAA no devolvió loginCmsReturn (verificá certificado, servicio habilitado y ambiente)"
                .to_string(),
        )
    })?;

    parse_login_ticket_response(inner_xml.as_bytes())
}

/// Parsea el `loginTicketResponse` interno y arma el [`AccessTicket`].
fn parse_login_ticket_response(xml: &[u8]) -> ArcaResult<AccessTicket> {
    let token = require_text(xml, "token")?;
    let sign = require_text(xml, "sign")?;
    let generation = require_text(xml, "generationTime")?;
    let expiration = require_text(xml, "expirationTime")?;

    Ok(AccessTicket {
        token,
        sign,
        generation_time: parse_iso8601(&generation)?,
        expiration_time: parse_iso8601(&expiration)?,
    })
}
