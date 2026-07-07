//! Configuración de conexión a ARCA.
//!
//! [`ArcaConfig`] contiene todo lo necesario para autenticar y facturar:
//! CUIT, punto de venta, certificado + clave privada (en PEM, **solo en
//! memoria**) y el ambiente (homologación o producción).
//!
//! Decisiones de seguridad:
//! - El certificado y la clave **nunca** se escriben a disco desde este módulo.
//! - `Debug` está implementado a mano para no filtrar material sensible en logs.
//! - `Drop` sobrescribe los buffers de la clave y el certificado (best-effort).

use crate::arca::errors::{ArcaError, ArcaResult};

/// Ambiente de ARCA. Determina las URLs de WSAA y WSFEv1.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArcaEnvironment {
    /// Ambiente de pruebas (sin valor fiscal).
    Homologacion,
    /// Ambiente productivo (valor fiscal real).
    Produccion,
}

impl ArcaEnvironment {
    /// Endpoint del Web Service de Autenticación y Autorización (WSAA).
    pub fn wsaa_url(&self) -> &'static str {
        match self {
            ArcaEnvironment::Homologacion => {
                "https://wsaahomo.afip.gov.ar/ws/services/LoginCms"
            }
            ArcaEnvironment::Produccion => "https://wsaa.afip.gov.ar/ws/services/LoginCms",
        }
    }

    /// Endpoint del Web Service de Facturación Electrónica v1 (WSFEv1).
    pub fn wsfe_url(&self) -> &'static str {
        match self {
            ArcaEnvironment::Homologacion => {
                "https://wswhomo.afip.gov.ar/wsfev1/service.asmx"
            }
            ArcaEnvironment::Produccion => {
                "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
            }
        }
    }

    /// Etiqueta legible para UI/logs (no sensible).
    pub fn label(&self) -> &'static str {
        match self {
            ArcaEnvironment::Homologacion => "Homologación",
            ArcaEnvironment::Produccion => "Producción",
        }
    }
}

/// Configuración completa para operar contra ARCA.
///
/// El certificado y la clave se mantienen privados; el resto del módulo accede
/// a ellos mediante [`ArcaConfig::cert_pem`] / [`ArcaConfig::key_pem`] con
/// visibilidad de crate.
#[derive(Clone)]
pub struct ArcaConfig {
    cuit: u64,
    punto_venta: u32,
    cert_pem: String,
    key_pem: String,
    environment: ArcaEnvironment,
}

impl ArcaConfig {
    /// Crea una configuración validando los campos mínimos.
    ///
    /// - `cuit`: CUIT del emisor sin guiones (11 dígitos).
    /// - `punto_venta`: punto de venta habilitado en ARCA (> 0).
    /// - `cert_pem` / `key_pem`: material X.509 en formato PEM.
    /// - `environment`: homologación o producción.
    pub fn new(
        cuit: u64,
        punto_venta: u32,
        cert_pem: impl Into<String>,
        key_pem: impl Into<String>,
        environment: ArcaEnvironment,
    ) -> ArcaResult<Self> {
        let cert_pem = cert_pem.into();
        let key_pem = key_pem.into();

        if !(10_000_000_000..=99_999_999_999).contains(&cuit) {
            return Err(ArcaError::Config(
                "el CUIT debe tener 11 dígitos".to_string(),
            ));
        }
        if punto_venta == 0 {
            return Err(ArcaError::Config(
                "el punto de venta debe ser mayor a cero".to_string(),
            ));
        }
        if !cert_pem.contains("BEGIN CERTIFICATE") {
            return Err(ArcaError::InvalidCertificate(
                "el certificado no está en formato PEM".to_string(),
            ));
        }
        if !key_pem.contains("BEGIN") || !key_pem.contains("PRIVATE KEY") {
            return Err(ArcaError::InvalidPrivateKey(
                "la clave privada no está en formato PEM".to_string(),
            ));
        }

        Ok(Self {
            cuit,
            punto_venta,
            cert_pem,
            key_pem,
            environment,
        })
    }

    /// CUIT del emisor (11 dígitos).
    pub fn cuit(&self) -> u64 {
        self.cuit
    }

    /// Punto de venta habilitado en ARCA.
    pub fn punto_venta(&self) -> u32 {
        self.punto_venta
    }

    /// Ambiente configurado.
    pub fn environment(&self) -> ArcaEnvironment {
        self.environment
    }

    /// Certificado X.509 en PEM (uso interno del módulo).
    pub(crate) fn cert_pem(&self) -> &str {
        &self.cert_pem
    }

    /// Clave privada en PEM (uso interno del módulo).
    pub(crate) fn key_pem(&self) -> &str {
        &self.key_pem
    }
}

impl std::fmt::Debug for ArcaConfig {
    /// Debug redactado: nunca imprime certificado ni clave.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ArcaConfig")
            .field("cuit", &self.cuit)
            .field("punto_venta", &self.punto_venta)
            .field("environment", &self.environment)
            .field("cert_pem", &"<redactado>")
            .field("key_pem", &"<redactado>")
            .finish()
    }
}

impl Drop for ArcaConfig {
    /// Sobrescribe los buffers sensibles al liberar (best-effort).
    ///
    /// No es una garantía criptográfica (el `String` pudo reubicarse en el
    /// heap), pero reduce la ventana en la que la clave queda legible en RAM.
    fn drop(&mut self) {
        // SAFETY: sobrescribimos bytes en el buffer existente; no cambiamos
        // la longitud ni la validez UTF-8 del `String` (0x00 es UTF-8 válido).
        unsafe {
            for b in self.key_pem.as_bytes_mut() {
                *b = 0;
            }
            for b in self.cert_pem.as_bytes_mut() {
                *b = 0;
            }
        }
    }
}
