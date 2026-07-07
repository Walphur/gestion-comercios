//! Errores tipados del módulo ARCA.
//!
//! Todo el módulo devuelve [`ArcaResult<T>`]. Nunca usamos `unwrap`, `expect`
//! ni `panic!`: cada punto de falla se mapea a una variante específica de
//! [`ArcaError`], de modo que la capa Tauri pueda mostrar mensajes claros y
//! decidir reintentos según el tipo de error.

use thiserror::Error;

/// Alias de resultado usado en todo el módulo ARCA.
pub type ArcaResult<T> = Result<T, ArcaError>;

/// Error de dominio del módulo ARCA.
///
/// Las variantes están pensadas para que la capa superior pueda distinguir
/// entre errores recuperables (p. ej. [`ArcaError::Network`], reintentable) y
/// errores de configuración/credenciales (p. ej.
/// [`ArcaError::InvalidCertificate`], que requieren acción del usuario).
#[derive(Debug, Error)]
pub enum ArcaError {
    /// Fallo de red/transporte al contactar los servidores de ARCA.
    #[error("no se pudo contactar a ARCA (red): {0}")]
    Network(String),

    /// Respuesta HTTP con código distinto de 2xx.
    #[error("ARCA respondió con HTTP {status}")]
    Http {
        /// Código de estado HTTP recibido.
        status: u16,
        /// Cuerpo de la respuesta (recortado, sin datos sensibles).
        body: String,
    },

    /// ARCA devolvió un `soap:Fault` estructurado.
    #[error("ARCA devolvió un SOAP Fault [{code}]: {message}")]
    SoapFault {
        /// `faultcode` reportado por el servidor.
        code: String,
        /// `faultstring` reportado por el servidor.
        message: String,
    },

    /// Error al construir o parsear XML.
    #[error("error de XML: {0}")]
    Xml(String),

    /// Error genérico de la capa criptográfica (firma CMS/PKCS#7).
    #[error("error criptográfico: {0}")]
    OpenSsl(String),

    /// El certificado X.509 en PEM no pudo cargarse.
    #[error("certificado X.509 inválido: {0}")]
    InvalidCertificate(String),

    /// La clave privada en PEM no pudo cargarse.
    #[error("clave privada inválida: {0}")]
    InvalidPrivateKey(String),

    /// La firma CMS/PKCS#7 no pudo generarse.
    #[error("no se pudo firmar el TRA (CMS/PKCS#7): {0}")]
    InvalidSignature(String),

    /// El Ticket de Acceso (TA) en caché está vencido.
    #[error("el Ticket de Acceso (TA) está vencido")]
    TokenExpired,

    /// ARCA rechazó la autenticación (WSAA) por credenciales o estado.
    #[error("ARCA rechazó la autenticación: {0}")]
    Authentication(String),

    /// Error de (de)serialización de estructuras.
    #[error("error de serialización: {0}")]
    Serialization(String),

    /// La respuesta de ARCA no tuvo el formato/los campos esperados.
    #[error("respuesta de ARCA inválida o incompleta: {0}")]
    InvalidResponse(String),

    /// Configuración inválida provista por el usuario.
    #[error("configuración de ARCA inválida: {0}")]
    Config(String),

    /// Error interno no clasificado.
    #[error("error interno del módulo ARCA: {0}")]
    Internal(String),
}

impl From<quick_xml::Error> for ArcaError {
    fn from(err: quick_xml::Error) -> Self {
        ArcaError::Xml(err.to_string())
    }
}

impl From<std::io::Error> for ArcaError {
    fn from(err: std::io::Error) -> Self {
        ArcaError::Xml(format!("E/S al construir XML: {err}"))
    }
}

impl From<std::string::FromUtf8Error> for ArcaError {
    fn from(err: std::string::FromUtf8Error) -> Self {
        ArcaError::Xml(format!("UTF-8 inválido en XML: {err}"))
    }
}

impl From<reqwest::Error> for ArcaError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            ArcaError::Network(format!("timeout: {err}"))
        } else if err.is_connect() {
            ArcaError::Network(format!("conexión: {err}"))
        } else {
            ArcaError::Network(err.to_string())
        }
    }
}
