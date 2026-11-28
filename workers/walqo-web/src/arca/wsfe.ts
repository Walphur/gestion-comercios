import { amt, mapSaleToCaeRequest } from "./mapper";
import { wsfeCall } from "./soap";
import type {
  AccessTicket,
  ArcaConfig,
  FeCaeRespuesta,
  FeCaeSolicitud,
  FeMessage,
  SaleInvoiceInput,
} from "./types";
import { collectMessages, containsElement, findFirstText, requireText } from "./xml";

function authXml(ticket: AccessTicket, cuit: number): string {
  return (
    `<ar:Auth>` +
    `<ar:Token>${esc(ticket.token)}</ar:Token>` +
    `<ar:Sign>${esc(ticket.sign)}</ar:Sign>` +
    `<ar:Cuit>${cuit}</ar:Cuit>` +
    `</ar:Auth>`
  );
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildFeDummy(): string {
  return `<ar:FEDummy/>`;
}

function buildUltimo(ticket: AccessTicket, cuit: number, ptoVta: number, cbteTipo: number): string {
  return (
    `<ar:FECompUltimoAutorizado>${authXml(ticket, cuit)}` +
    `<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>` +
    `</ar:FECompUltimoAutorizado>`
  );
}

function buildCaeBody(ticket: AccessTicket, cuit: number, req: FeCaeSolicitud): string {
  const d = req.det;
  let ivaXml = "";
  if (d.iva.length) {
    ivaXml =
      `<ar:Iva>` +
      d.iva
        .map(
          (a) =>
            `<ar:AlicIva><ar:Id>${a.id}</ar:Id><ar:BaseImp>${amt(a.baseImp)}</ar:BaseImp>` +
            `<ar:Importe>${amt(a.importe)}</ar:Importe></ar:AlicIva>`,
        )
        .join("") +
      `</ar:Iva>`;
  }
  let asocXml = "";
  if (d.cbtesAsoc.length) {
    asocXml =
      `<ar:CbtesAsoc>` +
      d.cbtesAsoc
        .map((a) => {
          let x =
            `<ar:CbteAsoc><ar:Tipo>${a.tipo}</ar:Tipo><ar:PtoVta>${a.ptoVta}</ar:PtoVta>` +
            `<ar:Nro>${a.nro}</ar:Nro>`;
          if (a.cuit != null) x += `<ar:Cuit>${a.cuit}</ar:Cuit>`;
          if (a.cbteFch) x += `<ar:CbteFch>${a.cbteFch}</ar:CbteFch>`;
          return `${x}</ar:CbteAsoc>`;
        })
        .join("") +
      `</ar:CbtesAsoc>`;
  }

  return (
    `<ar:FECAESolicitar>${authXml(ticket, cuit)}` +
    `<ar:FeCAEReq><ar:FeCabReq>` +
    `<ar:CantReg>${req.cantReg}</ar:CantReg><ar:PtoVta>${req.ptoVta}</ar:PtoVta>` +
    `<ar:CbteTipo>${req.cbteTipo}</ar:CbteTipo></ar:FeCabReq>` +
    `<ar:FeDetReq><ar:FECAEDetRequest>` +
    `<ar:Concepto>${d.concepto}</ar:Concepto>` +
    `<ar:DocTipo>${d.docTipo}</ar:DocTipo><ar:DocNro>${d.docNro}</ar:DocNro>` +
    `<ar:CbteDesde>${d.cbteDesde}</ar:CbteDesde><ar:CbteHasta>${d.cbteHasta}</ar:CbteHasta>` +
    `<ar:CbteFch>${d.cbteFch}</ar:CbteFch>` +
    `<ar:ImpTotal>${amt(d.impTotal)}</ar:ImpTotal><ar:ImpTotConc>${amt(d.impTotConc)}</ar:ImpTotConc>` +
    `<ar:ImpNeto>${amt(d.impNeto)}</ar:ImpNeto><ar:ImpOpEx>${amt(d.impOpEx)}</ar:ImpOpEx>` +
    `<ar:ImpTrib>${amt(d.impTrib)}</ar:ImpTrib><ar:ImpIVA>${amt(d.impIva)}</ar:ImpIVA>` +
    `<ar:MonId>${d.monId}</ar:MonId><ar:MonCotiz>${amt(d.monCotiz)}</ar:MonCotiz>` +
    `<ar:CondicionIVAReceptorId>${d.condicionIvaReceptor}</ar:CondicionIVAReceptorId>` +
    ivaXml +
    asocXml +
    `</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq></ar:FECAESolicitar>`
  );
}

function ensureNoErrors(xml: string): void {
  if (!containsElement(xml, "Errors")) return;
  const errs = collectMessages(xml, "Err");
  if (!errs.length) {
    const code = findFirstText(xml, "Code") ?? "?";
    const msg = findFirstText(xml, "Msg") ?? "Error WSFE";
    throw new Error(`WSFE [${code}]: ${msg}`);
  }
  throw new Error(errs.map((e) => `[${e.code}] ${e.msg}`).join("; "));
}

function parseCae(xml: string): FeCaeRespuesta {
  ensureNoErrors(xml);
  const resultado = findFirstText(xml, "Resultado") ?? "R";
  const cae = findFirstText(xml, "CAE");
  const caeFchVto = findFirstText(xml, "CAEFchVto");
  const cbteDesde = Number.parseInt(findFirstText(xml, "CbteDesde") ?? "0", 10) || 0;
  const observaciones = collectMessages(xml, "Obs");
  const errores = collectMessages(xml, "Err");
  const eventos = collectMessages(xml, "Evt");
  return {
    resultado,
    cae,
    caeFchVto,
    cbteDesde,
    observaciones,
    errores,
    eventos,
    raw: xml,
  };
}

function simUltimo(): string {
  return "<CbteNro>1234</CbteNro>";
}

function simCae(): string {
  return `<FeCabResp>
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
  </FECAEDetResponse></FeDetResp>`;
}

export async function feDummy(config: ArcaConfig, simulation: boolean): Promise<{
  app_server: string;
  db_server: string;
  auth_server: string;
}> {
  const xml = simulation
    ? "<AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer>"
    : await wsfeCall(config.ambiente, "FEDummy", buildFeDummy());
  return {
    app_server: findFirstText(xml, "AppServer") ?? "",
    db_server: findFirstText(xml, "DbServer") ?? "",
    auth_server: findFirstText(xml, "AuthServer") ?? "",
  };
}

export async function feUltimo(
  config: ArcaConfig,
  ticket: AccessTicket,
  cbteTipo: number,
  simulation: boolean,
): Promise<number> {
  const xml = simulation
    ? simUltimo()
    : await wsfeCall(
        config.ambiente,
        "FECompUltimoAutorizado",
        buildUltimo(ticket, config.cuit, config.puntoVenta, cbteTipo),
      );
  ensureNoErrors(xml);
  return Number.parseInt(requireText(xml, "CbteNro"), 10);
}

export async function emitirComprobante(
  config: ArcaConfig,
  ticket: AccessTicket,
  sale: SaleInvoiceInput,
  simulation: boolean,
): Promise<FeCaeRespuesta> {
  const ultimo = await feUltimo(config, ticket, sale.cbteTipo, simulation);
  const next = ultimo + 1;
  const req = mapSaleToCaeRequest(config, sale, next);
  const xml = simulation
    ? simCae()
    : await wsfeCall(config.ambiente, "FECAESolicitar", buildCaeBody(ticket, config.cuit, req));
  const parsed = parseCae(xml);
  if (parsed.resultado !== "A" || !parsed.cae) {
    const msgs: FeMessage[] = [...parsed.errores, ...parsed.observaciones];
    throw new Error(
      `ARCA rechazó el comprobante: ${
        msgs.length ? msgs.map((m) => `[${m.code}] ${m.msg}`).join("; ") : "sin detalle"
      }`,
    );
  }
  return parsed;
}
