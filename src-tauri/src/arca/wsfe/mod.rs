//! WSFEv1 — Web Service de Facturación Electrónica (módulo completo).
//!
//! Estructura:
//! - [`models`]: tipos fuertemente tipados
//! - [`request`]: construcción XML/SOAP
//! - [`response`]: parseo de respuestas
//! - [`validation`]: validación previa al envío
//! - [`mapper`]: venta local → FECAESolicitar
//! - [`service`]: orquestación y modo simulación

mod mapper;
mod models;
mod request;
mod response;
mod service;
mod validation;

pub use models::*;
pub use service::{emitir_desde_venta, WsfeService};

use reqwest::Client;

use crate::arca::config::ArcaConfig;
use crate::arca::errors::ArcaResult;
use crate::arca::models::{DummyStatus, WsfeAuth};

/// Cliente WSFEv1 (compatibilidad con código existente).
pub struct Wsfe<'a> {
    inner: WsfeService<'a>,
}

impl<'a> Wsfe<'a> {
    pub fn new(config: &'a ArcaConfig, client: &'a Client) -> Self {
        Self {
            inner: WsfeService::new(config, client),
        }
    }

    #[allow(dead_code)]
    pub fn with_simulation(mut self, simulation: bool) -> Self {
        self.inner = self.inner.with_simulation(simulation);
        self
    }

    pub async fn fe_dummy(&self) -> ArcaResult<DummyStatus> {
        self.inner.fe_dummy().await
    }

    pub async fn fe_comp_ultimo_autorizado(
        &self,
        auth: &WsfeAuth,
        cbte_tipo: u32,
    ) -> ArcaResult<i64> {
        self.inner.fe_comp_ultimo_autorizado(auth, cbte_tipo).await
    }
}
