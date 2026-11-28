import {
  CONDICION_IVA_CF,
  CONDICION_IVA_RI,
  CONCEPTO_PRODUCTOS,
  DOC_TIPO_CF,
  DOC_TIPO_CUIT,
  DOC_TIPO_DNI,
  FACTURA_A,
  FACTURA_B,
  FACTURA_C,
  MONEDA_PES,
  NC_A,
  NC_B,
  NC_C,
  ND_A,
  ND_B,
  ND_C,
  type AlicIva,
  type ArcaConfig,
  type FeCaeSolicitud,
  type FeDetReq,
  type SaleInvoiceInput,
  type SaleLineTax,
} from "./types";

const IVA_21_ID = 5;

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function saleDateToCbteFch(createdAt: string): string {
  const datePart = createdAt.trim().slice(0, 10);
  const normalized = datePart.replace(/-/g, "");
  if (normalized.length !== 8) throw new Error(`fecha de venta inválida: '${createdAt}'`);
  return normalized;
}

export function todayCbteFch(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function taxRateToIvaId(rate: number): number {
  const r = Math.round(rate * 10) / 10;
  if (Math.abs(r - 21) < 0.05) return 5;
  if (Math.abs(r - 10.5) < 0.05) return 4;
  if (Math.abs(r - 27) < 0.05) return 6;
  if (Math.abs(r - 5) < 0.05) return 8;
  if (Math.abs(r - 2.5) < 0.05) return 9;
  if (Math.abs(r) < 0.05) return 3;
  return IVA_21_ID;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

export function resolveReceptorDoc(
  docRaw: string | null | undefined,
  ivaCondition: number | null | undefined,
): [number, number] {
  const digits = docRaw ? digitsOnly(docRaw) : "";
  if (!digits) return [DOC_TIPO_CF, 0];
  const nro = Number.parseInt(digits, 10) || 0;
  if (nro === 0) return [DOC_TIPO_CF, 0];
  if (digits.length === 11) return [DOC_TIPO_CUIT, nro];
  if (digits.length >= 7 && digits.length <= 8) return [DOC_TIPO_DNI, nro];
  if (ivaCondition === CONDICION_IVA_RI) return [DOC_TIPO_CUIT, nro];
  return [DOC_TIPO_DNI, nro];
}

export function resolveFacturaTipo(
  emisorIva: string,
  customerIva: number | null | undefined,
  customerDoc: string | null | undefined,
): number {
  if (emisorIva.trim().toLowerCase() !== "ri") return FACTURA_C;
  const digits = customerDoc ? digitsOnly(customerDoc) : "";
  if (customerIva === CONDICION_IVA_RI && digits.length === 11) return FACTURA_A;
  return FACTURA_B;
}

function letterFamily(cbte: number): "A" | "B" | "C" {
  if (cbte === FACTURA_A || cbte === ND_A || cbte === NC_A) return "A";
  if (cbte === FACTURA_B || cbte === ND_B || cbte === NC_B) return "B";
  return "C";
}

export function adjustmentCbteTipo(original: number, credit: boolean): number {
  const letter = letterFamily(original);
  if (letter === "A") return credit ? NC_A : ND_A;
  if (letter === "B") return credit ? NC_B : ND_B;
  return credit ? NC_C : ND_C;
}

function isFacturaCFamily(cbte: number): boolean {
  return cbte === FACTURA_C || cbte === NC_C || cbte === ND_C;
}

function isFacturaAFamily(cbte: number): boolean {
  return cbte === FACTURA_A || cbte === NC_A || cbte === ND_A;
}

function needsAssociated(cbte: number): boolean {
  return [NC_A, NC_B, NC_C, ND_A, ND_B, ND_C].includes(cbte);
}

function buildIvaAlicuotas(total: number, lines: SaleLineTax[]): [number, number, AlicIva[]] {
  if (lines.length === 0) {
    const impTotal = round2(total);
    const base = round2(impTotal / 1.21);
    const iva = round2(impTotal - base);
    return [base, iva, [{ id: IVA_21_ID, baseImp: base, importe: iva }]];
  }

  const byId = new Map<number, { base: number; iva: number }>();
  let sumLines = 0;
  for (const line of lines) {
    const gross = round2(line.lineTotal);
    sumLines += gross;
    const rate = line.taxRate > 0 ? line.taxRate : 21;
    const id = taxRateToIvaId(rate);
    const base = round2(gross / (1 + rate / 100));
    const iva = round2(gross - base);
    const prev = byId.get(id) ?? { base: 0, iva: 0 };
    byId.set(id, { base: round2(prev.base + base), iva: round2(prev.iva + iva) });
  }

  const target = round2(total);
  const scale = sumLines > 0 && Math.abs(sumLines - target) > 0.02 ? target / sumLines : 1;

  const alic: AlicIva[] = [];
  let neto = 0;
  let ivaSum = 0;
  for (const [id, { base, iva }] of byId) {
    const b = round2(base * scale);
    const i = round2(iva * scale);
    neto = round2(neto + b);
    ivaSum = round2(ivaSum + i);
    alic.push({ id, baseImp: b, importe: i });
  }
  const diff = round2(target - neto - ivaSum);
  if (Math.abs(diff) >= 0.01 && alic.length) {
    const last = alic[alic.length - 1]!;
    last.importe = round2(last.importe + diff);
    ivaSum = round2(ivaSum + diff);
  }
  return [neto, ivaSum, alic];
}

function mapFacturaC(
  total: number,
  docTipo: number,
  docNro: number,
  nro: number,
  cbteFch: string,
): FeDetReq {
  const imp = round2(total);
  return {
    concepto: CONCEPTO_PRODUCTOS,
    docTipo,
    docNro,
    cbteDesde: nro,
    cbteHasta: nro,
    cbteFch,
    impTotal: imp,
    impTotConc: 0,
    impNeto: imp,
    impOpEx: 0,
    impTrib: 0,
    impIva: 0,
    monId: MONEDA_PES,
    monCotiz: 1,
    condicionIvaReceptor: CONDICION_IVA_CF,
    iva: [],
    cbtesAsoc: [],
  };
}

function mapFacturaConIva(
  total: number,
  docTipo: number,
  docNro: number,
  nro: number,
  cbteFch: string,
  condicionIva: number,
  lines: SaleLineTax[],
): FeDetReq {
  const impTotal = round2(total);
  const [neto, iva, alic] = buildIvaAlicuotas(impTotal, lines);
  return {
    concepto: CONCEPTO_PRODUCTOS,
    docTipo,
    docNro,
    cbteDesde: nro,
    cbteHasta: nro,
    cbteFch,
    impTotal,
    impTotConc: 0,
    impNeto: neto,
    impOpEx: 0,
    impTrib: 0,
    impIva: iva,
    monId: MONEDA_PES,
    monCotiz: 1,
    condicionIvaReceptor: condicionIva,
    iva: alic,
    cbtesAsoc: [],
  };
}

export function mapSaleToCaeRequest(
  config: ArcaConfig,
  sale: SaleInvoiceInput,
  nextCbteNro: number,
): FeCaeSolicitud {
  let cbteFch: string;
  try {
    cbteFch = saleDateToCbteFch(sale.createdAt);
  } catch {
    cbteFch = todayCbteFch();
  }

  let docTipo: number;
  let docNro: number;
  if (sale.customerDocTipo != null && sale.customerDocNro != null) {
    docTipo = sale.customerDocTipo;
    docNro = sale.customerDocNro;
  } else {
    [docTipo, docNro] = resolveReceptorDoc(sale.customerDocRaw, sale.customerIvaCondition);
  }

  if (needsAssociated(sale.cbteTipo) && sale.cbtesAsoc.length === 0) {
    throw new Error("las notas de crédito/débito requieren el comprobante asociado");
  }

  if (isFacturaAFamily(sale.cbteTipo)) {
    if (docTipo !== DOC_TIPO_CUIT || docNro === 0) {
      throw new Error("Factura A / NC-ND A exige CUIT del cliente (11 dígitos)");
    }
    const cond = sale.customerIvaCondition ?? CONDICION_IVA_RI;
    if (cond !== CONDICION_IVA_RI) {
      throw new Error("Factura A requiere cliente IVA Responsable Inscripto");
    }
  }

  let det: FeDetReq;
  if (isFacturaCFamily(sale.cbteTipo)) {
    const dt = docTipo === DOC_TIPO_CF ? DOC_TIPO_CF : docTipo;
    const dn = docTipo === DOC_TIPO_CF ? 0 : docNro;
    det = mapFacturaC(sale.total, dt, dn, nextCbteNro, cbteFch);
  } else if (isFacturaAFamily(sale.cbteTipo)) {
    det = mapFacturaConIva(
      sale.total,
      docTipo,
      docNro,
      nextCbteNro,
      cbteFch,
      sale.customerIvaCondition ?? CONDICION_IVA_RI,
      sale.lines,
    );
  } else if (sale.cbteTipo === FACTURA_B || sale.cbteTipo === NC_B || sale.cbteTipo === ND_B) {
    const cond = sale.customerIvaCondition ?? CONDICION_IVA_CF;
    const dt = cond === CONDICION_IVA_CF || docTipo === DOC_TIPO_CF ? DOC_TIPO_CF : docTipo;
    const dn = cond === CONDICION_IVA_CF || docTipo === DOC_TIPO_CF ? 0 : docNro;
    det = mapFacturaConIva(sale.total, dt, dn, nextCbteNro, cbteFch, cond, sale.lines);
  } else {
    throw new Error(`tipo de comprobante ${sale.cbteTipo} no implementado`);
  }

  det.cbtesAsoc = sale.cbtesAsoc;

  return {
    cantReg: 1,
    ptoVta: config.puntoVenta,
    cbteTipo: sale.cbteTipo,
    det,
  };
}

export function cbteTipoLabel(cbteTipo: number): string {
  if (cbteTipo === 1 || cbteTipo === 2 || cbteTipo === 3) return "A";
  if (cbteTipo === 6 || cbteTipo === 7 || cbteTipo === 8) return "B";
  if (cbteTipo === 11 || cbteTipo === 12 || cbteTipo === 13) return "C";
  return `T${cbteTipo}`;
}

export function amt(v: number): string {
  return round2(v).toFixed(2);
}
