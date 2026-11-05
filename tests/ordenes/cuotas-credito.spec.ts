import { test, expect } from "../support/fixtures";
import {
  APP_ORIGIN,
  loginAsAdmin,
  navigateSidebar,
  openCashSession,
  tauriInvoke,
  unlockAdminConfig,
  waitForE2eBridge,
} from "../support/helpers";

const DB = "sqlite:gestion.db";

async function sql(page: Parameters<typeof tauriInvoke>[0], query: string, values: unknown[] = []) {
  await tauriInvoke(page, "plugin:sql|load", { db: DB });
  return tauriInvoke<[number, number]>(page, "plugin:sql|execute", { db: DB, query, values });
}

test.describe("Crédito en cuotas", () => {
  test("orden de taller cobrada con crédito en 3 cuotas suma el recargo y lo muestra en la venta", async ({
    tauriPage: page,
  }) => {
    await sql(
      page,
      `INSERT OR REPLACE INTO settings (key, value) VALUES
         ('rubro', 'taller'), ('pro_plan_enabled', '1')`,
    );
    const [, orderId] = await sql(
      page,
      `INSERT INTO service_orders (order_number, title, status, subtotal, discount_pct, total)
       VALUES ('OS-PW-CUOTAS', 'Cambio de aceite PW', 'ready', 1000, 0, 1000)`,
    );
    await sql(
      page,
      `INSERT INTO service_order_items (order_id, name, qty, unit_price, discount_pct, line_total, is_labor)
       VALUES ($1, 'Mano de obra PW', 1, 1000, 0, 1000, 1)`,
      [orderId],
    );
    await page.goto(`${APP_ORIGIN}/?qa=${Date.now()}#/login`, { waitUntil: "load" });
    await waitForE2eBridge(page, 60_000);
    await loginAsAdmin(page);

    await navigateSidebar(page, "Configuración");
    await unlockAdminConfig(page);
    await page.getByRole("button", { name: /Recargos, PIN y cierre/i }).click();
    await page.getByLabel(/Crédito 3 cuotas/i).fill("10");
    await page.getByRole("button", { name: "Guardar recargos" }).click();
    await expect(page.getByText(/Recargos por medio de pago guardados/i).first()).toBeVisible();

    await openCashSession(page);
    await page.evaluate((id) => {
      window.location.hash = `#/ordenes/${id}`;
    }, orderId);
    await page.getByRole("button", { name: /Entregar y cobrar/i }).click();
    const modal = page.getByRole("dialog", { name: "Entregar y cobrar" });
    await modal.getByTestId("charge-payment").selectOption("crédito");
    await modal.getByRole("button", { name: /3 cuotas/ }).click();
    await expect(modal.getByTestId("charge-total")).toHaveText(/1\.100,00/);
    await expect(modal.getByTestId("charge-installments-detail")).toHaveText(/3 cuotas de \$\s*366,67/);
    await modal.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText(/Entregado\. Venta #\d+ registrada/).first()).toBeVisible({ timeout: 20_000 });

    await navigateSidebar(page, "Ventas");
    const row = page.getByRole("row", { name: /Crédito · 3 cuotas/ }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/1\.100,00/);
    await row.getByRole("button", { name: "Ver detalle" }).click();
    await expect(page.getByTestId("sale-detail-payment")).toHaveText(/Pago: Crédito · 3 cuotas/);
  });
});
