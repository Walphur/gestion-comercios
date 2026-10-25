/**
 * Conecta (o reconecta) la cuenta de Mercado Libre y le pasa el token al worker de licencias.
 *
 *   node scripts/mercadolibre/connect.mjs --url     enlace para autorizar (abrirlo con la cuenta vendedora)
 *   node scripts/mercadolibre/connect.mjs CODIGO    canjea el ?code= que vuelve en https://walqo.pro/
 *   node scripts/mercadolibre/connect.mjs --seed    manda al worker el token que ya está en credentials.json
 *
 * Hace falta volver a autorizar cada vez que se suma un permiso en el DevCenter (por ejemplo «Venta y envíos»).
 * Nunca imprime tokens ni el client_secret.
 */
import { writeFile } from "node:fs/promises";
import { API, CRED_PATH, readCredentials } from "./auth.mjs";

const arg = process.argv[2];

async function seedWorker(cred, t) {
  const res = await fetch(`${cred.worker_url.replace(/\/$/, "")}/admin/ml/seed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cred.worker_secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(t),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`El worker no aceptó el token: ${out.error ?? res.status}`);
  return out.expires_at;
}

async function main() {
  const cred = await readCredentials();
  if (!arg || arg === "--url") {
    const u = new URL("https://auth.mercadolibre.com.ar/authorization");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", cred.client_id);
    u.searchParams.set("redirect_uri", cred.redirect_uri);
    console.log(u.toString());
    return;
  }
  if (!cred.worker_url || !cred.worker_secret) throw new Error("Falta worker_url / worker_secret en credentials.json.");

  if (arg === "--seed") {
    const left = (Date.parse(cred.expires_at ?? 0) - Date.now()) / 1000;
    if (left < 600) throw new Error("El token local está por vencer: volvé a autorizar con --url.");
    const exp = await seedWorker(cred, {
      access_token: cred.access_token,
      refresh_token: cred.refresh_token,
      expires_in: Math.floor(left),
    });
    console.log(`Worker con token hasta ${exp}. Desde ahora los scripts lo piden al worker.`);
    return;
  }

  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cred.client_id,
      client_secret: cred.client_secret,
      code: arg,
      redirect_uri: cred.redirect_uri,
    }),
  });
  const t = await res.json();
  if (!res.ok) throw new Error(`No se pudo canjear el código: ${t.message ?? res.status}`);
  const exp = await seedWorker(cred, t);
  cred.access_token = t.access_token;
  cred.refresh_token = t.refresh_token;
  cred.scope = t.scope;
  cred.expires_at = exp;
  await writeFile(CRED_PATH, JSON.stringify(cred, null, 2), "utf8");
  console.log(`Cuenta conectada. Permisos: ${t.scope}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
