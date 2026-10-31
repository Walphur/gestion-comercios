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
    // En E2E la app no abre el diálogo nativo de guardar: exporta a la carpeta temporal.
    await page.getByRole("button", { name: /CSV contador/i }).click();
    await expect(page.getByText(/Exportadas \d+ ventas/).first()).toBeVisible({ timeout: 20_000 });
  });
});
