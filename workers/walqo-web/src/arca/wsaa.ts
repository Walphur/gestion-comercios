import { signTraCms } from "./cms";
import { decryptSecret, encryptSecret } from "./secrets";
import { readSetting, writeSetting } from "./settings";
import { wsaaLogin } from "./soap";
import type { AccessTicket, ArcaConfig } from "./types";
import { findFirstText, requireText } from "./xml";

const K_TA = "arca_ta_enc";
const SAFETY_MS = 5 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO con offset Argentina −03:00 (sin DST). */
function arIso(d: Date): string {
  const t = d.getTime() - 3 * 60 * 60 * 1000;
  const x = new Date(t);
  return (
    `${x.getUTCFullYear()}-${pad2(x.getUTCMonth() + 1)}-${pad2(x.getUTCDate())}` +
    `T${pad2(x.getUTCHours())}:${pad2(x.getUTCMinutes())}:${pad2(x.getUTCSeconds())}-03:00`
  );
}

function buildTraXml(service: string): string {
  const now = Date.now();
  const gen = new Date(now - 10 * 60 * 1000);
  const exp = new Date(now + 2 * 60 * 60 * 1000);
  const uniqueId = Math.floor(now / 1000) % 2_147_483_647;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<loginTicketRequest version="1.0"><header>` +
    `<uniqueId>${uniqueId}</uniqueId>` +
    `<generationTime>${arIso(gen)}</generationTime>` +
    `<expirationTime>${arIso(exp)}</expirationTime>` +
    `</header><service>${service}</service></loginTicketRequest>`
  );
}

function parseTicket(innerXml: string): AccessTicket {
  return {
    token: requireText(innerXml, "token"),
    sign: requireText(innerXml, "sign"),
    generationTime: requireText(innerXml, "generationTime"),
    expirationTime: requireText(innerXml, "expirationTime"),
  };
}

function ticketStillValid(t: AccessTicket): boolean {
  const exp = Date.parse(t.expirationTime);
  if (!Number.isFinite(exp)) return false;
  return Date.now() + SAFETY_MS < exp;
}

export async function loadStoredTicket(): Promise<AccessTicket | null> {
  const enc = await readSetting(K_TA);
  if (!enc?.trim()) return null;
  try {
    const raw = await decryptSecret(enc);
    const t = JSON.parse(raw) as AccessTicket;
    if (!t.token || !t.sign || !t.expirationTime) return null;
    return ticketStillValid(t) ? t : null;
  } catch {
    return null;
  }
}

export async function saveTicket(t: AccessTicket): Promise<void> {
  await writeSetting(K_TA, await encryptSecret(JSON.stringify(t)));
}

export async function clearTicket(): Promise<void> {
  await writeSetting(K_TA, "");
}

export async function requestAccessTicket(config: ArcaConfig): Promise<AccessTicket> {
  const tra = buildTraXml("wsfe");
  const cms = signTraCms(tra, config.certPem, config.keyPem);
  let response: string;
  try {
    response = await wsaaLogin(config.ambiente, cms);
  } catch (e) {
    const msg = String(e);
    if (msg.includes("alreadyAuthenticated")) {
      throw new Error(
        "Ya existe un Token válido en ARCA para este servicio. Esperá a que expire (hasta ~12 h) y volvé a intentar.",
      );
    }
    throw e;
  }
  const inner = findFirstText(response, "loginCmsReturn");
  if (!inner) {
    throw new Error(
      "WSAA no devolvió loginCmsReturn (verificá certificado, servicio habilitado y ambiente).",
    );
  }
  const ticket = parseTicket(inner);
  await saveTicket(ticket);
  return ticket;
}

export async function getAccessTicket(config: ArcaConfig, force = false): Promise<AccessTicket> {
  if (!force) {
    const cached = await loadStoredTicket();
    if (cached) return cached;
  }
  return requestAccessTicket(config);
}
