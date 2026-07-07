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

#[cfg(test)]
mod tests;

pub use auth::TokenCache;
pub use config::{ArcaConfig, ArcaEnvironment};
pub use crypto::{inspect_certificate, validate_keypair, CertificateReport};
pub use errors::{ArcaError, ArcaResult};
pub use models::{AccessTicket, DummyStatus, WsfeAuth};

use chrono::Duration;
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

/// Un paso individual del validador de instalación.
#[derive(Debug, Clone, Serialize)]
pub struct CheckStep {
    /// Nombre del paso (p. ej. `"Certificado"`).
    pub nombre: String,
    /// `true` si el paso pasó; `false` si falló; `null` si no se ejecutó.
    pub ok: Option<bool>,
    /// Detalle legible (éxito o causa del fallo). Nunca incluye datos sensibles.
    pub detalle: Option<String>,
}

impl CheckStep {
    fn ok(nombre: &str, detalle: Option<String>) -> Self {
        Self {
            nombre: nombre.to_string(),
            ok: Some(true),
            detalle,
        }
    }
    fn fail(nombre: &str, detalle: String) -> Self {
        Self {
            nombre: nombre.to_string(),
            ok: Some(false),
            detalle: Some(detalle),
        }
    }
    fn skipped(nombre: &str) -> Self {
        Self {
            nombre: nombre.to_string(),
            ok: None,
            detalle: Some("No ejecutado (falló un paso previo).".to_string()),
        }
    }
}

