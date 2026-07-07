//! Autenticación de alto nivel con caché del Ticket de Acceso (TA).
//!
//! ARCA rechaza solicitar un TA nuevo mientras exista uno vigente para el mismo
//! servicio. Por eso cacheamos el TA y lo reutilizamos hasta que esté por
//! vencer. La caché es un [`TokenCache`] que **el llamador** guarda (por
//! ejemplo, en el `State` de Tauri), evitando variables globales.

use std::sync::Mutex;

use reqwest::Client;

use crate::arca::config::ArcaConfig;
use crate::arca::errors::{ArcaError, ArcaResult};
use crate::arca::models::AccessTicket;
use crate::arca::utils::now_ar;
use crate::arca::wsaa::{solicitar_token_sign, SERVICE_WSFE};

/// Margen de seguridad (segundos) antes del vencimiento real del TA.
const SAFETY_MARGIN_SECS: i64 = 300;

/// Caché en memoria del Ticket de Acceso.
///
/// Diseñada para vivir en el `State` de Tauri. Usa un [`Mutex`] interno; los
/// bloqueos son breves y **nunca** se sostienen a través de un `.await`.
#[derive(Default)]
pub struct TokenCache {
    ticket: Mutex<Option<AccessTicket>>,
}

impl TokenCache {
    /// Crea una caché vacía.
    pub fn new() -> Self {
        Self {
            ticket: Mutex::new(None),
        }
    }

    /// Devuelve una copia del TA vigente, si lo hay.
    fn get_valid(&self) -> ArcaResult<Option<AccessTicket>> {
        let now = now_ar()?;
        let guard = self
            .ticket
            .lock()
            .map_err(|_| ArcaError::Internal("mutex de caché envenenado".to_string()))?;
        match guard.as_ref() {
            Some(t) if t.is_valid(now, SAFETY_MARGIN_SECS) => Ok(Some(t.clone())),
            _ => Ok(None),
        }
    }

    /// Reemplaza el TA cacheado.
    fn store(&self, ticket: AccessTicket) -> ArcaResult<()> {
        let mut guard = self
            .ticket
            .lock()
            .map_err(|_| ArcaError::Internal("mutex de caché envenenado".to_string()))?;
        *guard = Some(ticket);
        Ok(())
    }

    /// Invalida el TA cacheado (fuerza re-autenticación en el próximo uso).
    pub fn invalidate(&self) -> ArcaResult<()> {
        let mut guard = self
            .ticket
            .lock()
            .map_err(|_| ArcaError::Internal("mutex de caché envenenado".to_string()))?;
        *guard = None;
        Ok(())
    }
}

/// Devuelve un TA válido para WSFE, reutilizando la caché o pidiéndolo a WSAA.
///
/// El [`Mutex`] solo se toma para leer/escribir la caché; la llamada de red a
/// WSAA ocurre fuera de cualquier lock.
pub async fn autenticar(
    client: &Client,
    config: &ArcaConfig,
    cache: &TokenCache,
) -> ArcaResult<AccessTicket> {
    if let Some(ticket) = cache.get_valid()? {
        return Ok(ticket);
    }

    let ticket = solicitar_token_sign(client, config, SERVICE_WSFE).await?;
    cache.store(ticket.clone())?;
    Ok(ticket)
}
