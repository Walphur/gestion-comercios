import { test, expect } from "../support/fixtures";
import { loginAsAdmin, navigateSidebar, unlockAdminConfig } from "../support/helpers";

test.describe("Configuración", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await navigateSidebar(page, "Configuración");
    await unlockAdminConfig(page);
  });

  test("cambiar tema", async ({ tauriPage: page }) => {
    await page.getByText("Apariencia", { exact: true }).click();
    await page.getByRole("button", { name: "Oscuro" }).click();
    await page.getByRole("button", { name: "Claro" }).click();
  });

  test("cambiar rubro", async ({ tauriPage: page }) => {
    await page.getByText("Negocio", { exact: true }).click();
    await expect(page.getByText(/Tipo de negocio/i)).toBeVisible();
    const rubroSelect = page.locator("select").first();
    if (await rubroSelect.isVisible()) {
      const options = await rubroSelect.locator("option").allTextContents();
      if (options.length > 1) {
        await rubroSelect.selectOption({ index: 1 });
      }
    }
    await page.getByRole("button", { name: /Volver/i }).click();
  });

  test("backup manual", async ({ tauriPage: page }) => {
    await page.getByText("Copias de seguridad", { exact: true }).click();
    await expect(page.getByRole("button", { name: /Guardar copia ahora/i })).toBeVisible();
    await page.getByRole("button", { name: /Guardar copia ahora/i }).click();
    await page.waitForTimeout(1500);
  });

  test("restaurar (UI visible)", async ({ tauriPage: page }) => {
    await page.getByText("Copias de seguridad", { exact: true }).click();
    await expect(page.getByRole("button", { name: /Restaurar copia anterior/i })).toBeVisible();
  });
});
