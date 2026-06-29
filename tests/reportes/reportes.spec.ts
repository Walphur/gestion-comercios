import { test, expect } from "../support/fixtures";
import { loginAsAdmin, navigateSidebar } from "../support/helpers";

test.describe("Reportes", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await navigateSidebar(page, "Reportes");
  });

  test("ver resumen de ventas", async ({ tauriPage: page }) => {
    await expect(page.getByText(/Total vendido|Ventas/i).first()).toBeVisible();
  });

  test("pestaña por día", async ({ tauriPage: page }) => {
    await page.getByRole("button", { name: /Por día/i }).click();
    await expect(page.locator("table")).toBeVisible();
  });

  test("exportar CSV (diálogo)", async ({ tauriPage: page }) => {
    await page.getByRole("button", { name: /CSV/i }).first().click();
    await page.waitForTimeout(1000);
  });
});
