import { soapFaultMessage } from "./xml";
import { wsaaEndpoint, wsfeEndpoint, type ArcaAmbiente } from "./types";

const SOAPENV = "http://schemas.xmlsoap.org/soap/envelope/";
const WSAA_NS = "http://wsaa.view.sua.dvadac.desein.afip.gov";
const WSFE_NS = "http://ar.gov.afip.dif.FEV1/";

export function buildWsaaLoginEnvelope(cmsBase64: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${SOAPENV}" xmlns:wsaa="${WSAA_NS}">` +
    `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cmsBase64}</wsaa:in0></wsaa:loginCms></soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

export function buildWsfeEnvelope(bodyFragment: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${SOAPENV}" xmlns:ar="${WSFE_NS}">` +
    `<soapenv:Header/><soapenv:Body>${bodyFragment}</soapenv:Body></soapenv:Envelope>`
  );
}

export async function sendSoap(
  url: string,
  soapAction: string,
  envelope: string,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: soapAction,
      "User-Agent": "WalQo-Web-ARCA/1.0",
    },
    body: envelope,
  });
  const text = await res.text();
  const fault = soapFaultMessage(text);
  if (fault) throw new Error(fault);
  if (!res.ok) throw new Error(`ARCA HTTP ${res.status}`);
  return text;
}

export function wsaaLogin(amb: ArcaAmbiente, cms: string): Promise<string> {
  return sendSoap(wsaaEndpoint(amb), '""', buildWsaaLoginEnvelope(cms));
}

export function wsfeCall(amb: ArcaAmbiente, method: string, body: string): Promise<string> {
  const envelope = buildWsfeEnvelope(body);
  return sendSoap(wsfeEndpoint(amb), `http://ar.gov.afip.dif.FEV1/${method}`, envelope);
}
