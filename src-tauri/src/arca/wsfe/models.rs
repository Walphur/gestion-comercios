//! Modelos fuertemente tipados de WSFEv1.
//!
//! Sin `HashMap` ni JSON dinámico: cada campo del protocolo ARCA tiene su tipo.

use serde::{Deserialize, Serialize};

/// Resultado de procesamiento de un comprobante (`A` = aprobado, `R` = rechazado).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FeResultado {
    Aprobado,
    Rechazado,
    Parcial,
}

impl FeResultado {
    pub fn from_arca(s: &str) -> Self {
        match s.trim().to_uppercase().as_str() {
            "A" => Self::Aprobado,
            "R" => Self::Rechazado,
            "P" => Self::Parcial,
            _ => Self::Rechazado,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Aprobado => "A",
            Self::Rechazado => "R",
            Self::Parcial => "P",
        }
    }
}

/// Mensaje de observación, error o evento devuelto por WSFE.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FeMessage {
    pub code: String,
    pub msg: String,
}

/// Tipo de comprobante (tabla paramétrica).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TipoComprobante {
    pub id: u32,
    pub desc: String,
    pub fch_desde: Option<String>,
    pub fch_hasta: Option<String>,
}

/// Tipo de documento del receptor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TipoDocumento {
    pub id: u32,
    pub desc: String,
    pub fch_desde: Option<String>,
    pub fch_hasta: Option<String>,
}

/// Alícuota de IVA.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TipoIva {
    pub id: u32,
    pub desc: String,
    pub fch_desde: Option<String>,
    pub fch_hasta: Option<String>,
}

/// Moneda.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TipoMoneda {
    pub id: String,
    pub desc: String,
    pub fch_desde: Option<String>,
    pub fch_hasta: Option<String>,
}

/// Cotización de moneda.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CotizacionMoneda {
    pub mon_id: String,
    pub mon_cotiz: f64,
    pub fch_cotiz: Option<String>,
}

/// Cabecera de solicitud FECAESolicitar.
#[derive(Debug, Clone)]
pub struct FeCabReq {
    pub cant_reg: u32,
    pub pto_vta: u32,
    pub cbte_tipo: u32,
}

/// Alícuota de IVA en el detalle del comprobante.
#[derive(Debug, Clone)]
pub struct AlicIva {
    pub id: u32,
    pub base_imp: f64,
    pub importe: f64,
}

/// Detalle de un comprobante a solicitar (FECAESolicitar).
#[derive(Debug, Clone)]
pub struct FeDetReq {
    pub concepto: u32,
    pub doc_tipo: u32,
    pub doc_nro: u64,
    pub cbte_desde: u64,
    pub cbte_hasta: u64,
    pub cbte_fch: String,
    pub imp_total: f64,
    pub imp_tot_conc: f64,
    pub imp_neto: f64,
    pub imp_op_ex: f64,
    pub imp_trib: f64,
    pub imp_iva: f64,
    pub mon_id: String,
    pub mon_cotiz: f64,
    /// Condición frente al IVA del receptor (obligatorio RG 5615).
    pub condicion_iva_receptor: u32,
    pub iva: Vec<AlicIva>,
}

/// Solicitud completa de CAE.
#[derive(Debug, Clone)]
pub struct FeCaeSolicitud {
    pub cab: FeCabReq,
    pub det: FeDetReq,
}

/// Respuesta de cabecera FECAESolicitar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeCabResp {
    pub cuit: u64,
    pub pto_vta: u32,
    pub cbte_tipo: u32,
    pub fch_proceso: String,
    pub cant_reg: u32,
    pub resultado: FeResultado,
    pub reproceso: String,
}

/// Respuesta de detalle FECAESolicitar (un comprobante).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeDetResp {
    pub concepto: u32,
    pub doc_tipo: u32,
    pub doc_nro: u64,
    pub cbte_desde: u64,
    pub cbte_hasta: u64,
    pub cbte_fch: String,
    pub resultado: FeResultado,
    pub cae: Option<String>,
    pub cae_fch_vto: Option<String>,
    pub observaciones: Vec<FeMessage>,
}

/// Resultado completo de FECAESolicitar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeCaeRespuesta {
    pub cab: FeCabResp,
    pub det: FeDetResp,
    pub errores: Vec<FeMessage>,
    pub eventos: Vec<FeMessage>,
}

impl FeCaeRespuesta {
    pub fn aprobado(&self) -> bool {
        self.det.resultado == FeResultado::Aprobado && self.det.cae.is_some()
    }

    pub fn numero_formateado(&self, pto_vta: u32) -> String {
        format!("{:04}-{:08}", pto_vta, self.det.cbte_desde)
    }
}

/// Consulta de comprobante existente (FECompConsultar).
#[derive(Debug, Clone)]
pub struct FeCompConsultaReq {
    pub cbte_tipo: u32,
    pub cbte_nro: u64,
}

/// Resultado de FECompConsultar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeCompConsultaResp {
    pub resultado: FeResultado,
    pub cae: Option<String>,
    pub cae_fch_vto: Option<String>,
    pub cbte_fch: Option<String>,
    pub imp_total: Option<f64>,
    pub observaciones: Vec<FeMessage>,
    pub errores: Vec<FeMessage>,
}

/// Datos de venta listos para mapear a FECAESolicitar.
#[derive(Debug, Clone)]
pub struct SaleInvoiceInput {
    pub sale_id: i64,
    pub total: f64,
    pub subtotal: f64,
    pub discount_pct: f64,
    pub payment_method: String,
    pub created_at: String,
    pub customer_doc_tipo: Option<u32>,
    pub customer_doc_nro: Option<u64>,
    pub cbte_tipo: u32,
}
