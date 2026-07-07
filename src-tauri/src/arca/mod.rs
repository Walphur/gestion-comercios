//! Integración con **ARCA (ex AFIP)** — WSAA + WSFEv1.
//!
//! Arquitectura offline-first, comunicación **directa** PC → ARCA, sin backend
//! propio ni servicios intermedios. Toda la lógica está en Rust y encapsulada;
//! las funciones son `async` y quedan listas para envolverse en
//! `#[tauri::command]` sin cambios de fondo.
//!
//! ## Módulos
//! - [`config`]: [`ArcaConfig`], ambiente y URLs.
//! - [`errors`]: [`ArcaError`] tipado.
//! - [`models`]: DTOs puros (TRA, TA, respuestas WSFE).
//! - [`utils`]: tiempo AR, `uniqueId`, formateo ISO 8601.
//! - [`crypto`]: firma CMS/PKCS#7 con OpenSSL (aislado y reemplazable).
//! - [`xml`]: build/parse con `quick-xml` (sin búsquedas de texto).
//! - [`soap`]: sobres SOAP, envío HTTP y `soap:Fault`.
//! - [`wsaa`]: autenticación (TRA → firma → `loginCms` → TA).
//! - [`auth`]: caché del TA ([`TokenCache`]) sin variables globales.
//! - [`wsfe`]: facturación electrónica (dummy + último autorizado; resto preparado).
//!
//! ## Uso típico desde Tauri
//! ```ignore
//! // `cache: State<TokenCache>` administrado por Tauri.
//! let config = ArcaConfig::new(cuit, pto_vta, cert_pem, key_pem, ArcaEnvironment::Homologacion)?;
//! let arca = ArcaClient::new(config)?;
//! let info = arca.probar_conexion(&cache).await?;
//! ```

mod auth;
mod config;
mod crypto;
mod errors;
mod models;
mod soap;
mod utils;
mod wsaa;
mod wsfe;
mod xml;

pub use auth::TokenCache;
pub use config::{ArcaConfig, ArcaEnvironment};
pub use crypto::validate_keypair;
pub use errors::{ArcaError, ArcaResult};
pub use models::{AccessTicket, DummyStatus, WsfeAuth};

use reqwest::Client;
use serde::Serialize;

use crate::arca::soap::http_client;
use crate::arca::wsfe::Wsfe;

/// Códigos de tipo de comprobante WSFEv1 de uso frecuente.
pub mod cbte_tipo {
    /// Factura A.
    pub const FACTURA_A: u32 = 1;
    /// Factura B.
    pub const FACTURA_B: u32 = 6;
    /// Factura C.
    pub const FACTURA_C: u32 = 11;
}

/// Resultado de una prueba de conexión, apto para mostrar en la UI.
#[derive(Debug, Clone, Serialize)]
pub struct ConexionInfo {
    /// Ambiente contra el que se probó (`"Homologación"` / `"Producción"`).
    pub ambiente: String,
    /// `true` si `FEDummy` reporta los tres subsistemas OK.
    pub servidores_ok: bool,
    /// Vencimiento del Ticket de Acceso obtenido (ISO 8601).
    pub ta_expira: String,
}

/// Cliente de alto nivel: agrupa configuración + HTTP y expone operaciones
/// listas para Tauri. El [`TokenCache`] se pasa por parámetro (vive en el
/// `State` de Tauri) para respetar la regla de "sin variables globales".
pub struct ArcaClient {
    config: ArcaConfig,
    http: Client,
}

impl ArcaClient {
    /// Construye el cliente con un cliente HTTP propio y timeouts razonables.
    pub fn new(config: ArcaConfig) -> ArcaResult<Self> {
        Ok(Self {
            config,
            http: http_client()?,
        })
    }

    /// Obtiene un Ticket de Acceso válido (reutiliza la caché o pide a WSAA).
    pub async fn autenticar(&self, cache: &TokenCache) -> ArcaResult<AccessTicket> {
        auth::autenticar(&self.http, &self.config, cache).await
    }

    /// Estado de disponibilidad de ARCA (`FEDummy`, sin autenticación).
    pub async fn estado_servidores(&self) -> ArcaResult<DummyStatus> {
        Wsfe::new(&self.config, &self.http).fe_dummy().await
    }

    /// Último comprobante autorizado para el punto de venta configurado.
    pub async fn ultimo_comprobante(
        &self,
        cache: &TokenCache,
        cbte_tipo: u32,
    ) -> ArcaResult<i64> {
        let ticket = self.autenticar(cache).await?;
        let auth = WsfeAuth::from_ticket(&ticket, self.config.cuit());
        Wsfe::new(&self.config, &self.http)
            .fe_comp_ultimo_autorizado(&auth, cbte_tipo)
            .await
    }

    /// Prueba integral de conexión: verifica disponibilidad y autentica.
    ///
    /// Ideal para el botón "Probar conexión" de la pantalla de configuración:
    /// valida certificado, clave, ambiente y servicio habilitado de una sola vez.
    pub async fn probar_conexion(&self, cache: &TokenCache) -> ArcaResult<ConexionInfo> {
        let dummy = self.estado_servidores().await?;
        let ticket = self.autenticar(cache).await?;
        Ok(ConexionInfo {
            ambiente: self.config.environment().label().to_string(),
            servidores_ok: dummy.all_ok(),
            ta_expira: crate::arca::utils::format_iso8601(&ticket.expiration_time),
        })
    }
}
