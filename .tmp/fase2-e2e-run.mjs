/**
 * Fase 2 E2E runner: SQLite metrics + push matching app logic + dashboard GET.
 * Productive DB only. No secrets printed.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash, createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DB_PATH = join(
  homedir(),
  "AppData/Roaming/com.gestioncomercios.app/gestion.db",
);
const API = "https://gestion-comercios-license.walphur.workers.dev";
const SECRET_FILE = join(ROOT, "workers/license-api/.admin-secret.txt");
const LICENSE_ID_SNAPSHOT = "71c2e359-8d62-42e3-a866-07c6703a5482";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function setting(db, key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value?.trim?.() || row?.value || null;
}

function b64url(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getMachineId() {
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { encoding: "utf8" },
    );
    for (const line of out.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      const idx = parts.findIndex((p) => p.toUpperCase() === "REG_SZ");
      if (idx >= 0 && parts[idx + 1]) {
        return createHash("sha256").update(parts[idx + 1]).digest("hex");
      }
    }
  } catch {
    /* fallback */
  }
  return createHash("sha256")
    .update(`fallback:${process.env.COMPUTERNAME || "pc"}`)
    .digest("hex");
}

/** Match getPeriodComparison(days): sinceModifier(days) = `-${days} days` */
function periodCompare(db, days) {
  const current = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
       WHERE voided=0 AND date(created_at) >= date('now','localtime', ?)`,
    )
    .get(`-${days} days`);
  const previous = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
       WHERE voided=0
         AND date(created_at) >= date('now','localtime', ?)
         AND date(created_at) < date('now','localtime', ?)`,
    )
    .get(`-${days * 2} days`, `-${days} days`);
  return {
    current_total: num(current.t),
    current_count: num(current.c),
    previous_total: num(previous.t),
    previous_count: num(previous.c),
  };
}

/** Match getPortalSalesLastNDays: fill calendar days including zeros */
function seriesFilled(db, n) {
  const raw = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
       FROM sales
       WHERE voided=0 AND date(created_at) >= date('now','localtime', ?)
       GROUP BY 1`,
    )
    .all(`-${n - 1} days`);
  const byDay = new Map(
    raw.map((r) => [String(r.day), { count: num(r.count), total: num(r.total) }]),
  );
  const out = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    const hit = byDay.get(key);
    out.push({ day: key, count: hit?.count ?? 0, total: hit?.total ?? 0 });
  }
  return out;
}

function seriesMonthToDate(db) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const dayCount =
    Math.floor(
      (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
        Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
        86400000,
    ) + 1;
  const raw = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
       FROM sales
       WHERE voided=0 AND date(created_at) >= date('now','localtime','start of month')
       GROUP BY 1`,
    )
    .all();
  const byDay = new Map(
    raw.map((r) => [String(r.day), { count: num(r.count), total: num(r.total) }]),
  );
  const out = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    const hit = byDay.get(key);
    out.push({ day: key, count: hit?.count ?? 0, total: hit?.total ?? 0 });
  }
  return out;
}

