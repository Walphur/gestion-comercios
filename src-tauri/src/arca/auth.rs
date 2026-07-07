//! Autenticación de alto nivel con caché del Ticket de Acceso (TA).
//!
//! ARCA rechaza solicitar un TA nuevo mientras exista uno vigente para el mismo
//! servicio. Por eso cacheamos el TA y lo reutilizamos hasta que esté por
//! vencer. La caché es un [`TokenCache`] que **el llamador** guarda (por
//! ejemplo, en el `State` de Tauri), evitando variables globales.
//!
//! Para el worker de sincronización en background se expone
//! [`shared_token_cache`]: la misma instancia compartida vía [`Arc`].

use std::sync::{Arc, Mutex, OnceLock};

use reqwest::Client;
use tokio::sync::Mutex as AsyncMutex;

use crate::arca::config::ArcaConfig;
use crate::arca::errors::{ArcaError, ArcaResult};
use crate::arca::models::AccessTicket;
use crate::arca::utils::now_ar;
use crate::arca::wsaa::{solicitar_token_sign, SERVICE_WSFE};

/// Margen de seguridad (segundos) antes del vencimiento real del TA.
///
/// Se renueva el token con este margen de anticipación para no usar jamás uno
/// que ARCA podría rechazar por diferencia de reloj.
const SAFETY_MARGIN_SECS: i64 = 300;

/// Caché en memoria del Ticket de Acceso.
///
/// Diseñada para vivir en el `State` de Tauri. Tiene dos cerrojos con roles
/// distintos:
/// - `ticket`: [`Mutex`] síncrono que protege el dato en sí. Los bloqueos son
///   brevísimos (leer/escribir un `Option`) y **nunca** se sostienen a través
///   de un `.await`, por lo que no pueden causar deadlocks.
/// - `renewal`: [`AsyncMutex`] que **serializa las renovaciones de red**. Si
///   varias facturas se emiten a la vez y el TA está vencido, solo una llama a
///   WSAA; las demás esperan y reutilizan el token recién obtenido. Esto evita
///   que ARCA rechace pedidos simultáneos ("ya posee un TA válido").
#[derive(Default)]
pub struct TokenCache {
    ticket: Mutex<Option<AccessTicket>>,
    renewal: AsyncMutex<()>,
}

impl TokenCache {
    /// Crea una caché vacía.
    pub fn new() -> Self {
        Self {
            ticket: Mutex::new(None),
            renewal: AsyncMutex::new(()),
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

    /// Devuelve el TA vigente sin red (solo lectura de caché).
    pub fn get_valid_sync(&self) -> ArcaResult<Option<AccessTicket>> {
        self.get_valid()
    }
}

/// Devuelve un TA válido para WSFE, reutilizando la caché o pidiéndolo a WSAA.
///
/// Estrategia de renovación segura ante concurrencia (double-checked locking):
/// 1. Se intenta leer un TA vigente de la caché (camino rápido, sin red).
/// 2. Si no hay, se toma el cerrojo de renovación (`AsyncMutex`), de modo que
///    solo un llamador entre a WSAA a la vez.
/// 3. Con el cerrojo tomado, se **vuelve a chequear** la caché: si otro
///    llamador ya renovó mientras esperábamos, se reutiliza ese TA y no se
///    hace ninguna llamada de red adicional.
/// 4. Recién entonces se solicita el TA a WSAA y se guarda en caché.
///
/// El `MutexGuard` síncrono de `ticket` nunca se sostiene a través de un
/// `.await`; el que sí cruza el `.await` es el cerrojo asíncrono `renewal`,
/// que es exactamente su propósito.
pub async fn autenticar(
    client: &Client,
    config: &ArcaConfig,
    cache: &TokenCache,
) -> ArcaResult<AccessTicket> {
    // (1) Camino rápido: TA vigente ya cacheado.
    if let Some(ticket) = cache.get_valid()? {
        return Ok(ticket);
    }

    // (2) Serializa las renovaciones: solo una llamada a WSAA a la vez.
    let _renew_guard = cache.renewal.lock().await;

    // (3) Double-check: quizá otra tarea renovó mientras esperábamos el cerrojo.
    if let Some(ticket) = cache.get_valid()? {
        return Ok(ticket);
    }

    // (4) Somos el único renovador: pedimos el TA y lo cacheamos.
    let ticket = solicitar_token_sign(client, config, SERVICE_WSFE).await?;
    cache.store(ticket.clone())?;
    Ok(ticket)
}

static SHARED_CACHE: OnceLock<Arc<TokenCache>> = OnceLock::new();

/// Caché compartida entre Tauri y el worker de sincronización fiscal.
pub fn shared_token_cache() -> Arc<TokenCache> {
    SHARED_CACHE
        .get_or_init(|| Arc::new(TokenCache::new()))
        .clone()
}
