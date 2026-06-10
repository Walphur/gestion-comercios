#!/usr/bin/env node
/**
 * Genera claves de licencia contra el Worker de Waltech.
 *
 * Uso:
 *   LICENSE_API_URL=https://... LICENSE_ADMIN_SECRET=xxx node scripts/license-admin.mjs create --plan basic
 *   LICENSE_API_URL=https://... LICENSE_ADMIN_SECRET=xxx node scripts/license-admin.mjs create --plan pro --devices 3 --note "ML #12345"
 *   LICENSE_API_URL=https://... LICENSE_ADMIN_SECRET=xxx node scripts/license-admin.mjs list
 *   LICENSE_API_URL=https://... LICENSE_ADMIN_SECRET=xxx node scripts/license-admin.mjs revoke --key GC-XXXX-XXXX-XXXX
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
  const opts = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--plan") opts.plan = argv[++i];
    else if (a === "--devices") opts.devices = Number(argv[++i]);
    else if (a === "--note") opts.note = argv[++i];
    else if (a === "--key") opts.key = argv[++i];
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
  });
  const planLabel = data.plan === "pro" ? "Pro" : "Básico";
  console.log("");
  console.log("========================================");
  console.log("  LICENCIA CREADA");
  console.log("========================================");
  console.log(`  Clave:  ${data.license_key}`);
  console.log(`  Plan:   ${planLabel} (${data.max_devices} PC)`);
  if (opts.note) console.log(`  Nota:   ${opts.note}`);
  console.log("");
  console.log("--- Mensaje para copiar al comprador (ML) ---");
  console.log("");
  console.log(`¡Gracias por tu compra!`);
  console.log("");
  console.log(`1) Descargá e instalá desde:`);
  console.log(`   https://github.com/Walphur/gestion-comercios/releases/latest`);
  console.log("");
  console.log(`2) Al abrir la app, ingresá esta clave de licencia:`);
  console.log(`   ${data.license_key}`);
  console.log("");
  console.log(`Plan: ${planLabel} — válida para ${data.max_devices} PC(s).`);
  console.log(`La clave se vincula a tu computadora en la primera activación.`);
  console.log("");
  console.log("--- Fin del mensaje ---");
  console.log("");
} else if (cmd === "list") {
  const data = await api("/admin/list", "GET");
  for (const row of data.licenses ?? []) {
    console.log(
      `${row.license_key}  ${row.plan}  ${row.max_devices}pc  ${row.revoked ? "REVOCADA" : "OK"}  ${row.buyer_note ?? ""}`,
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
  console.log(`Comandos: create | list | revoke
Variables: LICENSE_API_URL, LICENSE_ADMIN_SECRET`);
}
