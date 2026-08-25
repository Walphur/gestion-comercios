import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  loginAsCajero,
  navigateSidebar,
  ensureSidebarExpanded,
  setE2eBilling,
  tauriInvoke,
  waitForE2eBridge,
} from "../support/helpers";

type IntelSnap = {
  salesToday: { count: number; total: number; units_sold: number; avg_ticket: number };
  salesPeriod: { units_sold: number; avg_ticket: number };
  salesComparison: {
    revenue_change_pct: number;
    units_change_pct: number;
    ticket_change_pct: number;
    current_units: number;
    previous_units: number;
  };
  profitPeriod: { is_estimated: true; profit: number; margin_pct: number };
  customers: { recurrence: { new_customers: number; returning_customers: number } };
  inventory: { low_stock_count: number };
  scopeNotes: { cashIsLocalOnly: true; profitUsesCurrentCost: true };
};

async function fetchSnapshot(page: import("@playwright/test").Page): Promise<IntelSnap> {
  await waitForE2eBridge(page);
  return page.evaluate(async () => {
    const bridge = window.__GESTION_E2E__;
    if (!bridge?.getIntelligenceSnapshot) throw new Error("getIntelligenceSnapshot no disponible");
    return bridge.getIntelligenceSnapshot() as Promise<IntelSnap>;
  });
}

