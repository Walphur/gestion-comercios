import { getDb } from "../../../../src/db/index";
import {
  adjustmentCbteTipo,
  cbteTipoLabel,
  resolveFacturaTipo,
  resolveReceptorDoc,
  saleDateToCbteFch,
  todayCbteFch,
} from "./mapper";
import { decryptSecret } from "./secrets";
import { readSetting, writeSetting } from "./settings";
import type {
  ArcaConfig,
  FiscalEnqueueOverride,
  FiscalResult,
  SaleInvoiceInput,
  SaleLineTax,
} from "./types";
import { getAccessTicket } from "./wsaa";
import { emitirComprobante } from "./wsfe";

const K_CUIT = "arca_cuit";
const K_PV = "arca_punto_venta";
const K_AMB = "arca_ambiente";
const K_CERT = "arca_cert_enc";
const K_KEY = "arca_key_enc";
const K_SIM = "arca_simulation";

export async function isSimulation(): Promise<boolean> {
  return (await readSetting(K_SIM)) === "1";
}

export async function isConfigured(): Promise<boolean> {
  const cuit = await readSetting(K_CUIT);
  const cert = await readSetting(K_CERT);
  const key = await readSetting(K_KEY);
  return Boolean(cuit?.trim() && cert?.trim() && key?.trim());
}

export async function loadArcaConfig(): Promise<ArcaConfig> {
  const cuitRaw = (await readSetting(K_CUIT))?.trim();
  const pvRaw = (await readSetting(K_PV))?.trim();
  const amb = (await readSetting(K_AMB)) ?? "homo";
  const certEnc = await readSetting(K_CERT);
  const keyEnc = await readSetting(K_KEY);
  if (!cuitRaw) throw new Error("Falta el CUIT.");
  if (!pvRaw) throw new Error("Falta el punto de venta.");
  if (!certEnc) throw new Error("Falta el certificado.");
  if (!keyEnc) throw new Error("Falta la clave privada.");
  const cuit = Number.parseInt(cuitRaw.replace(/\D/g, ""), 10);
  const puntoVenta = Number.parseInt(pvRaw, 10);
  if (!Number.isFinite(cuit) || String(cuit).length !== 11) throw new Error("CUIT inválido.");
  if (!Number.isFinite(puntoVenta) || puntoVenta <= 0) throw new Error("Punto de venta inválido.");
  return {
    cuit,
    puntoVenta,
    ambiente: amb === "prod" ? "prod" : "homo",
    certPem: await decryptSecret(certEnc),
    keyPem: await decryptSecret(keyEnc),
  };
}

async function loadEmisorIva(): Promise<string> {
  const v = (await readSetting("arca_emisor_iva"))?.trim().toLowerCase();
  if (v === "ri" || v === "monotributo" || v === "exento") return v;
  const legacy = Number.parseInt((await readSetting("arca_cbte_tipo")) ?? "11", 10);
  return legacy === 1 || legacy === 6 ? "ri" : "monotributo";
}

