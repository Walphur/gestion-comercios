export type ArcaAmbiente = "homo" | "prod";

export interface ArcaConfig {
  cuit: number;
  puntoVenta: number;
  ambiente: ArcaAmbiente;
  certPem: string;
  keyPem: string;
}

export interface AccessTicket {
  token: string;
  sign: string;
  generationTime: string;
  expirationTime: string;
}

export interface SaleLineTax {
  lineTotal: number;
  taxRate: number;
}

export interface CbteAsoc {
  tipo: number;
  ptoVta: number;
  nro: number;
  cuit?: number;
  cbteFch?: string;
}

export interface SaleInvoiceInput {
  saleId: number;
  total: number;
  subtotal: number;
  discountPct: number;
  paymentMethod: string;
  createdAt: string;
  customerDocTipo: number | null;
  customerDocNro: number | null;
  customerDocRaw: string | null;
  customerIvaCondition: number | null;
  emisorIva: string;
  cbteTipo: number;
  lines: SaleLineTax[];
  cbtesAsoc: CbteAsoc[];
}

export interface AlicIva {
  id: number;
  baseImp: number;
  importe: number;
}

export interface FeDetReq {
  concepto: number;
  docTipo: number;
  docNro: number;
  cbteDesde: number;
  cbteHasta: number;
  cbteFch: string;
  impTotal: number;
  impTotConc: number;
  impNeto: number;
  impOpEx: number;
  impTrib: number;
  impIva: number;
  monId: string;
  monCotiz: number;
  condicionIvaReceptor: number;
  iva: AlicIva[];
  cbtesAsoc: CbteAsoc[];
}

export interface FeCaeSolicitud {
  cantReg: number;
  ptoVta: number;
  cbteTipo: number;
  det: FeDetReq;
}

export interface FeMessage {
  code: string;
  msg: string;
}

export interface FeCaeRespuesta {
  resultado: string;
  cae: string | null;
  caeFchVto: string | null;
  cbteDesde: number;
  observaciones: FeMessage[];
  errores: FeMessage[];
  eventos: FeMessage[];
  raw: string;
}

export interface FiscalEnqueueOverride {
  cbteTipo?: number | null;
  parentSaleId?: number | null;
  adjustmentKind?: string | null;
  total?: number | null;
}

export interface FiscalResult {
  voucher_type: string;
  voucher_number: string;
  cbte_tipo: number;
  cbte_nro: number;
  cae: string;
  cae_expires_at: string;
  resultado: string;
  qr_payload: string;
  observaciones: FeMessage[];
  errores: FeMessage[];
  eventos: FeMessage[];
  raw_response: string;
  simulated: boolean;
}

export const FACTURA_A = 1;
export const ND_A = 2;
export const NC_A = 3;
export const FACTURA_B = 6;
export const ND_B = 7;
export const NC_B = 8;
export const FACTURA_C = 11;
export const ND_C = 12;
export const NC_C = 13;

export const DOC_TIPO_CUIT = 80;
export const DOC_TIPO_DNI = 96;
export const DOC_TIPO_CF = 99;
export const CONDICION_IVA_RI = 1;
export const CONDICION_IVA_CF = 5;
export const CONCEPTO_PRODUCTOS = 1;
export const MONEDA_PES = "PES";

export function wsaaEndpoint(amb: ArcaAmbiente): string {
  return amb === "prod"
    ? "https://wsaa.afip.gov.ar/ws/services/LoginCms"
    : "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
}

export function wsfeEndpoint(amb: ArcaAmbiente): string {
  return amb === "prod"
    ? "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
    : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
}