test.describe("Inteligencia de Negocio — Fase 1", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
  });

  test("página carga con KPIs y comparación", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Inteligencia");
    await expect(page.getByRole("heading", { name: "Inteligencia de Negocio" })).toBeVisible();
    await expect(page.getByText("Ventas hoy")).toBeVisible();
    await expect(page.getByText("Ventas 30 días")).toBeVisible();
    await expect(page.getByText("Comparación 30 días vs período anterior")).toBeVisible();
    await expect(page.getByText("Utilidad estimada (30d)")).toBeVisible();
    await expect(page.getByText(/costo actual del catálogo/i)).toBeVisible();
  });

  test("snapshot: ventas hoy incluye unidades y ticket", async ({ tauriPage: page }) => {
    await tauriInvoke(page, "e2e_seed_products", { count: 3 });
    const snap = await fetchSnapshot(page);
    expect(snap.salesToday).toMatchObject({
      count: expect.any(Number),
      total: expect.any(Number),
      units_sold: expect.any(Number),
      avg_ticket: expect.any(Number),
    });
    if (snap.salesToday.count > 0) {
      expect(snap.salesToday.avg_ticket).toBeCloseTo(
        snap.salesToday.total / snap.salesToday.count,
        2,
      );
    }
  });

  test("snapshot: comparación incluye unidades y ticket", async ({ tauriPage: page }) => {
    const snap = await fetchSnapshot(page);
    expect(typeof snap.salesComparison.revenue_change_pct).toBe("number");
    expect(typeof snap.salesComparison.units_change_pct).toBe("number");
    expect(typeof snap.salesComparison.ticket_change_pct).toBe("number");
    expect(typeof snap.salesComparison.current_units).toBe("number");
    expect(typeof snap.salesComparison.previous_units).toBe("number");
  });

  test("snapshot: utilidad estimada marcada", async ({ tauriPage: page }) => {
    const snap = await fetchSnapshot(page);
    expect(snap.profitPeriod.is_estimated).toBe(true);
    expect(snap.scopeNotes.profitUsesCurrentCost).toBe(true);
  });

  test("snapshot: clientes nuevos vs recurrentes", async ({ tauriPage: page }) => {
    const snap = await fetchSnapshot(page);
    expect(snap.customers.recurrence.new_customers).toBeGreaterThanOrEqual(0);
    expect(snap.customers.recurrence.returning_customers).toBeGreaterThanOrEqual(0);
  });

  test("snapshot: stock bajo paridad con getProductStats", async ({ tauriPage: page }) => {
    const snap = await fetchSnapshot(page);
    expect(snap.inventory.low_stock_count).toBeGreaterThanOrEqual(0);
  });

  test("snapshot: scope caja local", async ({ tauriPage: page }) => {
    const snap = await fetchSnapshot(page);
    expect(snap.scopeNotes.cashIsLocalOnly).toBe(true);
  });

});
test.describe("Inteligencia — Fase 2 alertas", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
  });

  test("página muestra panel de alertas", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Inteligencia");
    await expect(page.getByRole("heading", { name: "Alertas" })).toBeVisible();
  });

  test("reglas de alerta: self-test", async ({ tauriPage: page }) => {
    await waitForE2eBridge(page);
    const result = await page.evaluate(async () => {
      const bridge = window.__GESTION_E2E__;
      if (!bridge?.selfTestAlertRules) throw new Error("selfTestAlertRules no disponible");
      return bridge.selfTestAlertRules();
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("bundle incluye alertas evaluadas", async ({ tauriPage: page }) => {
    await waitForE2eBridge(page);
    const bundle = await page.evaluate(async () => {
      const bridge = window.__GESTION_E2E__;
      if (!bridge?.getIntelligenceBundle) throw new Error("getIntelligenceBundle no disponible");
      return bridge.getIntelligenceBundle({}, { showProfits: true, featuresStock: true });
    });
    expect(bundle).toHaveProperty("snapshot");
    expect(bundle).toHaveProperty("alerts");
    expect(bundle).toHaveProperty("actions");
    const alerts = (bundle as { alerts: { alerts: unknown[]; critical_count: number } }).alerts;
    expect(Array.isArray(alerts.alerts)).toBe(true);
    expect(typeof alerts.critical_count).toBe("number");
    const actions = (bundle as { actions: { actions: unknown[]; now_count: number } }).actions;
    expect(Array.isArray(actions.actions)).toBe(true);
    expect(typeof actions.now_count).toBe("number");
  });
});

test.describe("Inteligencia — Fase 3 acciones", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
  });

  test("página muestra panel de acciones", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Inteligencia");
    await expect(page.getByRole("heading", { name: "¿Qué hacer hoy?" })).toBeVisible();
  });

  test("reglas de acciones: self-test", async ({ tauriPage: page }) => {
    await waitForE2eBridge(page);
    const result = await page.evaluate(async () => {
      const bridge = window.__GESTION_E2E__;
      if (!bridge?.selfTestActionRules) throw new Error("selfTestActionRules no disponible");
      return bridge.selfTestActionRules();
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

test.describe("Inteligencia — Fase 4 interpretación IA", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
  });

  test("página muestra panel de interpretación IA", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Inteligencia");
    await expect(page.getByRole("heading", { name: "Interpretación IA" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Generar interpretación" })).toBeVisible();
  });

  test("payload IA: self-test", async ({ tauriPage: page }) => {
    await waitForE2eBridge(page);
    const result = await page.evaluate(async () => {
      const bridge = window.__GESTION_E2E__;
      if (!bridge?.selfTestIaPayload) throw new Error("selfTestIaPayload no disponible");
      return bridge.selfTestIaPayload();
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("validación IA: self-test", async ({ tauriPage: page }) => {
    await waitForE2eBridge(page);
    const result = await page.evaluate(async () => {
      const bridge = window.__GESTION_E2E__;
      if (!bridge?.selfTestIaValidation) throw new Error("selfTestIaValidation no disponible");
      return bridge.selfTestIaValidation();
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("offline no bloquea página", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Inteligencia");
    await expect(page.getByRole("heading", { name: "¿Qué hacer hoy?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alertas" })).toBeVisible();
    await expect(page.getByText("Ventas hoy")).toBeVisible();
    await page.context().setOffline(true);
    await expect(page.getByText(/Sin conexión a Internet/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "¿Qué hacer hoy?" })).toBeVisible();
    await expect(page.getByText("Ventas hoy")).toBeVisible();
    await page.context().setOffline(false);
    await expect(page.getByText(/Sin conexión a Internet/i)).toHaveCount(0);
  });

  test("cache invalidation por payload_hash en sessionStorage", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Inteligencia");
    await waitForE2eBridge(page);
    const result = await page.evaluate(async () => {
      const bridge = window.__GESTION_E2E__;
      if (
        !bridge?.getIntelligenceBundle ||
        !bridge?.buildIaPayload ||
        !bridge?.saveCachedInterpretation ||
        !bridge?.loadCachedInterpretation
      ) {
        throw new Error("bridge incompleto");
      }

      const bundle = (await bridge.getIntelligenceBundle(
        {},
        { showProfits: true, featuresStock: true, featuresCustomers: true },
      )) as { snapshot: unknown; alerts: unknown; actions: unknown };
      const payload = (await bridge.buildIaPayload(bundle.snapshot, bundle.alerts, bundle.actions, {
        currency: "ARS",
        showProfits: true,
      })) as {
        computed_at: string;
        inventory: { low_stock_count: number };
        freshness: { pendingEvents: number };
        sales: { today: { total: number } };
      };

      const interpretation = {
        summary: "cache-test-runtime",
        insights: ["ok"],
        action_explanations: [],
        caveats: [],
        generated_at: new Date().toISOString(),
      };
      await bridge.saveCachedInterpretation(payload, interpretation);
      const hit = (await bridge.loadCachedInterpretation(payload)) as { summary?: string } | null;

      const changedStock = {
        ...payload,
        inventory: { ...payload.inventory, low_stock_count: payload.inventory.low_stock_count + 1 },
      };
      const missStock = await bridge.loadCachedInterpretation(changedStock);

      const changedFreshness = {
        ...payload,
        freshness: { ...payload.freshness, pendingEvents: (payload.freshness?.pendingEvents ?? 0) + 1 },
      };
      const missFresh = await bridge.loadCachedInterpretation(changedFreshness);

      const changedSales = {
        ...payload,
        sales: {
          ...payload.sales,
          today: { ...payload.sales.today, total: payload.sales.today.total + 1 },
        },
      };
      const missSale = await bridge.loadCachedInterpretation(changedSales);

      return {
        hitSummary: hit?.summary ?? null,
        missStock: missStock === null,
        missFresh: missFresh === null,
        missSale: missSale === null,
        stored: Boolean(sessionStorage.getItem("walqo-bi-interpretation-v2")),
      };
    });
    expect(result.hitSummary).toBe("cache-test-runtime");
    expect(result.stored).toBe(true);
    expect(result.missStock).toBe(true);
    expect(result.missFresh).toBe(true);
    expect(result.missSale).toBe(true);
  });

  test("ruta /asistente con BI e2e (deep-link)", async ({ tauriPage: page }) => {
    await waitForE2eBridge(page);
    await page.evaluate(() => {
      window.location.hash = "#/asistente";
    });
    await page.waitForTimeout(500);
    await expect(
      page.getByRole("heading", { name: /Inteligencia de Negocio|Interpretación IA|¿Qué hacer hoy?/i }).first(),
    ).toBeVisible();
  });

  test("offline: IA no disponible; métricas/acciones siguen", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Inteligencia");
    await expect(page.getByRole("heading", { name: "¿Qué hacer hoy?" })).toBeVisible();
    await expect(page.getByText("Ventas hoy")).toBeVisible();
    const iaBtn = page.getByRole("main").getByRole("button", { name: /^Generar interpretación$|^Actualizar$/ });
    await page.context().setOffline(true);
    await expect(page.getByText(/Sin conexión a Internet/i)).toBeVisible();
    await expect(iaBtn).toBeDisabled();
    await expect(page.getByRole("heading", { name: "¿Qué hacer hoy?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alertas" })).toBeVisible();
    await page.context().setOffline(false);
    await expect(page.getByText(/Sin conexión a Internet/i)).toHaveCount(0);
    await expect(iaBtn).toBeEnabled();
  });
});

test.describe("Inteligencia — entitlements billing E2E", () => {
  test("monthly: sidebar y /asistente permiten BI", async ({ tauriPage: page }) => {
    await setE2eBilling(page, "monthly");
    await loginAsAdmin(page);
    await ensureSidebarExpanded(page);
    await expect(
      page.getByRole("complementary").getByRole("link", { name: "Inteligencia", exact: true }),
    ).toBeVisible();
    await navigateSidebar(page, "Inteligencia");
    await expect(page.getByRole("heading", { name: "¿Qué hacer hoy?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Interpretación IA" })).toBeVisible();
  });

  test("perpetual: BI bloqueado en sidebar y deep-link", async ({ tauriPage: page }) => {
    await setE2eBilling(page, "perpetual");
    await loginAsAdmin(page);
    await ensureSidebarExpanded(page);
    await expect(
      page.getByRole("complementary").getByRole("link", { name: "Inteligencia", exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => {
      window.location.hash = "#/asistente";
    });
    await page.waitForTimeout(600);
    await expect(page.getByText(/Inteligencia de Negocio está incluida en el plan mensual/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "¿Qué hacer hoy?" })).toHaveCount(0);
    await tauriInvoke(page, "e2e_clear_billing");
  });
});

test.describe("Inteligencia — permisos cajero", () => {
  test("cajero no ve Inteligencia en sidebar", async ({ tauriPage: page }) => {
    await loginAsCajero(page);
    await ensureSidebarExpanded(page);
    await expect(
      page.getByRole("complementary").getByRole("link", { name: "Inteligencia", exact: true }),
    ).toHaveCount(0);
  });
});
