//! Servicio WSFEv1 de alto nivel: todos los métodos + emisión + simulación.

use reqwest::Client;

use crate::arca::auth::TokenCache;
use crate::arca::config::ArcaConfig;
use crate::arca::errors::{ArcaError, ArcaResult};
use crate::arca::models::{DummyStatus, WsfeAuth};
use crate::arca::soap::{build_wsfe_envelope, send_soap};
use crate::arca::wsfe::mapper::map_sale_to_cae_request;
use crate::arca::wsfe::models::{
    CotizacionMoneda, FeCaeRespuesta, FeCaeSolicitud, FeCompConsultaReq, FeCompConsultaResp,
    SaleInvoiceInput, TipoComprobante, TipoDocumento, TipoIva, TipoMoneda,
};
use crate::arca::wsfe::request::{
    build_fe_cae_solicitar_body, build_fe_comp_consultar, build_fe_comp_ultimo_autorizado,
    build_fe_dummy, build_param_get, build_param_get_cotizacion, soap_action,
};
use crate::arca::wsfe::response::{
    parse_cotizacion, parse_fe_cae_solicitar, parse_fe_comp_consultar,
    parse_fe_comp_ultimo_autorizado, parse_fe_dummy, parse_tipos_cbte, parse_tipos_doc,
    parse_tipos_iva, parse_tipos_monedas,
};
use crate::arca::wsfe::validation::validate_cae_request;

/// Servicio WSFEv1 con soporte de **modo simulación** (sin red).
pub struct WsfeService<'a> {
    config: &'a ArcaConfig,
    client: &'a Client,
    simulation: bool,
}

impl<'a> WsfeService<'a> {
    pub fn new(config: &'a ArcaConfig, client: &'a Client) -> Self {
        Self {
            config,
            client,
            simulation: false,
        }
    }

    pub fn with_simulation(mut self, simulation: bool) -> Self {
        self.simulation = simulation;
        self
    }

    async fn call(&self, method: &str, body: String) -> ArcaResult<String> {
        if self.simulation {
            return Ok(simulation_response(method, &body));
        }
        let envelope = build_wsfe_envelope(&body);
        send_soap(
            self.client,
            self.config.environment().wsfe_url(),
            &soap_action(method),
            envelope,
        )
        .await
    }

    pub async fn fe_dummy(&self) -> ArcaResult<DummyStatus> {
        let body = build_fe_dummy()?;
        let resp = self.call("FEDummy", body).await?;
        parse_fe_dummy(resp.as_bytes())
    }

    pub async fn fe_comp_ultimo_autorizado(
        &self,
        auth: &WsfeAuth,
        cbte_tipo: u32,
    ) -> ArcaResult<i64> {
        let body = build_fe_comp_ultimo_autorizado(auth, self.config.punto_venta(), cbte_tipo)?;
        let resp = self.call("FECompUltimoAutorizado", body).await?;
        parse_fe_comp_ultimo_autorizado(resp.as_bytes())
    }

    pub async fn fe_cae_solicitar(
        &self,
        auth: &WsfeAuth,
        req: &FeCaeSolicitud,
    ) -> ArcaResult<FeCaeRespuesta> {
        validate_cae_request(self.config, req)?;
        let body = build_fe_cae_solicitar_body(auth, req)?;
        let resp = self.call("FECAESolicitar", body).await?;
        let parsed = parse_fe_cae_solicitar(resp.as_bytes())?;
        if !parsed.aprobado() {
            let msgs: Vec<String> = parsed
                .errores
                .iter()
                .map(|e| format!("[{}] {}", e.code, e.msg))
                .collect();
            return Err(ArcaError::InvalidResponse(format!(
                "ARCA rechazó el comprobante: {}",
                if msgs.is_empty() {
                    "sin detalle".into()
                } else {
                    msgs.join("; ")
                }
            )));
        }
        Ok(parsed)
    }

    pub async fn fe_comp_consultar(
        &self,
        auth: &WsfeAuth,
        req: &FeCompConsultaReq,
    ) -> ArcaResult<FeCompConsultaResp> {
        let body = build_fe_comp_consultar(auth, self.config.punto_venta(), req)?;
        let resp = self.call("FECompConsultar", body).await?;
        parse_fe_comp_consultar(resp.as_bytes())
    }

    pub async fn fe_param_get_tipos_cbte(
        &self,
        auth: &WsfeAuth,
    ) -> ArcaResult<Vec<TipoComprobante>> {
        let body = build_param_get(auth, "FEParamGetTiposCbte")?;
        let resp = self.call("FEParamGetTiposCbte", body).await?;
        parse_tipos_cbte(resp.as_bytes())
    }

    pub async fn fe_param_get_tipos_doc(&self, auth: &WsfeAuth) -> ArcaResult<Vec<TipoDocumento>> {
        let body = build_param_get(auth, "FEParamGetTiposDoc")?;
        let resp = self.call("FEParamGetTiposDoc", body).await?;
        parse_tipos_doc(resp.as_bytes())
    }

    pub async fn fe_param_get_tipos_iva(&self, auth: &WsfeAuth) -> ArcaResult<Vec<TipoIva>> {
        let body = build_param_get(auth, "FEParamGetTiposIva")?;
        let resp = self.call("FEParamGetTiposIva", body).await?;
        parse_tipos_iva(resp.as_bytes())
    }

