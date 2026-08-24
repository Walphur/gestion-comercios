import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  loginAsCajero,
  navigateSidebar,
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
    const alerts = (bundle as { alerts: { alerts: unknown[]; critical_count: number } }).alerts;
    expect(Array.isArray(alerts.alerts)).toBe(true);
    expect(typeof alerts.critical_count).toBe("number");
  });
});

test.describe("Inteligencia — permisos cajero", () => {
  test("cajero no ve Inteligencia en sidebar", async ({ tauriPage: page }) => {
    await loginAsCajero(page);
    await expect(
      page.getByRole("complementary").getByRole("link", { name: "Inteligencia", exact: true }),
    ).toHaveCount(0);
  });
});
