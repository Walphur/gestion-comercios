/**
 * Mint portal session + GET /v1/portal/dashboard for Fase 2 validation.
 * Never prints secrets, passwords, or full tokens/emails.
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
const API = "https://gestion-comercios-license.walphur.workers.dev";
const LICENSE_ID = "71c2e359-8d62-42e3-a866-07c6703a5482";

function b64url(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function loadSecret() {
  if (process.env.LICENSE_ADMIN_SECRET?.trim())
    return process.env.LICENSE_ADMIN_SECRET.trim();
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, "utf8").trim();
  return null;
}

function d1Json(sql) {
  const out = execSync(
    `npx wrangler d1 execute gestion-licenses --remote --json --command ${JSON.stringify(sql)}`,
    {
      cwd: join(ROOT, "workers/license-api"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const parsed = JSON.parse(out);
  const results =
    parsed?.[0]?.results ??
    parsed?.results ??
    (Array.isArray(parsed) ? parsed[0]?.results : null);
  return results || [];
}

function localAccountEmail() {
  const db = new DatabaseSync(
    join(homedir(), "AppData/Roaming/com.gestioncomercios.app/gestion.db"),
    { readOnly: true },
  );
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'account_email'")
    .get();
  return String(row?.value || "")
    .trim()
    .toLowerCase();
}

async function main() {
  const portalSrc = readFileSync(
    join(ROOT, "workers/license-api/src/portal.ts"),
    "utf8",
  );
  const m = /TOKEN_PREFIX\s*=\s*"([^"]+)"/.exec(portalSrc);
  const prefix = m?.[1] || "WP1";

  const secret = loadSecret();
  if (!secret) {
    console.error("NO_SECRET");
    process.exit(2);
  }

  const email = localAccountEmail();
  if (!email || !email.includes("@")) {
    console.error("NO_LOCAL_EMAIL");
    process.exit(3);
  }

  const emailSql = email.replace(/'/g, "''");
  let rows = d1Json(
    `SELECT id, name, email, license_id, business_name FROM accounts WHERE lower(email) = '${emailSql}' AND verified = 1 LIMIT 1`,
  );
  if (!rows.length) {
    rows = d1Json(
      `SELECT a.id, a.name, a.email, a.license_id, a.business_name
       FROM accounts a
       INNER JOIN account_devices ad ON ad.account_id = a.id
       INNER JOIN activations act ON act.machine_id = ad.machine_id
       WHERE act.license_id = '${LICENSE_ID}' AND a.verified = 1
       LIMIT 1`,
    );
  }
  if (!rows.length) {
    console.error("NO_ACCOUNT");
    process.exit(3);
  }

  const account = rows[0];
  // If account license differs from snapshot license, still mint with account.license_id
  // (findSnapshotForAccount falls back via account_devices).
  const lid = account.license_id || LICENSE_ID;

  console.log(
    JSON.stringify(
      {
        account_id_prefix: String(account.id).slice(0, 8),
        email_domain: String(account.email).split("@")[1] || null,
        business_name: account.business_name || account.name,
        lid_prefix: String(lid).slice(0, 8),
        same_as_snapshot_license: lid === LICENSE_ID,
      },
      null,
      2,
    ),
  );

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    aid: account.id,
    lid,
    email: account.email,
    name: account.name,
    iat: now,
    exp: now + 60 * 60,
  };
  const body = b64url(JSON.stringify(payload));
  const signed = `${prefix}.${body}`;
  const sig = createHmac("sha256", secret).update(signed).digest();
  const token = `${signed}.${b64url(sig)}`;

  const res = await fetch(`${API}/v1/portal/dashboard`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const keys = [
    "sales_last_30_days",
    "sales_month_to_date",
    "period_compare_7d",
    "period_compare_30d",
    "stock_summary",
    "products_total",
  ];
  const present = Object.fromEntries(
    keys.map((k) => [k, data[k] !== undefined && data[k] !== null]),
  );

  const low = Array.isArray(data.low_stock) ? data.low_stock : [];
  const withCover = low.filter(
    (x) => x && x.estimated_days_cover != null,
  ).length;

  console.log(
    JSON.stringify(
      {
        status: res.status,
        ok: data.ok,
        empty: data.empty,
        business_name: data.business_name,
        sales_today_total: data.sales_today_total,
        sales_today_count: data.sales_today_count,
        products_total: data.products_total,
        stock_summary: data.stock_summary,
        low_stock_count: data.low_stock_count,
        sales_last_7_days_len: data.sales_last_7_days?.length,
        sales_last_30_days_len: data.sales_last_30_days?.length,
        sales_month_to_date_len: data.sales_month_to_date?.length,
        period_compare_7d: data.period_compare_7d,
        period_compare_30d: data.period_compare_30d,
        low_stock_len: low.length,
        estimated_days_cover_present_count: withCover,
        fields_present: present,
        updated_at: data.updated_at,
        error: data.error || data.message || null,
      },
      null,
      2,
    ),
  );

  writeFileSync(join(__dirname, "portal-session.token"), token, "utf8");
  console.log("TOKEN_FILE_WRITTEN");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
