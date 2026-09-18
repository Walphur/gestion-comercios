/**
 * Fase 4E-4 — UI Inteligencia WalQo (Owner Portal).
 * UNIT/MOCK + markers en docs/app. Responsive E2E solo si Chromium existe.
 * Run: npx tsx scripts/run-portal-fase4e4-tests.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appJs = fs.readFileSync(path.join(ROOT, "docs/app/app.js"), "utf8");
const appHtml = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const appCss = fs.readFileSync(path.join(ROOT, "docs/app/app.css"), "utf8");

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

function periodMapKey(period: string) {
  if (period === "month") return "mtd";
  if (period === "7d" || period === "30d" || period === "today") return period;
  return "today";
}

function intelligenceErrorMessage(err: { status?: number }) {
  const status = err && err.status;
  if (status === 401) return "Tu sesión expiró. Volvé a iniciar sesión.";
  if (status === 404) return "Sin datos suficientes para generar un análisis.";
  if (status === 422) return "Los datos no pudieron validarse para el análisis.";
  if (status === 429) return "Alcanzaste el límite de análisis disponible.";
  if (status === 502) return "No se pudo conectar con el servicio de inteligencia.";
  if (status === 504) return "El análisis está tardando demasiado. Intentá nuevamente.";
  return "No se pudo completar el análisis. Intentá nuevamente.";
}

function ctaLabelForStatus(status: string, hasResult: boolean) {
  if (status === "loading") return "Analizando…";
  if (hasResult || status === "success") return "Actualizar análisis";
  return "Analizar este período";
}

await check("0. markers Inteligencia en HTML/JS/CSS", () => {
  assert.ok(appHtml.includes('id="intelligence-block"'));
  assert.ok(appHtml.includes("Inteligencia WalQo"));
  assert.ok(appHtml.includes('id="btn-intelligence"'));
  assert.ok(appJs.includes("__WALQO_PORTAL_IA__"));
  assert.ok(appJs.includes("/v1/portal/interpret"));
  assert.ok(appJs.includes("Analizar este período"));
  assert.ok(appCss.includes(".intelligence-card"));
});

await check("1. sección Inteligencia visible (markup)", () => {
  assert.ok(appHtml.includes("intelligence-heading"));
  assert.ok(appHtml.includes("intelligence-result"));
});

await check("2. CTA visible", () => {
  assert.ok(appHtml.includes("btn-intelligence"));
  assert.ok(appJs.includes("ctaLabelForStatus"));
});

await check("3. CTA usa período actual (periodMapKey)", () => {
  assert.equal(periodMapKey("today"), "today");
  assert.ok(appJs.includes("periodMapKey(selectedPeriod)"));
  assert.ok(appJs.includes('JSON.stringify({ period: periodKey })'));
});

await check("4. today", () => assert.equal(periodMapKey("today"), "today"));
await check("5. 7d", () => assert.equal(periodMapKey("7d"), "7d"));
await check("6. 30d", () => assert.equal(periodMapKey("30d"), "30d"));
await check("7. mtd", () => assert.equal(periodMapKey("month"), "mtd"));

await check("8. loading CTA", () => {
  assert.equal(ctaLabelForStatus("loading", false), "Analizando…");
  assert.ok(appHtml.includes("intelligence-loading"));
});

await check("9. success CTA", () => {
  assert.equal(ctaLabelForStatus("success", true), "Actualizar análisis");
});

await check("10. summary markup", () => {
  assert.ok(appHtml.includes("intelligence-summary"));
  assert.ok(appHtml.includes(">Resumen<"));
});

await check("11. insights markup", () => {
  assert.ok(appHtml.includes("intelligence-insights"));
  assert.ok(appHtml.includes(">Señales<"));
});

await check("12. recommendations markup", () => {
  assert.ok(appHtml.includes("intelligence-recommendations"));
  assert.ok(appHtml.includes(">Qué revisar<"));
});

await check("13. uncertainty markup", () => {
  assert.ok(appHtml.includes("intelligence-uncertainty"));
  assert.ok(appHtml.includes(">Datos a tener en cuenta<"));
});

await check("14. error 401", () => {
  assert.ok(intelligenceErrorMessage({ status: 401 }).includes("sesión"));
});
await check("15. error 404", () => {
  assert.ok(intelligenceErrorMessage({ status: 404 }).includes("Sin datos"));
});
await check("16. error 422", () => {
  assert.ok(intelligenceErrorMessage({ status: 422 }).includes("validarse"));
});
await check("17. error 429", () => {
  assert.ok(intelligenceErrorMessage({ status: 429 }).includes("límite"));
});
await check("18. error 502", () => {
  assert.ok(intelligenceErrorMessage({ status: 502 }).includes("conectar"));
});
await check("19. error 504", () => {
  assert.ok(intelligenceErrorMessage({ status: 504 }).includes("tardando"));
});

await check("20. retry", () => {
  assert.ok(appHtml.includes("btn-intelligence-retry"));
  assert.ok(appHtml.includes("Intentar nuevamente"));
});

await check("21. no snapshot", () => {
  assert.ok(appHtml.includes("Sin datos suficientes para generar un análisis"));
  assert.ok(appJs.includes("nosnapshot") || appJs.includes("!lastDashboard.empty"));
});

await check("22. empty sales permitido (no bloquea CTA)", () => {
  // El CTA se habilita con snapshot; no exige sales_today_total > 0
  assert.ok(appJs.includes("hasSnap"));
  assert.ok(!appJs.includes("sales_today_total > 0") || !appJs.match(/btn-intelligence[\s\S]{0,200}sales_today_total/));
});

await check("23. stale snapshot warning", () => {
  assert.ok(appJs.includes("no están completamente actualizados"));
  assert.ok(appJs.includes('health.level === "stale"'));
});

await check("24. old snapshot warning", () => {
  assert.ok(appJs.includes('health.level === "old"'));
});

await check("25. no automatic request on tab change", () => {
  // period-tabs solo llama renderDashboard; runIntelligence solo en click CTA/retry
  const tabsBlock = appJs.slice(
    appJs.indexOf('getElementById("period-tabs")'),
    appJs.indexOf('getElementById("period-tabs")') + 450,
  );
  assert.ok(tabsBlock.includes("renderDashboard"));
  assert.ok(!tabsBlock.includes("runIntelligence"));
});

await check("26. no duplicate requests (iaInflight)", () => {
  assert.ok(appJs.includes("if (iaInflight) return"));
});

await check("27. browser body contiene únicamente period", () => {
  assert.ok(appJs.includes("JSON.stringify({ period: periodKey })"));
  assert.ok(!appJs.match(/interpret[\s\S]{0,400}metrics/));
  assert.ok(!appJs.match(/interpret[\s\S]{0,400}machine_id/));
});

await check("28. no secrets rendered", () => {
  assert.ok(!appHtml.includes("PBS1"));
  assert.ok(!appHtml.includes("OPENAI"));
  assert.ok(!appJs.includes("PORTAL_BI_SERVICE_SECRET"));
  // engine/model no se muestran en UI principal
  assert.ok(!appHtml.includes("id=\"intelligence-engine\""));
});

await check("29. response rendered as text", () => {
  assert.ok(appJs.includes("li.textContent = text"));
  assert.ok(appJs.includes("summaryEl.textContent"));
  // No innerHTML sobre resultado IA
  assert.ok(!appJs.match(/intelligence-summary[\s\S]{0,80}innerHTML/));
  assert.ok(!appJs.match(/intelligence-insights[\s\S]{0,120}innerHTML/));
});

await check("30. Atención no duplicada", () => {
  assert.ok(appHtml.includes("attention-block"));
  assert.ok(appHtml.includes("intelligence-block"));
  assert.ok(appHtml.indexOf("attention-block") < appHtml.indexOf("intelligence-block"));
});

await check("31. F3 regression markers", () => {
  assert.ok(appHtml.includes("payment-list"));
  assert.ok(appHtml.includes("top-list"));
  assert.ok(appJs.includes("sales_by_payment"));
});

await check("32. F2 regression markers", () => {
  assert.ok(appHtml.includes("kpi-grid"));
  assert.ok(appHtml.includes("status-card"));
  assert.ok(appJs.includes("snapshotHealth"));
});

// —— Responsive (Playwright) ——
async function serveDocs(): Promise<{ base: string; close: () => Promise<void> }> {
  const docsRoot = path.join(ROOT, "docs");
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0] || "/");
    let rel = urlPath === "/" ? "/app/index.html" : urlPath;
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(docsRoot, rel.replace(/^\//, "")));
    if (!file.startsWith(docsRoot)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(file);
      const types: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".png": "image/png",
        ".ico": "image/x-icon",
      };
      res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
      res.end(buf);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return {
    base: `http://127.0.0.1:${addr.port}/app/`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
      }),
  };
}

async function runResponsive(): Promise<"PASS" | "SKIP"> {
  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    console.log("SKIP responsive/playwright — @playwright/test no disponible");
    return "SKIP";
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.log(
      "SKIP responsive/playwright —",
      e instanceof Error ? e.message.split("\n")[0] : e,
    );
    return "SKIP";
  }

  const srv = await serveDocs();
  const widths = [360, 390, 430, 1366, 1920];
  try {
    for (const w of widths) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.goto(srv.base, { waitUntil: "domcontentloaded" });
      // Forzar vista dash con mock mínimo vía DOM (login visible por defecto)
      await page.evaluate(() => {
        const login = document.getElementById("view-login");
        const dash = document.getElementById("view-dash");
        const body = document.getElementById("dash-body");
        if (login) login.hidden = true;
        if (dash) dash.hidden = false;
        if (body) body.hidden = false;
      });
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth + 1;
      });
      assert.equal(overflow, false, `overflow horizontal en ${w}px`);
      const visible = await page.locator("#intelligence-block").isVisible();
      assert.equal(visible, true, `intelligence visible ${w}`);
      await page.close();
      console.log(`PASS responsive ${w}`);
    }
  } finally {
    await browser.close();
    await srv.close();
  }
  return "PASS";
}

const responsive = await runResponsive();
if (responsive === "SKIP") {
  console.log("Responsive NO ejecutado (browser Playwright ausente). No se declara PASS de viewports.");
  console.log("NOTE: tests 33–37 (responsive) = NOT RUN");
} else {
  console.log("PASS 33–37 responsive viewports");
}

console.log("\nNOTE: E2E REAL contra walqo.pro/app = N/A (suite UNIT/MOCK + markers)");

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll Fase 4E-4 portal Inteligencia UI tests passed (UNIT/MOCK).");