    pub async fn fe_param_get_tipos_monedas(&self, auth: &WsfeAuth) -> ArcaResult<Vec<TipoMoneda>> {
        let body = build_param_get(auth, "FEParamGetTiposMonedas")?;
        let resp = self.call("FEParamGetTiposMonedas", body).await?;
        parse_tipos_monedas(resp.as_bytes())
    }

    pub async fn fe_param_get_cotizacion(
        &self,
        auth: &WsfeAuth,
        mon_id: &str,
    ) -> ArcaResult<CotizacionMoneda> {
        let body = build_param_get_cotizacion(auth, mon_id)?;
        let resp = self.call("FEParamGetCotizacion", body).await?;
        parse_cotizacion(resp.as_bytes())
    }

    /// Flujo completo de emisión: último autorizado → próximo número → CAE.
    pub async fn emitir_comprobante(
        &self,
        auth: &WsfeAuth,
        sale: &SaleInvoiceInput,
    ) -> ArcaResult<FeCaeRespuesta> {
        let ultimo = self.fe_comp_ultimo_autorizado(auth, sale.cbte_tipo).await?;
        let next = (ultimo + 1) as u64;
        let req = map_sale_to_cae_request(self.config, sale, next)?;
        self.fe_cae_solicitar(auth, &req).await
    }
}

/// Respuestas simuladas para pruebas sin consumir ARCA.
fn simulation_response(method: &str, _body: &str) -> String {
    match method {
        "FEDummy" => {
            r#"<AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer>"#.into()
        }
        "FECompUltimoAutorizado" => "<CbteNro>1234</CbteNro>".into(),
        "FECAESolicitar" => r#"
            <FeCabResp>
              <Cuit>20304050607</Cuit><PtoVta>1</PtoVta><CbteTipo>11</CbteTipo>
              <FchProceso>20260707120000</FchProceso><CantReg>1</CantReg>
              <Resultado>A</Resultado><Reproceso>N</Reproceso>
            </FeCabResp>
            <FeDetResp><FECAEDetResponse>
              <Concepto>1</Concepto><DocTipo>99</DocTipo><DocNro>0</DocNro>
              <CbteDesde>1235</CbteDesde><CbteHasta>1235</CbteHasta><CbteFch>20260707</CbteFch>
              <Resultado>A</Resultado>
              <CAE>71234567890123</CAE><CAEFchVto>20260717</CAEFchVto>
              <Observaciones><Obs><Code>10245</Code><Msg>Simulación OK</Msg></Obs></Observaciones>
            </FECAEDetResponse></FeDetResp>"#
            .into(),
        "FECompConsultar" => r#"
            <Resultado>A</Resultado>
            <CodAutorizacion>71234567890123</CodAutorizacion>
            <FchVto>20260717</FchVto><ImpTotal>100.00</ImpTotal>"#
            .into(),
        "FEParamGetTiposCbte" => r#"<CbteTipo><Id>11</Id><Desc>Factura C</Desc></CbteTipo>"#.into(),
        "FEParamGetTiposDoc" => {
            r#"<DocTipo><Id>99</Id><Desc>Consumidor Final</Desc></DocTipo>"#.into()
        }
        "FEParamGetTiposIva" => r#"<IvaTipo><Id>5</Id><Desc>21%</Desc></IvaTipo>"#.into(),
        "FEParamGetTiposMonedas" => {
            r#"<Moneda><Id>PES</Id><Desc>Peso Argentino</Desc></Moneda>"#.into()
        }
        "FEParamGetCotizacion" => r#"<MonId>PES</MonId><MonCotiz>1</MonCotiz>"#.into(),
        _ => String::new(),
    }
}

/// Emisión de alto nivel reutilizando autenticación y caché.
pub async fn emitir_desde_venta(
    config: &ArcaConfig,
    client: &Client,
    cache: &TokenCache,
    sale: SaleInvoiceInput,
    simulation: bool,
) -> ArcaResult<FeCaeRespuesta> {
    let ticket = crate::arca::auth::autenticar(client, config, cache).await?;
    let auth = WsfeAuth::from_ticket(&ticket, config.cuit());
    WsfeService::new(config, client)
        .with_simulation(simulation)
        .emitir_comprobante(&auth, &sale)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::arca::config::ArcaEnvironment;

    fn test_config() -> ArcaConfig {
        ArcaConfig::new(
            20_304_050_607,
            1,
            "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
            "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
            ArcaEnvironment::Homologacion,
        )
        .unwrap()
    }

    #[tokio::test]
    async fn simulacion_emite_cae_aprobado() {
        let cfg = test_config();
        let http = crate::arca::soap::http_client().unwrap();
        let svc = WsfeService::new(&cfg, &http).with_simulation(true);
        let auth = WsfeAuth {
            token: "T".into(),
            sign: "S".into(),
            cuit: 20_304_050_607,
        };
        let sale = SaleInvoiceInput {
            sale_id: 1,
            total: 100.0,
            subtotal: 100.0,
            discount_pct: 0.0,
            payment_method: "efectivo".into(),
            created_at: "2026-07-07 10:00:00".into(),
            customer_doc_tipo: None,
            customer_doc_nro: None,
            cbte_tipo: 11,
        };
        let r = svc.emitir_comprobante(&auth, &sale).await.unwrap();
        assert!(r.aprobado());
        assert!(r.det.cae.is_some());
        assert!(!r.det.observaciones.is_empty());
    }
}
