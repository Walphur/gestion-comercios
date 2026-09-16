/**
 * Fase 2 validation: build snapshot from real DB + push to Worker.
 * Does not print license secrets.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const DB_PATH = join(
  homedir(),
  "AppData",
  "Roaming",
  "com.gestioncomercios.app",
  "gestion.db",
);

const API = "https://gestion-comercios-license.walphur.workers.dev";

function setting(db, key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value?.trim?.() || row?.value || null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
        const raw = parts[idx + 1];
        return createHash("sha256").update(raw).digest("hex");
      }
    }
  } catch {
    /* fallback below */
  }
  const host = process.env.COMPUTERNAME || "pc";
  return createHash("sha256").update(`fallback:${host}`).digest("hex");
}

function buildSnapshot(db) {
  const business_name = setting(db, "business_name") || "Mi comercio";
  const device_name =
    setting(db, "lan_sync_device_name") ||
    setting(db, "lan_sync_device_code") ||
    "PC";

  const today = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c
       FROM sales WHERE voided = 0 AND date(created_at) = date('now','localtime')`,
    )
    .get();
  const yesterday = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c
       FROM sales WHERE voided = 0 AND date(created_at) = date('now','localtime','-1 day')`,
    )
    .get();

  const recent = db
    .prepare(
      `SELECT s.created_at AS at, s.total, s.payment_method,
              NULLIF(TRIM(u.display_name),'') AS seller,
              COALESCE(NULLIF(TRIM(s.device_name),''), NULLIF(TRIM(s.device_code),''), 'PC') AS device
       FROM sales s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.voided = 0
       ORDER BY s.created_at DESC LIMIT 20`,
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
       FROM sales
       WHERE voided = 0 AND date(created_at)=date('now','localtime')
         AND device_code IS NOT NULL AND TRIM(device_code) != ''
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
       FROM sales s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.voided = 0 AND date(s.created_at)=date('now','localtime')
       GROUP BY 1 ORDER BY total DESC`,
    )
    .all()
    .map((r) => ({
      name: String(r.name),
      count: num(r.count),
      total: num(r.total),
    }));

  const seriesN = (n) =>
    db
      .prepare(
        `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
         FROM sales
         WHERE voided = 0 AND date(created_at) >= date('now','localtime', ?)
         GROUP BY 1 ORDER BY 1`,
      )
      .all(`-${n - 1} days`)
      .map((r) => ({
        day: String(r.day),
        count: num(r.count),
        total: num(r.total),
      }));

  const monthToDate = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
       FROM sales
       WHERE voided = 0 AND date(created_at) >= date('now','localtime','start of month')
       GROUP BY 1 ORDER BY 1`,
    )
    .all()
    .map((r) => ({
      day: String(r.day),
      count: num(r.count),
      total: num(r.total),
    }));

  function periodCompare(days) {
    const current = db
      .prepare(
        `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
         WHERE voided = 0
           AND date(created_at) >= date('now','localtime', ?)
           AND date(created_at) <= date('now','localtime')`,
      )
      .get(`-${days - 1} days`);
    const previous = db
      .prepare(
        `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales
         WHERE voided = 0
           AND date(created_at) >= date('now','localtime', ?)
           AND date(created_at) < date('now','localtime', ?)`,
      )
      .get(`-${days * 2 - 1} days`, `-${days - 1} days`);
    return {
      current_total: num(current.t),
      current_count: num(current.c),
      previous_total: num(previous.t),
      previous_count: num(previous.c),
    };
  }

  // Match getPortalStockSummary + PORTAL_STOCK_ALERT_WHERE_SQL exactly
  const stockSummary = db
    .prepare(
      `SELECT
         COUNT(*) AS products_total,
         SUM(CASE WHEN p.stock < 0 THEN 1 ELSE 0 END) AS critical_count,
         SUM(CASE WHEN p.min_stock > 0 AND p.stock <= p.min_stock AND p.stock >= 0 THEN 1 ELSE 0 END) AS low_count
       FROM products p
       WHERE p.active = 1`,
    )
    .get();

  const alertCount = db
    .prepare(
      `SELECT COUNT(*) AS c FROM products p
       WHERE p.active = 1 AND ((p.min_stock > 0 AND p.stock <= p.min_stock) OR p.stock < 0)`,
    )
    .get();

  const lowStock = db
    .prepare(
      `SELECT name, stock, min_stock FROM products p
       WHERE p.active = 1 AND ((p.min_stock > 0 AND p.stock <= p.min_stock) OR p.stock < 0)
       ORDER BY
         CASE WHEN p.stock < 0 THEN 0 ELSE 1 END,
         (p.stock - p.min_stock) ASC,
         p.name ASC
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
        `SELECT p.name AS name, COALESCE(SUM(si.qty),0) AS qty
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         WHERE s.voided = 0 AND date(s.created_at)=date('now','localtime')
         GROUP BY p.id ORDER BY qty DESC LIMIT 8`,
      )
      .all()
      .map((r) => ({ name: String(r.name), qty: num(r.qty) }));
  } catch {
    topToday = [];
  }

  return {
    business_name,
    sales_today_total: num(today.t),
    sales_today_count: num(today.c),
    sales_yesterday_total: num(yesterday.t),
    sales_yesterday_count: num(yesterday.c),
    products_total: num(stockSummary.products_total),
    low_stock_count: num(alertCount.c),
    stock_summary: {
      products_total: num(stockSummary.products_total),
      critical_count: num(stockSummary.critical_count),
      low_count: num(stockSummary.low_count),
    },
    recent_sales: recent,
    sales_by_register: byRegister,
    sales_by_employee: byEmployee,
    sales_last_7_days: seriesN(7),
    sales_last_30_days: seriesN(30),
    sales_month_to_date: monthToDate,
    period_compare_7d: periodCompare(7),
    period_compare_30d: periodCompare(30),
    top_products_today: topToday,
    low_stock: lowStock,
    pushed_at: new Date().toISOString(),
    device_name: String(device_name).slice(0, 80),
  };
}

async function main() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const portalEnabled = setting(db, "owner_portal_enabled");
  const token = setting(db, "license_token");
  const licenseKey =
    setting(db, "license_key") || setting(db, "account_license_key");
  const accountEmail = setting(db, "account_email");
  const machineId = getMachineId();

  console.log(
    JSON.stringify(
      {
        db: DB_PATH,
        portal_enabled: portalEnabled,
        has_token: Boolean(token && String(token).startsWith("GC1.")),
        has_license_key: Boolean(licenseKey && String(licenseKey).length >= 8),
        has_email: Boolean(accountEmail),
        machine_id_prefix: machineId.slice(0, 8),
        business: setting(db, "business_name"),
      },
      null,
      2,
    ),
  );

  const snapshot = buildSnapshot(db);
  console.log(
    JSON.stringify(
      {
        desktop_metrics: {
          sales_today_total: snapshot.sales_today_total,
          sales_today_count: snapshot.sales_today_count,
          products_total: snapshot.products_total,
          stock_summary: snapshot.stock_summary,
          low_stock_count: snapshot.low_stock_count,
          sales_last_7_days_len: snapshot.sales_last_7_days.length,
          sales_last_30_days_len: snapshot.sales_last_30_days.length,
          sales_month_to_date_len: snapshot.sales_month_to_date.length,
          period_compare_7d: snapshot.period_compare_7d,
          period_compare_30d: snapshot.period_compare_30d,
          week_total: snapshot.sales_last_7_days.reduce((a, d) => a + d.total, 0),
          week_count: snapshot.sales_last_7_days.reduce((a, d) => a + d.count, 0),
        },
      },
      null,
      2,
    ),
  );

  if (!token && !licenseKey) {
    console.error("FAIL_PUSH: no license credentials in local DB");
    process.exit(2);
  }

  const body = {
    machine_id: machineId,
    device_name: snapshot.device_name,
    account_email: accountEmail || undefined,
    snapshot,
  };
  if (token && String(token).startsWith("GC1.")) body.token = token;
  if (licenseKey) body.license_key = String(licenseKey).toUpperCase();

  const res = await fetch(`${API}/v1/portal/push`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(
    JSON.stringify(
      {
        push_status: res.status,
        push_ok: res.ok,
        push_body: text.slice(0, 500),
      },
      null,
      2,
    ),
  );
  if (!res.ok) process.exit(4);
  console.log("PUSH_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
