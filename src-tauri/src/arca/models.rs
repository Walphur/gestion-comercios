//! Modelos de datos del módulo ARCA.
//!
//! Estructuras puras (sin lógica de red ni de I/O) que representan el TRA,
//! el Ticket de Acceso (TA) devuelto por WSAA y los DTOs de los métodos de
//! WSFEv1 que ya están implementados.

use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};

/// Ticket Request Authorization (TRA).
///
/// Es el documento que se firma y se envía a WSAA para obtener el TA.
/// Los tiempos van en horario de Argentina (UTC-03:00) con offset explícito.
#[derive(Debug, Clone)]
pub struct Tra {
    /// Identificador único del pedido (típicamente epoch en segundos).
    pub unique_id: u32,
    /// Momento de generación (se fija ~10 min en el pasado por tolerancia de reloj).
    pub generation_time: DateTime<FixedOffset>,
    /// Momento de expiración de la ventana de request (≤ 2 h desde ahora).
    pub expiration_time: DateTime<FixedOffset>,
    /// Servicio de negocio solicitado (p. ej. `"wsfe"`).
    pub service: String,
}

/// Ticket de Acceso (TA) devuelto por WSAA.
///
/// El `token` y el `sign` son las credenciales que se adjuntan a cada request
/// de WSFEv1. `expiration_time` es el vencimiento **real** informado por ARCA
/// (~12 h) y es el que gobierna la caché.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessTicket {
    /// Token de acceso (sensible: no loguear).
    pub token: String,
    /// Firma del token (sensible: no loguear).
    pub sign: String,
    /// Momento de generación informado por ARCA.
    pub generation_time: DateTime<FixedOffset>,
    /// Momento de expiración informado por ARCA.
    pub expiration_time: DateTime<FixedOffset>,
}

impl AccessTicket {
    /// Indica si el TA sigue vigente considerando un margen de seguridad.
    ///
    /// El margen evita usar un token que vence en los próximos segundos y
    /// que ARCA podría rechazar por diferencia de reloj.
    pub fn is_valid(&self, now: DateTime<FixedOffset>, safety_margin_secs: i64) -> bool {
        let limit = self.expiration_time - chrono::Duration::seconds(safety_margin_secs);
        now < limit
    }
}

/// Credenciales de autenticación que WSFEv1 espera en el nodo `<Auth>`.
#[derive(Debug, Clone)]
pub struct WsfeAuth {
    /// Token del TA.
    pub token: String,
    /// Sign del TA.
    pub sign: String,
    /// CUIT del emisor.
    pub cuit: u64,
}

impl WsfeAuth {
    /// Construye las credenciales a partir de un TA y el CUIT del emisor.
    pub fn from_ticket(ticket: &AccessTicket, cuit: u64) -> Self {
        Self {
            token: ticket.token.clone(),
            sign: ticket.sign.clone(),
            cuit,
        }
    }
}

/// Estado de disponibilidad devuelto por `FEDummy`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DummyStatus {
    /// Estado del servidor de aplicación (`OK`/`ERROR`).
    pub app_server: String,
    /// Estado del servidor de base de datos (`OK`/`ERROR`).
    pub db_server: String,
    /// Estado del servidor de autenticación (`OK`/`ERROR`).
    pub auth_server: String,
}

impl DummyStatus {
    /// `true` si los tres subsistemas responden `OK`.
    pub fn all_ok(&self) -> bool {
        self.app_server.eq_ignore_ascii_case("OK")
            && self.db_server.eq_ignore_ascii_case("OK")
            && self.auth_server.eq_ignore_ascii_case("OK")
    }
}