export async function loadSaleInvoiceInput(
  saleId: number,
  ov: FiscalEnqueueOverride = {},
): Promise<SaleInvoiceInput> {
  const db = await getDb();
  const sales = await db.select<
    {
      total: number;
      subtotal: number;
      discount_pct: number;
      payment_method: string;
      created_at: string;
    }[]
  >(
    `SELECT total, subtotal, discount_pct, payment_method, created_at
     FROM sales WHERE id = ?1 AND voided = 0`,
    [saleId],
  );
  if (!sales[0]) throw new Error(`Venta ${saleId} no encontrada`);
  const sale = sales[0];

  const cust = await db.select<{ document: string | null; iva_condition: number | null }[]>(
    `SELECT c.document, c.iva_condition FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?1`,
    [saleId],
  );
  const docRaw = cust[0]?.document ?? null;
  const ivaCond = cust[0]?.iva_condition ?? null;
  const emisorIva = await loadEmisorIva();
  const [docTipoResolved, docNroResolved] = resolveReceptorDoc(docRaw, ivaCond);
  const customerDocTipo = docTipoResolved === 99 ? null : docTipoResolved;
  const customerDocNro = docTipoResolved === 99 ? null : docNroResolved;

  const lineRows = await db.select<{ line_total: number; tax_rate: number }[]>(
    `SELECT si.line_total, COALESCE(p.tax_rate, 21) AS tax_rate
     FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
     WHERE si.sale_id = ?1`,
    [saleId],
  );
  const lines: SaleLineTax[] = lineRows.map((r) => ({
    lineTotal: Number(r.line_total) || 0,
    taxRate: Number(r.tax_rate) || 21,
  }));

  let cbteTipo =
    ov.cbteTipo ?? resolveFacturaTipo(emisorIva, ivaCond, docRaw);
  const cbtesAsoc: SaleInvoiceInput["cbtesAsoc"] = [];

  if (ov.parentSaleId) {
    const parent = await db.select<
      { cbte_tipo: number; cbte_nro: number; cae_expires_at: string | null }[]
    >(
      `SELECT cbte_tipo, cbte_nro, cae_expires_at FROM fiscal_documents
       WHERE sale_id = ?1 AND cae IS NOT NULL AND TRIM(cae) != ''
       ORDER BY id DESC LIMIT 1`,
      [ov.parentSaleId],
    );
    if (!parent[0]) throw new Error(`No hay factura con CAE para la venta ${ov.parentSaleId}`);
    const pto = Number.parseInt((await readSetting(K_PV)) ?? "1", 10) || 1;
    const cuitDigits = ((await readSetting(K_CUIT)) ?? "").replace(/\D/g, "");
    const cuit = cuitDigits ? Number.parseInt(cuitDigits, 10) : undefined;
    const parentCreated = await db.select<{ created_at: string }[]>(
      "SELECT created_at FROM sales WHERE id = ?1",
      [ov.parentSaleId],
    );
    let fch: string;
    try {
      fch = saleDateToCbteFch(parentCreated[0]?.created_at ?? sale.created_at);
    } catch {
      fch = todayCbteFch();
    }
    const credit = (ov.adjustmentKind ?? "credit") !== "debit";
    cbteTipo = ov.cbteTipo ?? adjustmentCbteTipo(parent[0].cbte_tipo, credit);
    cbtesAsoc.push({
      tipo: parent[0].cbte_tipo,
      ptoVta: pto,
      nro: parent[0].cbte_nro,
      cuit,
      cbteFch: fch,
    });
  }

  return {
    saleId,
    total: Math.abs(ov.total ?? sale.total),
    subtotal: sale.subtotal,
    discountPct: sale.discount_pct,
    paymentMethod: sale.payment_method,
    createdAt: sale.created_at,
    customerDocTipo,
    customerDocNro,
    customerDocRaw: docRaw,
    customerIvaCondition: ivaCond,
    emisorIva,
    cbteTipo,
    lines,
    cbtesAsoc,
  };
}

function buildQr(
  cuit: number,
  cbteTipo: number,
  ptoVta: number,
  cbteNro: number,
  total: number,
  cae: string,
): string {
  return `https://www.afip.gob.ar/fe/qr/?p={"ver":1,"fecha":"","cuit":${cuit},"ptoVta":${ptoVta},"tipoCmp":${cbteTipo},"nroCmp":${cbteNro},"importe":${total.toFixed(2)},"moneda":"PES","ctz":1,"tipoCodAut":"E","codAut":${cae}}`;
}

export async function requestFiscalInvoice(
  saleId: number,
  ov: FiscalEnqueueOverride = {},
): Promise<FiscalResult> {
  if (!(await isConfigured())) {
    throw new Error(
      "ARCA no está configurado. Completá CUIT, punto de venta y certificado en Administración.",
    );
  }
  const sale = await loadSaleInvoiceInput(saleId, ov);
  const config = await loadArcaConfig();
  const simulation = await isSimulation();
  const ticket = simulation
    ? { token: "SIM", sign: "SIM", generationTime: "", expirationTime: "" }
    : await getAccessTicket(config);
  const resp = await emitirComprobante(config, ticket, sale, simulation);
  const cae = resp.cae!;
  await writeSetting("arca_last_ok_at", String(Math.floor(Date.now() / 1000)));
  return {
    voucher_type: cbteTipoLabel(sale.cbteTipo),
    voucher_number: `${String(config.puntoVenta).padStart(4, "0")}-${String(resp.cbteDesde).padStart(8, "0")}`,
    cbte_tipo: sale.cbteTipo,
    cbte_nro: resp.cbteDesde,
    cae,
    cae_expires_at: resp.caeFchVto ?? "",
    resultado: resp.resultado,
    qr_payload: buildQr(config.cuit, sale.cbteTipo, config.puntoVenta, resp.cbteDesde, sale.total, cae),
    observaciones: resp.observaciones,
    errores: resp.errores,
    eventos: resp.eventos,
    raw_response: resp.raw,
    simulated: simulation,
  };
}

