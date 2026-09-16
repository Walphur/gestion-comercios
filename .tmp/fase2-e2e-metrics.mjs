/**
 * Fase 2 E2E: read-only metrics from productive gestion.db
 * Does not print secrets.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { statSync } from "node:fs";

export const DB_PATH = join(
  homedir(),
  "AppData/Roaming/com.gestioncomercios.app/gestion.db",
);

const API = "https://gestion-comercios-license.walphur.workers.dev";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function setting(db, key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value?.trim?.() || row?.value || null;
}

export function openDb() {
  const st = statSync(DB_PATH);
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const v = db.prepare("SELECT sqlite_version() AS v").get().v;
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sales','products','settings','sale_items','users') ORDER BY 1",
    )
    .all()
    .map((r) => r.name);
  return { db, meta: { path: DB_PATH, bytes: st.size, mb: +(st.size / 1e6).toFixed(2), mtime: st.mtime.toISOString(), sqlite: v, tables } };
}

export function computeSqliteMetrics(db) {
  const today = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
       WHERE voided=0 AND date(created_at)=date('now','localtime')`,
    )
    .get();
  const avg =
    num(today.c) > 0 ? num(today.t) / num(today.c) : 0;

  const d7 = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
       WHERE voided=0 AND date(created_at)>=date('now','localtime','-6 days')`,
    )
    .get();
  const d30 = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
       WHERE voided=0 AND date(created_at)>=date('now','localtime','-29 days')`,
    )
    .get();
  const mtd = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
       WHERE voided=0 AND date(created_at)>=date('now','localtime','start of month')`,
    )
    .get();

  function periodCompare(days) {
    const current = db
      .prepare(
        `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
         WHERE voided=0
           AND date(created_at)>=date('now','localtime', ?)
           AND date(created_at)<=date('now','localtime')`,
      )
      .get(`-${days - 1} days`);
    const previous = db
      .prepare(
        `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
         WHERE voided=0
           AND date(created_at)>=date('now','localtime', ?)
           AND date(created_at)<date('now','localtime', ?)`,
      )
      .get(`-${days * 2 - 1} days`, `-${days - 1} days`);
    return {
      current_total: num(current.t),
      current_count: num(current.c),
      previous_total: num(previous.t),
      previous_count: num(previous.c),
    };
  }

  const stock = db
    .prepare(
      `SELECT
         COUNT(*) AS products_total,
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

  const series30 = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
       FROM sales WHERE voided=0 AND date(created_at)>=date('now','localtime','-29 days')
       GROUP BY 1 ORDER BY 1`,
    )
    .all();
  const series7 = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
       FROM sales WHERE voided=0 AND date(created_at)>=date('now','localtime','-6 days')
       GROUP BY 1 ORDER BY 1`,
    )
    .all();
  const seriesMtd = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
       FROM sales WHERE voided=0 AND date(created_at)>=date('now','localtime','start of month')
       GROUP BY 1 ORDER BY 1`,
    )
    .all();

  return {
    business_name: setting(db, "business_name") || "Mi comercio",
    portal_enabled: setting(db, "owner_portal_enabled"),
    last_push_at: setting(db, "owner_portal_last_push_at"),
    last_error: setting(db, "owner_portal_last_error"),
    has_token: Boolean(setting(db, "license_token")?.startsWith?.("GC1.")),
    has_license_key: Boolean((setting(db, "license_key") || setting(db, "account_license_key") || "").length >= 8),
    sales_today_total: num(today.t),
    sales_today_count: num(today.c),
    ticket_avg: avg,
    sales_7d_total: num(d7.t),
    sales_7d_count: num(d7.c),
    sales_30d_total: num(d30.t),
    sales_30d_count: num(d30.c),
    sales_mtd_total: num(mtd.t),
    sales_mtd_count: num(mtd.c),
    period_compare_7d: periodCompare(7),
    period_compare_30d: periodCompare(30),
    products_total: num(stock.products_total),
    critical_count: num(stock.critical_count),
    low_count: num(stock.low_count),
    low_stock_count: num(alerts.c),
    series7_len: series7.length,
    series30_len: series30.length,
    series_mtd_len: seriesMtd.length,
  };
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
    /* ignore */
  }
  return createHash("sha256")
    .update(`fallback:${process.env.COMPUTERNAME || "pc"}`)
    .digest("hex");
}

/** Build snapshot matching ownerPortalPush + dashboard.ts stock rules */
export function buildSnapshot(db) {
  const m = computeSqliteMetrics(db);
  const device_name =
    setting(db, "lan_sync_device_name") ||
    setting(db, "lan_sync_device_code") ||
    "PC";

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

  const seriesN = (n) =>
    db
      .prepare(
        `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
         FROM sales WHERE voided=0 AND date(created_at)>=date('now','localtime', ?)
         GROUP BY 1 ORDER BY 1`,
      )
      .all(`-${n - 1} days`)
      .map((r) => ({ day: String(r.day), count: num(r.count), total: num(r.total) }));

  const monthToDate = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
       FROM sales WHERE voided=0 AND date(created_at)>=date('now','localtime','start of month')
       GROUP BY 1 ORDER BY 1`,
    )
    .all()
    .map((r) => ({ day: String(r.day), count: num(r.count), total: num(r.total) }));

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
      // Only include when BI coverage exists; harness leaves null (same as "no cover")
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

  const yesterday = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
       WHERE voided=0 AND date(created_at)=date('now','localtime','-1 day')`,
    )
    .get();

  return {
    business_name: m.business_name,
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
    sales_last_7_days: seriesN(7),
    sales_last_30_days: seriesN(30),
    sales_month_to_date: monthToDate,
    period_compare_7d: m.period_compare_7d,
    period_compare_30d: m.period_compare_30d,
    top_products_today: topToday,
    low_stock: lowStock,
    pushed_at: new Date().toISOString(),
    device_name: String(device_name).slice(0, 80),
  };
}

export async function pushReal(db) {
  const token = setting(db, "license_token");
  const licenseKey =
    setting(db, "license_key") || setting(db, "account_license_key");
  const accountEmail = setting(db, "account_email");
  const machineId = getMachineId();
  const snapshot = buildSnapshot(db);
  const body = {
    machine_id: machineId,
    device_name: snapshot.device_name,
    account_email: accountEmail || undefined,
    snapshot,
  };
  if (token?.startsWith?.("GC1.")) body.token = token;
  if (licenseKey) body.license_key = String(licenseKey).toUpperCase();

  const payloadBytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
  const res = await fetch(`${API}/v1/portal/push`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    ok: res.ok,
    body: text.slice(0, 500),
    payload_bytes: payloadBytes,
    device_name: snapshot.device_name,
    pushed_at: snapshot.pushed_at,
    machine_id_prefix: machineId.slice(0, 8),
    snapshot_summary: {
      sales_today_total: snapshot.sales_today_total,
      sales_today_count: snapshot.sales_today_count,
      products_total: snapshot.products_total,
      stock_summary: snapshot.stock_summary,
      series7: snapshot.sales_last_7_days.length,
      series30: snapshot.sales_last_30_days.length,
      series_mtd: snapshot.sales_month_to_date.length,
      cmp7: snapshot.period_compare_7d,
      cmp30: snapshot.period_compare_30d,
      low_stock_len: snapshot.low_stock.length,
    },
  };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("fase2-e2e-metrics.mjs")) {
  const { db, meta } = openDb();
  console.log(JSON.stringify({ meta, metrics: computeSqliteMetrics(db) }, null, 2));
}