/// Informe del validador de instalación ARCA (todos los pasos, en orden).
#[derive(Debug, Clone, Serialize)]
pub struct InstallReport {
    /// `true` si todos los pasos pasaron.
    pub ok: bool,
    /// Nombre del primer paso que falló, si hubo alguno.
    pub fallo_en: Option<String>,
    /// Detalle de todos los pasos ejecutados y omitidos.
    pub pasos: Vec<CheckStep>,
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
    pub async fn ultimo_comprobante(&self, cache: &TokenCache, cbte_tipo: u32) -> ArcaResult<i64> {
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

    /// Valida la instalación ARCA de punta a punta y devuelve un informe paso a
    /// paso: configuración → certificado → clave → par cert+clave → TRA → CMS →
    /// LoginCMS (Token/Sign) → FEDummy → FECompUltimoAutorizado.
    ///
    /// Se detiene en el primer paso que falla y marca los siguientes como "no
    /// ejecutados", de modo que el usuario vea exactamente dónde está el problema.
    /// Nunca se corta con un `Err`: siempre devuelve un [`InstallReport`].
    pub async fn validar_instalacion(&self, cache: &TokenCache) -> InstallReport {
        // Nombres en el orden exacto en que se ejecutan.
        const PASOS: &[&str] = &[
            "Configuración",
            "Certificado",
            "Clave privada",
            "Certificado + Clave",
            "TRA",
            "CMS",
            "LoginCMS (Token y Sign)",
            "FEDummy",
            "FECompUltimoAutorizado",
        ];

        let mut pasos: Vec<CheckStep> = Vec::with_capacity(PASOS.len());

        // Cierra el informe: marca como omitidos los pasos que no se llegaron a
        // ejecutar tras el fallo `fallo`.
        let finish = |mut pasos: Vec<CheckStep>, fallo: &str| -> InstallReport {
            let done: std::collections::HashSet<&str> =
                pasos.iter().map(|p| p.nombre.as_str()).collect();
            let pendientes: Vec<&str> = PASOS
                .iter()
                .copied()
                .filter(|n| !done.contains(n))
                .collect();
            for n in pendientes {
                pasos.push(CheckStep::skipped(n));
            }
            InstallReport {
                ok: false,
                fallo_en: Some(fallo.to_string()),
                pasos,
            }
        };

        // 1) Configuración.
        pasos.push(CheckStep::ok(
            "Configuración",
            Some(format!(
                "CUIT {} · PV {} · {}",
                self.config.cuit(),
                self.config.punto_venta(),
                self.config.environment().label()
            )),
        ));

        // 2) Certificado (formato + vigencia + longitud de clave).
        match crypto::inspect_certificate(self.config.cert_pem()) {
            Ok(rep) => pasos.push(CheckStep::ok(
                "Certificado",
                Some(format!(
                    "{} · {} bits · vence en {} días ({})",
                    rep.subject, rep.key_bits, rep.days_to_expiry, rep.not_after
                )),
            )),
            Err(e) => {
                pasos.push(CheckStep::fail("Certificado", e.to_string()));
                return finish(pasos, "Certificado");
            }
        }

        // 3) Clave privada.
        match crypto::check_private_key(self.config.key_pem()) {
            Ok(()) => pasos.push(CheckStep::ok("Clave privada", Some("Cargada.".to_string()))),
            Err(e) => {
                pasos.push(CheckStep::fail("Clave privada", e.to_string()));
                return finish(pasos, "Clave privada");
            }
        }

        // 4) Coherencia certificado + clave.
        match crypto::validate_keypair(self.config.cert_pem(), self.config.key_pem()) {
            Ok(()) => pasos.push(CheckStep::ok(
                "Certificado + Clave",
                Some("La clave corresponde al certificado.".to_string()),
            )),
            Err(e) => {
                pasos.push(CheckStep::fail("Certificado + Clave", e.to_string()));
                return finish(pasos, "Certificado + Clave");
            }
        }

        // 5) TRA.
        let tra = match crate::arca::wsaa::generar_tra(
            crate::arca::wsaa::SERVICE_WSFE,
            Duration::seconds(2 * 60 * 60),
        ) {
            Ok(t) => {
                pasos.push(CheckStep::ok("TRA", Some("Generado.".to_string())));
                t
            }
            Err(e) => {
                pasos.push(CheckStep::fail("TRA", e.to_string()));
                return finish(pasos, "TRA");
            }
        };

        // 6) Firma CMS del TRA.
        match crate::arca::wsaa::firmar_tra(&tra, &self.config) {
            Ok(_cms) => pasos.push(CheckStep::ok(
                "CMS",
                Some("Firma CMS/PKCS#7 válida (verificada contra WSAA).".to_string()),
            )),
            Err(e) => {
                pasos.push(CheckStep::fail("CMS", e.to_string()));
                return finish(pasos, "CMS");
            }
        }

        // 7) LoginCMS → Token y Sign.
        let ticket = match self.autenticar(cache).await {
            Ok(t) => {
                pasos.push(CheckStep::ok(
                    "LoginCMS (Token y Sign)",
                    Some(format!(
                        "Autenticado. TA válido hasta {}.",
                        crate::arca::utils::format_iso8601(&t.expiration_time)
                    )),
                ));
                t
            }
            Err(e) => {
                pasos.push(CheckStep::fail("LoginCMS (Token y Sign)", e.to_string()));
                return finish(pasos, "LoginCMS (Token y Sign)");
            }
        };

        // 8) FEDummy.
        match self.estado_servidores().await {
            Ok(d) => pasos.push(CheckStep::ok(
                "FEDummy",
                Some(format!(
                    "App:{} · DB:{} · Auth:{}",
                    d.app_server, d.db_server, d.auth_server
                )),
            )),
            Err(e) => {
                pasos.push(CheckStep::fail("FEDummy", e.to_string()));
                return finish(pasos, "FEDummy");
            }
        }

        // 9) FECompUltimoAutorizado (Factura C por defecto).
        let auth = WsfeAuth::from_ticket(&ticket, self.config.cuit());
        match Wsfe::new(&self.config, &self.http)
            .fe_comp_ultimo_autorizado(&auth, cbte_tipo::FACTURA_C)
            .await
        {
            Ok(nro) => pasos.push(CheckStep::ok(
                "FECompUltimoAutorizado",
                Some(format!(
                    "Último comprobante (Factura C): {nro}. Próximo: {}.",
                    nro + 1
                )),
            )),
            Err(e) => {
                pasos.push(CheckStep::fail("FECompUltimoAutorizado", e.to_string()));
                return finish(pasos, "FECompUltimoAutorizado");
            }
        }

        InstallReport {
            ok: true,
            fallo_en: None,
            pasos,
        }
    }
}
