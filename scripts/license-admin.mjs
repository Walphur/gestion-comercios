#!/usr/bin/env node
/**
 * Genera claves de licencia contra el Worker de Waltech.
 *
 * Uso:
 *   node scripts/license-admin.mjs create --plan basic --monthly
 *   node scripts/license-admin.mjs create --plan pro --devices 3 --monthly --months 1 --note "ML #12345"
 *   node scripts/license-admin.mjs extend --key GC-XXXX --months 1
 *   node scripts/license-admin.mjs list
 *   node scripts/license-admin.mjs revoke --key GC-XXXX-XXXX-XXXX
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = join(__dirname, "../workers/license-api/.admin-secret.txt");

const API = process.env.LICENSE_API_URL ?? "https://gestion-comercios-license.walphur.workers.dev";

function loadAdminSecret() {
  if (process.env.LICENSE_ADMIN_SECRET?.trim()) {
    return process.env.LICENSE_ADMIN_SECRET.trim();
  }
  if (existsSync(SECRET_FILE)) {
    return readFileSync(SECRET_FILE, "utf8").trim();
  }
  return null;
}

const SECRET = loadAdminSecret();

function parseArgs(argv) {
  const cmd = argv[0] ?? "help";
  const opts = { monthly: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--plan") opts.plan = argv[++i];
    else if (a === "--devices") opts.devices = Number(argv[++i]);
    else if (a === "--note") opts.note = argv[++i];
    else if (a === "--key") opts.key = argv[++i];
    else if (a === "--months") opts.months = Number(argv[++i]);
    else if (a === "--days") opts.days = Number(argv[++i]);
    else if (a === "--monthly") opts.monthly = true;
  }
  return { cmd, opts };
}

async function api(path, method, body) {
  if (!SECRET) {
    console.error("Falta el secreto admin.");
    console.error(`Definí LICENSE_ADMIN_SECRET o creá: ${SECRET_FILE}`);
    process.exit(1);
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SECRET}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    console.error(data.message ?? data.error ?? res.statusText);
    process.exit(1);
  }
  return data;
}

const { cmd, opts } = parseArgs(process.argv.slice(2));

if (cmd === "create") {
  const plan = opts.plan ?? "basic";
  const data = await api("/admin/create", "POST", {
    plan,
    max_devices: opts.devices ?? (plan === "pro" ? 3 : 1),
    buyer_note: opts.note,
    billing: opts.monthly ? "monthly" : "perpetual",
    months: opts.months ?? 1,
    days: opts.days,
  });
  const planLabel = data.plan === "pro" ? "Pro" : "Básico";
  const billingLabel = data.billing === "monthly" ? "Suscripción mensual" : "Permanente";
  console.log("");
  console.log("========================================");
  console.log("  LICENCIA CREADA");
  console.log("========================================");
  console.log(`  Clave:  ${data.license_key}`);
  console.log(`  Plan:   ${planLabel} (${data.max_devices} PC)`);
  console.log(`  Tipo:   ${billingLabel}`);
  if (data.expires_at) console.log(`  Vence:  ${new Date(data.expires_at).toLocaleDateString("es-AR")}`);
  if (opts.note) console.log(`  Nota:   ${opts.note}`);
  console.log("");
  console.log("--- Mensaje para copiar al comprador ---");
  console.log("");
  console.log(`¡Gracias por tu compra!`);
  console.log("");
  console.log(`1) Descargá e instalá:`);
  console.log(`   https://github.com/Walphur/gestion-comercios/releases/latest`);
  console.log("");
  console.log(`2) Clave de licencia:`);
  console.log(`   ${data.license_key}`);
  console.log("");
  console.log(`Plan: ${planLabel} — ${billingLabel}`);
  if (data.expires_at) {
    console.log(`Válida hasta: ${new Date(data.expires_at).toLocaleDateString("es-AR")}`);
    console.log(`Para renovar, escribinos por WhatsApp antes de esa fecha.`);
  }
  console.log("");
  console.log("--- Fin del mensaje ---");
  console.log("");
} else if (cmd === "extend") {
  if (!opts.key) {
    console.error("Usá --key GC-XXXX-XXXX-XXXX");
    process.exit(1);
  }
  const data = await api("/admin/extend", "POST", {
    license_key: opts.key,
    months: opts.months ?? 1,
    days: opts.days,
  });
  console.log(`Renovada: ${data.license_key}`);
  console.log(`Nuevo vencimiento: ${new Date(data.expires_at).toLocaleDateString("es-AR")}`);
} else if (cmd === "list") {
  const data = await api("/admin/list", "GET");
  for (const row of data.licenses ?? []) {
    const exp = row.expires_at
      ? new Date(row.expires_at).toLocaleDateString("es-AR")
      : "—";
    console.log(
      `${row.license_key}  ${row.plan}  ${row.billing_type ?? "perpetual"}  vence:${exp}  ${row.max_devices}pc  ${row.revoked ? "REVOCADA" : "OK"}  ${row.buyer_note ?? ""}`,
    );
  }
} else if (cmd === "revoke") {
  if (!opts.key) {
    console.error("Usá --key GC-XXXX-XXXX-XXXX");
    process.exit(1);
  }
  await api("/admin/revoke", "POST", { license_key: opts.key });
  console.log(`Revocada: ${opts.key}`);
} else {
  console.log(`Comandos: create | extend | list | revoke
Opciones create: --plan basic|pro --devices N --monthly --months 1 --note "..."
Opciones extend: --key GC-... --months 1
Variables: LICENSE_API_URL, LICENSE_ADMIN_SECRET`);
}