function sqliteMetrics(db) {
  const today = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
       WHERE voided=0 AND date(created_at)=date('now','localtime')`,
    )
    .get();
  const stock = db
    .prepare(
      `SELECT COUNT(*) AS products_total,
              SUM(CASE WHEN p.stock < 0 THEN 1 ELSE 0 END) AS critical_count,
              SUM(CASE WHEN p.min_stock > 0 AND p.stock <= p.min_stock AND p.stock >= 0 THEN 1 ELSE 0 END) AS low_count
       FROM products p WHERE p.active=1`,
    )
    .get();
  const alerts = db
    .prepare(
      `SELECT COUNT(*) AS c FROM products p
       WHERE p.active=1 AND ((p.min_stock > 0 AND p.stock <= p.min_stock) OR p.stock < 0)`,
    )
    .get();
  const s7 = seriesFilled(db, 7);
  const s30 = seriesFilled(db, 30);
  const mtd = seriesMonthToDate(db);
  const sum = (arr) => arr.reduce((a, d) => a + d.total, 0);
  const cnt = (arr) => arr.reduce((a, d) => a + d.count, 0);
  return {
    sales_today_total: num(today.t),
    sales_today_count: num(today.c),
    ticket_avg: num(today.c) > 0 ? num(today.t) / num(today.c) : 0,
    sales_7d_total: sum(s7),
    sales_7d_count: cnt(s7),
    sales_30d_total: sum(s30),
    sales_30d_count: cnt(s30),
    sales_mtd_total: sum(mtd),
    sales_mtd_count: cnt(mtd),
    period_compare_7d: periodCompare(db, 7),
    period_compare_30d: periodCompare(db, 30),
    products_total: num(stock.products_total),
    critical_count: num(stock.critical_count),
    low_count: num(stock.low_count),
    low_stock_count: num(alerts.c),
    series7_len: s7.length,
    series30_len: s30.length,
    series_mtd_len: mtd.length,
  };
}

function buildSnapshot(db) {
  const m = sqliteMetrics(db);
  const device_name =
    setting(db, "lan_sync_device_name") ||
    setting(db, "lan_sync_device_code") ||
    "PC";
  const yesterday = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
       WHERE voided=0 AND date(created_at)=date('now','localtime','-1 day')`,
    )
    .get();
  const recent = db
    .prepare(
      `SELECT s.created_at AS at, s.total, s.payment_method,
              NULLIF(TRIM(u.display_name),'') AS seller,
              COALESCE(NULLIF(TRIM(s.device_name),''), NULLIF(TRIM(s.device_code),''), 'PC') AS device
       FROM sales s LEFT JOIN users u ON u.id=s.user_id
       WHERE s.voided=0 ORDER BY s.created_at DESC LIMIT 20`,
    )
    .all()
    .map((r) => ({
      at: r.at,
      total: num(r.total),
      device: String(r.device || "PC"),
      payment_method: r.payment_method || undefined,
      seller: r.seller || undefined,
    }));
  const byRegister = db
    .prepare(
      `SELECT COALESCE(device_code,'') AS device_code,
              NULLIF(TRIM(device_name),'') AS device_name,
              COUNT(*) AS count, COALESCE(SUM(total),0) AS total
       FROM sales WHERE voided=0 AND date(created_at)=date('now','localtime')
         AND device_code IS NOT NULL AND TRIM(device_code)!=''
       GROUP BY 1,2 ORDER BY total DESC`,
    )
    .all()
    .map((r) => ({
      device_code: String(r.device_code || ""),
      device_name: r.device_name || null,
      count: num(r.count),
      total: num(r.total),
    }));
  const byEmployee = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(u.display_name),''),'Sin vendedor') AS name,
              COUNT(*) AS count, COALESCE(SUM(s.total),0) AS total
       FROM sales s LEFT JOIN users u ON u.id=s.user_id
       WHERE s.voided=0 AND date(s.created_at)=date('now','localtime')
       GROUP BY 1 ORDER BY total DESC`,
    )
    .all()
    .map((r) => ({ name: String(r.name), count: num(r.count), total: num(r.total) }));
  const lowStock = db
    .prepare(
      `SELECT name, stock, min_stock FROM products p
       WHERE p.active=1 AND ((p.min_stock > 0 AND p.stock <= p.min_stock) OR p.stock < 0)
       ORDER BY CASE WHEN p.stock < 0 THEN 0 ELSE 1 END, (p.stock - p.min_stock) ASC, p.name ASC
       LIMIT 30`,
    )
    .all()
    .map((p) => ({
      name: String(p.name),
      stock: num(p.stock),
      min_stock: num(p.min_stock),
      estimated_days_cover: null,
    }));
  let topToday = [];
  try {
    topToday = db
      .prepare(
        `SELECT si.name AS name, COALESCE(SUM(si.qty),0) AS qty
         FROM sale_items si JOIN sales s ON s.id=si.sale_id
         WHERE s.voided=0 AND date(s.created_at)=date('now','localtime')
         GROUP BY si.name ORDER BY qty DESC LIMIT 8`,
      )
      .all()
      .map((r) => ({ name: String(r.name), qty: num(r.qty) }));
  } catch {
    topToday = [];
  }

  return {
    business_name: setting(db, "business_name") || "Mi comercio",
    sales_today_total: m.sales_today_total,
    sales_today_count: m.sales_today_count,
    sales_yesterday_total: num(yesterday.t),
    sales_yesterday_count: num(yesterday.c),
    products_total: m.products_total,
    low_stock_count: m.low_stock_count,
    stock_summary: {
      products_total: m.products_total,
      critical_count: m.critical_count,
      low_count: m.low_count,
    },
    recent_sales: recent,
    sales_by_register: byRegister,
    sales_by_employee: byEmployee,
    sales_last_7_days: seriesFilled(db, 7),
    sales_last_30_days: seriesFilled(db, 30),
    sales_month_to_date: seriesMonthToDate(db),
    period_compare_7d: m.period_compare_7d,
    period_compare_30d: m.period_compare_30d,
    top_products_today: topToday,
    low_stock: lowStock,
    pushed_at: new Date().toISOString(),
    device_name: String(device_name).slice(0, 80),
  };
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

function loadSecret() {
  if (process.env.LICENSE_ADMIN_SECRET?.trim())
    return process.env.LICENSE_ADMIN_SECRET.trim();
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, "utf8").trim();
  return null;
}

async function getDashboard(account) {
  const portalSrc = readFileSync(
    join(ROOT, "workers/license-api/src/portal.ts"),
    "utf8",
  );
  const prefix = /TOKEN_PREFIX\s*=\s*"([^"]+)"/.exec(portalSrc)?.[1] || "WP1";
  const secret = loadSecret();
  if (!secret) throw new Error("NO_SECRET");
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    aid: account.id,
    lid: account.license_id || LICENSE_ID_SNAPSHOT,
    email: account.email,
    name: account.name,
    iat: now,
    exp: now + 3600,
  };
  const body = b64url(JSON.stringify(payload));
  const signed = `${prefix}.${body}`;
  const sig = createHmac("sha256", secret).update(signed).digest();
  const token = `${signed}.${b64url(sig)}`;
  const res = await fetch(`${API}/v1/portal/dashboard`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return { status: res.status, data, tokenLen: token.length };
}

async function main() {
  const st = statSync(DB_PATH);
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const sqlite = sqliteMetrics(db);
  const snapshot = buildSnapshot(db);

  const token = setting(db, "license_token");
  const licenseKey =
    setting(db, "license_key") || setting(db, "account_license_key");
  const accountEmail = setting(db, "account_email");
  const machineId = getMachineId();

  const body = {
    machine_id: machineId,
    device_name: snapshot.device_name,
    account_email: accountEmail || undefined,
    snapshot,
  };
  if (token?.startsWith?.("GC1.")) body.token = token;
  if (licenseKey) body.license_key = String(licenseKey).toUpperCase();

  const payloadBytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
  const pushRes = await fetch(`${API}/v1/portal/push`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const pushText = await pushRes.text();

  const emailSql = String(accountEmail || "")
    .trim()
    .toLowerCase()
    .replace(/'/g, "''");
  let accounts = d1Json(
    `SELECT id, name, email, license_id, business_name FROM accounts WHERE lower(email)='${emailSql}' AND verified=1 LIMIT 1`,
  );
  if (!accounts.length) {
    accounts = d1Json(
      `SELECT a.id, a.name, a.email, a.license_id, a.business_name
       FROM accounts a
       INNER JOIN account_devices ad ON ad.account_id=a.id
       INNER JOIN activations act ON act.machine_id=ad.machine_id
       WHERE act.license_id='${LICENSE_ID_SNAPSHOT}' AND a.verified=1 LIMIT 1`,
    );
  }
  const dash = await getDashboard(accounts[0]);

  const api = dash.data;
  const cmp = (label, a, b) => ({
    label,
    sqlite: a,
    api: b,
    match: a === b || (Number(a) === Number(b) && Number.isFinite(Number(a))),
  });

  const diffs = [
    cmp("sales_today_total", sqlite.sales_today_total, api.sales_today_total),
    cmp("sales_today_count", sqlite.sales_today_count, api.sales_today_count),
    cmp("products_total", sqlite.products_total, api.products_total),
    cmp(
      "critical_count",
      sqlite.critical_count,
      api.stock_summary?.critical_count,
    ),
    cmp("low_count", sqlite.low_count, api.stock_summary?.low_count),
    cmp("low_stock_count", sqlite.low_stock_count, api.low_stock_count),
    cmp(
      "cmp30_current_total",
      sqlite.period_compare_30d.current_total,
      api.period_compare_30d?.current_total,
    ),
    cmp(
      "cmp30_current_count",
      sqlite.period_compare_30d.current_count,
      api.period_compare_30d?.current_count,
    ),
    cmp(
      "series30_len",
      sqlite.series30_len,
      api.sales_last_30_days?.length,
    ),
    cmp("series7_len", sqlite.series7_len, api.sales_last_7_days?.length),
    cmp(
      "series_mtd_len",
      sqlite.series_mtd_len,
      api.sales_month_to_date?.length,
    ),
    cmp(
      "sales_30d_total_sum",
      sqlite.sales_30d_total,
      (api.sales_last_30_days || []).reduce((s, d) => s + Number(d.total || 0), 0),
    ),
    cmp(
      "sales_7d_total_sum",
      sqlite.sales_7d_total,
      (api.sales_last_7_days || []).reduce((s, d) => s + Number(d.total || 0), 0),
    ),
  ];

  const report = {
    bd: {
      path: DB_PATH,
      bytes: st.size,
      mb: +(st.size / 1e6).toFixed(2),
    },
    push: {
      status: pushRes.status,
      ok: pushRes.ok,
      body: pushText.slice(0, 300),
      payload_bytes: payloadBytes,
      under_160kb: payloadBytes < 160000,
      device_name: snapshot.device_name,
      pushed_at: snapshot.pushed_at,
      machine_id_prefix: machineId.slice(0, 8),
      license_id_prefix: LICENSE_ID_SNAPSHOT.slice(0, 8),
    },
    sqlite,
    dashboard: {
      status: dash.status,
      ok: api.ok,
      empty: api.empty,
      business_name: api.business_name,
      updated_at: api.updated_at,
      pushed_at: api.pushed_at,
      fields: {
        sales_last_30_days: Array.isArray(api.sales_last_30_days),
        sales_month_to_date: Array.isArray(api.sales_month_to_date),
        period_compare_7d: api.period_compare_7d != null,
        period_compare_30d: api.period_compare_30d != null,
        stock_summary: api.stock_summary != null,
        products_total: api.products_total != null,
      },
      sales_today_total: api.sales_today_total,
      stock_summary: api.stock_summary,
      sales_last_7_days_len: api.sales_last_7_days?.length,
      sales_last_30_days_len: api.sales_last_30_days?.length,
      sales_month_to_date_len: api.sales_month_to_date?.length,
      period_compare_7d: api.period_compare_7d,
      period_compare_30d: api.period_compare_30d,
      age_ms: api.pushed_at
        ? Date.now() - new Date(api.pushed_at).getTime()
        : null,
    },
    diffs,
    all_match: diffs.every((d) => d.match),
    multi_tenant: {
      account_lid_prefix: String(accounts[0]?.license_id || "").slice(0, 8),
      snapshot_lid_prefix: LICENSE_ID_SNAPSHOT.slice(0, 8),
      same_lid: accounts[0]?.license_id === LICENSE_ID_SNAPSHOT,
      resolved_business: api.business_name,
    },
  };

  writeFileSync(
    join(__dirname, "fase2-e2e-report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
