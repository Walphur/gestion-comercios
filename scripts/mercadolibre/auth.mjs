/**
 * Acceso a la API de Mercado Libre para los scripts locales.
 *
 * El refresh_token de Mercado Libre se usa una sola vez: si lo renuevan dos lados, uno queda
 * afuera. Por eso, cuando credentials.json tiene worker_url y worker_secret, el token lo pide
 * al worker de licencias (que es el dueño de la renovación) y no lo renueva acá.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const API = "https://api.mercadolibre.com";
export const CRED_PATH = path.join(process.env.LOCALAPPDATA, "WalQo", "mercadolibre", "credentials.json");

export async function readJson(p, fallback) {
  if (!existsSync(p)) return fallback;
  return JSON.parse((await readFile(p, "utf8")).replace(/^\uFEFF/, ""));
}

export async function readCredentials() {
  const cred = await readJson(CRED_PATH, null);
  if (!cred?.access_token && !cred?.worker_secret) throw new Error("Falta conectar la cuenta de Mercado Libre.");
  return cred;
}

async function tokenFromWorker(cred) {
  const res = await fetch(`${cred.worker_url.replace(/\/$/, "")}/admin/ml/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cred.worker_secret}` },
    signal: AbortSignal.timeout(30_000),
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok || !t.access_token) throw new Error(`El worker no dio el acceso: ${t.error ?? res.status}`);
  cred.access_token = t.access_token;
  cred.expires_at = t.expires_at;
  await writeFile(CRED_PATH, JSON.stringify(cred, null, 2), "utf8");
  return cred.access_token;
}

export async function getToken() {
  const cred = await readCredentials();
  const expiresAt = Date.parse(cred.expires_at ?? 0);
  if (cred.access_token && Date.now() < expiresAt - 5 * 60_000) return cred.access_token;
  if (cred.worker_url && cred.worker_secret) return tokenFromWorker(cred);

  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cred.client_id,
      client_secret: cred.client_secret,
      refresh_token: cred.refresh_token,
    }),
  });
  const t = await res.json();
  if (!res.ok) throw new Error(`No se pudo renovar el acceso: ${t.message ?? res.status}`);
  cred.access_token = t.access_token;
  cred.refresh_token = t.refresh_token ?? cred.refresh_token;
  cred.expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await writeFile(CRED_PATH, JSON.stringify(cred, null, 2), "utf8");
  return cred.access_token;
}

export async function api(token, method, url, body, headers = {}) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { ok: res.ok, status: res.status, data };
}
