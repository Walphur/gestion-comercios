/**
 * Print only token length; write token to .tmp for CDP inject (not printed).
 */
import { createHmac } from "node:crypto";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SECRET_FILE = join(ROOT, "workers/license-api/.admin-secret.txt");
const LICENSE_ID = "71c2e359-8d62-42e3-a866-07c6703a5482";

function b64url(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function d1Json(sql) {
  const out = execSync(
    `npx wrangler d1 execute gestion-licenses --remote --json --command ${JSON.stringify(sql)}`,
    { cwd: join(ROOT, "workers/license-api"), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(out);
  const results = parsed?.[0]?.results ?? parsed?.results ?? (Array.isArray(parsed) ? parsed[0]?.results : null);
  return results || [];
}

const secret = existsSync(SECRET_FILE) ? readFileSync(SECRET_FILE, "utf8").trim() : null;
const db = new DatabaseSync(join(homedir(), "AppData/Roaming/com.gestioncomercios.app/gestion.db"), { readOnly: true });
const email = String(db.prepare("SELECT value FROM settings WHERE key='account_email'").get()?.value || "").trim().toLowerCase();
let rows = d1Json(`SELECT id, name, email, license_id FROM accounts WHERE lower(email)='${email.replace(/'/g, "''")}' AND verified=1 LIMIT 1`);
if (!rows.length) {
  rows = d1Json(`SELECT a.id, a.name, a.email, a.license_id FROM accounts a INNER JOIN account_devices ad ON ad.account_id=a.id INNER JOIN activations act ON act.machine_id=ad.machine_id WHERE act.license_id='${LICENSE_ID}' AND a.verified=1 LIMIT 1`);
}
const account = rows[0];
const prefix = /TOKEN_PREFIX\s*=\s*"([^"]+)"/.exec(readFileSync(join(ROOT, "workers/license-api/src/portal.ts"), "utf8"))?.[1] || "WP1";
const now = Math.floor(Date.now() / 1000);
const payload = { v: 1, aid: account.id, lid: account.license_id || LICENSE_ID, email: account.email, name: account.name, iat: now, exp: now + 3600 };
const body = b64url(JSON.stringify(payload));
const signed = `${prefix}.${body}`;
const token = `${signed}.${b64url(createHmac("sha256", secret).update(signed).digest())}`;
writeFileSync(join(__dirname, "portal-session.token"), token, "utf8");
console.log(JSON.stringify({ token_len: token.length, business_hint: "Los tanos" }));
