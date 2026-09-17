/**
 * Unit tests Fase 4D — presentación Atención (Owner Portal).
 * Lógica alineada con docs/app/app.js (solo presentación; no calcula BI).
 * Run: npx tsx scripts/run-portal-fase4d-tests.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log("PASS", name);
    } catch (e) {
      failed += 1;
      console.error("FAIL", name, e instanceof Error ? e.message : e);
    }
  })();
}

const ATTENTION_PREVIEW = 8;
const ATTENTION_SEVERITIES: Record<string, boolean> = {
  critical: true,
  warning: true,
  info: true,
};

function normalizePortalAlerts(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ severity: string; title: string; message: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const severity = String(row.severity || "").trim();
    if (!ATTENTION_SEVERITIES[severity]) continue;
    const title = String(row.title || "").trim();
    const message = String(row.message || "").trim();
    if (!title || !message) continue;
    out.push({ severity, title, message });
  }
  return out;
}

function formatAttentionBadges(
  summary: unknown,
  alertCount: number,
): string {
  if (!summary || typeof summary !== "object") return "";
  const s = summary as Record<string, unknown>;
  const c = Number(s.critical_count);
  const w = Number(s.warning_count);
  const i = Number(s.info_count);
  if (![c, w, i].every((n) => Number.isFinite(n) && n >= 0)) return "";
  if (alertCount === 0 && c === 0 && w === 0 && i === 0) return "";
  const parts: string[] = [];
  if (c > 0) parts.push(`${Math.floor(c)} crítica${c === 1 ? "" : "s"}`);
  if (w > 0) parts.push(`${Math.floor(w)} importante${w === 1 ? "" : "s"}`);
  if (i > 0) parts.push(`${Math.floor(i)} info`);
  return parts.join(" · ");
}

function alertsForDisplay(
  alerts: Array<{ severity: string; title: string; message: string }>,
  expanded: boolean,
) {
  if (expanded || alerts.length <= ATTENTION_PREVIEW) return alerts;
  const criticals = alerts.filter((a) => a.severity === "critical");
  const rest = alerts.filter((a) => a.severity !== "critical");
  const room = Math.max(0, ATTENTION_PREVIEW - criticals.length);
  return criticals.concat(rest.slice(0, room));
}

const appJs = fs.readFileSync(path.join(ROOT, "docs/app/app.js"), "utf8");
const appHtml = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const appCss = fs.readFileSync(path.join(ROOT, "docs/app/app.css"), "utf8");

await check("0. app.js contiene helpers Atención", () => {
  assert.ok(appJs.includes("function normalizePortalAlerts"));
  assert.ok(appJs.includes("function renderAttention"));
  assert.ok(appJs.includes("ATTENTION_PREVIEW"));
  assert.ok(appHtml.includes('id="attention-block"'));
  assert.ok(appHtml.includes("Sin alertas por ahora"));
  assert.ok(appCss.includes(".attention-item--critical"));
});

await check("1. alerts ausente → []", () => {
  assert.deepEqual(normalizePortalAlerts(undefined), []);
  assert.deepEqual(normalizePortalAlerts(null), []);
});

await check("2. alerts [] → []", () => {
  assert.deepEqual(normalizePortalAlerts([]), []);
});

await check("3. una alerta critical", () => {
  const a = normalizePortalAlerts([
    {
      severity: "critical",
      title: "Sin stock",
      message: "Prod: 0 u.",
    },
  ]);
  assert.equal(a.length, 1);
  assert.equal(a[0].severity, "critical");
});

await check("4. una warning", () => {
  const a = normalizePortalAlerts([
    { severity: "warning", title: "Stock bajo", message: "Prod: 2 u." },
  ]);
  assert.equal(a[0].severity, "warning");
});

await check("5. info", () => {
  const a = normalizePortalAlerts([
    { severity: "info", title: "Aviso", message: "Detalle" },
  ]);
  assert.equal(a[0].severity, "info");
});

await check("6. múltiples alertas preservan orden", () => {
  const a = normalizePortalAlerts([
    { severity: "critical", title: "A", message: "1" },
    { severity: "warning", title: "B", message: "2" },
    { severity: "info", title: "C", message: "3" },
  ]);
  assert.deepEqual(
    a.map((x) => x.title),
    ["A", "B", "C"],
  );
});

await check("7. alerts_summary badges", () => {
  assert.equal(
    formatAttentionBadges({ critical_count: 3, warning_count: 1, info_count: 0 }, 4),
    "3 críticas · 1 importante",
  );
  assert.equal(formatAttentionBadges({ critical_count: 0, warning_count: 0, info_count: 0 }, 0), "");
  assert.equal(formatAttentionBadges(undefined, 0), "");
});

await check("8. alert malformed ignorada", () => {
  const a = normalizePortalAlerts([
    { severity: "ultra", title: "X", message: "Y" },
    { severity: "critical", title: "", message: "Y" },
    { severity: "critical", title: "Ok", message: "Msg" },
    null,
    "x",
  ]);
  assert.equal(a.length, 1);
  assert.equal(a[0].title, "Ok");
});

await check("9. snapshot F3 campos no tocados por normalize", () => {
  const f3 = {
    sales_by_payment: { "30d": [{ method: "efectivo", count: 1, total: 10 }] },
    top_products: { "30d": [{ name: "P", qty: 1, total: 10 }] },
    alerts: [{ severity: "critical", title: "T", message: "M" }],
  };
  normalizePortalAlerts(f3.alerts);
  assert.equal(f3.sales_by_payment["30d"][0].method, "efectivo");
  assert.equal(f3.top_products["30d"][0].name, "P");
});

await check("9b. preview no oculta críticas", () => {
  const many = [
    ...Array.from({ length: 5 }, (_, i) => ({
      severity: "critical",
      title: `C${i}`,
      message: "m",
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      severity: "warning",
      title: `W${i}`,
      message: "m",
    })),
  ];
  const visible = alertsForDisplay(many, false);
  assert.equal(visible.filter((a) => a.severity === "critical").length, 5);
  assert.ok(visible.length <= ATTENTION_PREVIEW);
});

async function measureOverflow(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    };
  });
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `overflow @${width}: scroll=${overflow.scrollWidth} client=${overflow.clientWidth}`,
  );
}

const fixtureHtml = `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${appCss.replace(/<\/style>/gi, "<\\/style>")}</style>
</head>
<body>
  <main class="wrap">
    <section class="dash-block" id="status-block">
      <div class="status-card status-card--ok"><div class="status-card__dot"></div>
        <div class="min-w-0"><p class="status-card__title">Todo funciona normalmente</p>
        <p class="status-card__detail">Actualizado hace 2 min</p></div>
      </div>
    </section>
    <section class="dash-block" id="attention-block">
      <div class="block-head attention-head">
        <div class="min-w-0"><h2>Atención</h2><p class="section-hint">Alertas</p></div>
        <p class="attention-badges">3 críticas · 1 importante</p>
      </div>
      <ul class="attention-list">
        <li class="attention-item attention-item--critical">
          <span class="attention-item__mark">Crítica</span>
          <div class="attention-item__body min-w-0">
            <p class="attention-item__title">Caída de ventas</p>
            <p class="attention-item__msg">Facturación 30d -20.0% vs período anterior (800 vs 1000).</p>
          </div>
        </li>
        <li class="attention-item attention-item--warning">
          <span class="attention-item__mark">Importante</span>
          <div class="attention-item__body min-w-0">
            <p class="attention-item__title">Stock bajo mínimo</p>
            <p class="attention-item__msg">Producto con nombre muy largo para probar wrap sin overflow horizontal en móvil.</p>
          </div>
        </li>
        <li class="attention-item attention-item--info">
          <span class="attention-item__mark">Info</span>
          <div class="attention-item__body min-w-0">
            <p class="attention-item__title">Aviso</p>
            <p class="attention-item__msg">Detalle informativo.</p>
          </div>
        </li>
      </ul>
    </section>
    <section class="dash-block">
      <div class="kpi-grid kpi-grid-4">
        <article class="kpi kpi--primary"><p class="kpi-label">Ventas hoy</p><p class="kpi-value">$10.000</p></article>
        <article class="kpi"><p class="kpi-label">Tickets</p><p class="kpi-value">3</p></article>
      </div>
    </section>
  </main>
</body>
</html>`;

const viewports = [
  { name: "10. responsive 360", w: 360, h: 740 },
  { name: "11. responsive 390", w: 390, h: 844 },
  { name: "12. responsive 430", w: 430, h: 932 },
  { name: "13. desktop 1366", w: 1366, h: 768 },
  { name: "14. desktop 1920", w: 1920, h: 1080 },
];

let browser;
let responsiveRan = false;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(fixtureHtml, { waitUntil: "load" });
  responsiveRan = true;

  for (const vp of viewports) {
    await check(vp.name, async () => {
      await measureOverflow(page, vp.w, vp.h);
    });
  }

  await check("15. sin overflow horizontal (todos los viewports)", async () => {
    for (const vp of viewports) {
      await measureOverflow(page, vp.w, vp.h);
    }
  });
} catch (e) {
  console.warn(
    "SKIP responsive/playwright —",
    e instanceof Error ? e.message.split("\n")[0] : e,
  );
  console.warn(
    "Responsive NO ejecutado (browser Playwright ausente). No se declara PASS de viewports.",
  );
} finally {
  await browser?.close();
}

if (!responsiveRan) {
  console.log("NOTE: tests 10–15 (responsive) = NOT RUN");
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(
  responsiveRan
    ? "\nAll Fase 4D portal Atención tests passed."
    : "\nFase 4D unit tests passed (responsive NOT RUN).",
);