export async function persistFiscalResult(
  saleId: number,
  result: FiscalResult,
  ov: FiscalEnqueueOverride = {},
): Promise<void> {
  const db = await getDb();
  const obs = JSON.stringify(result.observaciones);
  const err = JSON.stringify(result.errores);
  const evt = JSON.stringify(result.eventos);
  const isAdj = Boolean(ov.parentSaleId) || Boolean(ov.adjustmentKind?.trim());

  const existing = isAdj
    ? []
    : await db.select<{ id: number }[]>(
        `SELECT id FROM fiscal_documents WHERE sale_id = ?1
         AND (adjustment_kind IS NULL OR TRIM(adjustment_kind) = '') LIMIT 1`,
        [saleId],
      );

  if (existing[0]) {
    await db.execute(
      `UPDATE fiscal_documents SET
         voucher_type=?2, voucher_number=?3, cbte_tipo=?4, cbte_nro=?5,
         cae=?6, cae_expires_at=?7, resultado=?8, observaciones=?9,
         errores=?10, eventos=?11, qr_payload=?12, raw_response=?13, simulated=?14
       WHERE id=?1`,
      [
        existing[0].id,
        result.voucher_type,
        result.voucher_number,
        result.cbte_tipo,
        result.cbte_nro,
        result.cae,
        result.cae_expires_at,
        result.resultado,
        obs,
        err,
        evt,
        result.qr_payload,
        result.raw_response,
        result.simulated ? 1 : 0,
      ],
    );
  } else {
    await db.execute(
      `INSERT INTO fiscal_documents
       (sale_id, voucher_type, voucher_number, cbte_tipo, cbte_nro, cae, cae_expires_at,
        resultado, observaciones, errores, eventos, qr_payload, raw_response, simulated,
        parent_sale_id, adjustment_kind)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)`,
      [
        saleId,
        result.voucher_type,
        result.voucher_number,
        result.cbte_tipo,
        result.cbte_nro,
        result.cae,
        result.cae_expires_at,
        result.resultado,
        obs,
        err,
        evt,
        result.qr_payload,
        result.raw_response,
        result.simulated ? 1 : 0,
        ov.parentSaleId ?? null,
        ov.adjustmentKind ?? null,
      ],
    );
  }

  await db.execute(
    `UPDATE sales SET requires_fiscal = 1, fiscal_status = 'ok' WHERE id = ?1`,
    [saleId],
  );
}

/** En la web no hay cola en background: emitimos al instante. */
export async function queueAndEmit(
  saleId: number,
  cbteTipo?: number | null,
): Promise<void> {
  const ov: FiscalEnqueueOverride = { cbteTipo: cbteTipo ?? null };
  const db = await getDb();
  await db.execute(
    `UPDATE sales SET requires_fiscal = 1, fiscal_status = 'pending' WHERE id = ?1`,
    [saleId],
  );
  try {
    const result = await requestFiscalInvoice(saleId, ov);
    await persistFiscalResult(saleId, result, ov);
  } catch (e) {
    await db.execute(`UPDATE sales SET fiscal_status = 'failed' WHERE id = ?1`, [saleId]);
    throw e;
  }
}

export async function emitFiscalAdjustment(
  parentSaleId: number,
  kind: string,
  amount?: number | null,
): Promise<number> {
  const k = kind.trim().toLowerCase();
  if (k !== "credit" && k !== "debit") throw new Error("Tipo de ajuste inválido (credit|debit)");

  const db = await getDb();
  const parent = await db.select<
    {
      customer_id: number | null;
      total: number;
      user_id: number | null;
      payment_method: string;
    }[]
  >(
    `SELECT customer_id, total, user_id, payment_method FROM sales
     WHERE id = ?1 AND voided = 0`,
    [parentSaleId],
  );
  if (!parent[0]) throw new Error(`Venta ${parentSaleId} no encontrada`);

  const hasCae = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM fiscal_documents
     WHERE sale_id = ?1 AND cae IS NOT NULL AND TRIM(cae) != ''
       AND (adjustment_kind IS NULL OR TRIM(COALESCE(adjustment_kind,'')) = '')`,
    [parentSaleId],
  );
  if (!hasCae[0]?.n) throw new Error("Esa venta no tiene factura con CAE para ajustar.");

  const amt = Math.abs(amount ?? parent[0].total);
  const note =
    k === "credit"
      ? `Nota de crédito sobre venta #${parentSaleId}`
      : `Nota de débito sobre venta #${parentSaleId}`;

  await db.execute(
    `INSERT INTO sales (customer_id, user_id, subtotal, discount_pct, total, payment_method, note, requires_fiscal, fiscal_status)
     VALUES (?1, ?2, ?3, 0, ?3, ?4, ?5, 1, 'pending')`,
    [parent[0].customer_id, parent[0].user_id, amt, parent[0].payment_method, note],
  );
  const idRows = await db.select<{ id: number }[]>("SELECT last_insert_rowid() AS id");
  const newSaleId = idRows[0]?.id;
  if (!newSaleId) throw new Error("No se pudo crear la nota.");

  const ov: FiscalEnqueueOverride = {
    parentSaleId,
    adjustmentKind: k,
    total: amt,
  };
  try {
    const result = await requestFiscalInvoice(newSaleId, ov);
    await persistFiscalResult(newSaleId, result, ov);
  } catch (e) {
    await db.execute(`UPDATE sales SET fiscal_status = 'failed' WHERE id = ?1`, [newSaleId]);
    throw e;
  }
  return newSaleId;
}
