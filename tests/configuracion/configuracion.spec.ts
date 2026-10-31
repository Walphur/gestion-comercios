import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  navigateSidebar,
  unlockAdminConfig,
  clickInMain,
  pageHeader,
} from "../support/helpers";

test.describe("Configuración", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await navigateSidebar(page, "Configuración");
    await unlockAdminConfig(page);
  });

  test("cambiar tema", async ({ tauriPage: page }) => {
    await clickInMain(page, "button", /^Apariencia/);
    await clickInMain(page, "button", "Oscuro");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await clickInMain(page, "button", "Claro");
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  });

  test("cambiar rubro", async ({ tauriPage: page }) => {
    await clickInMain(page, "button", /^Datos del comercio/);
    await expect(page.getByRole("heading", { name: "Tipo de negocio" })).toBeVisible();
    const kiosco = page.getByRole("main").getByRole("button", { name: /^(Activo )?Kiosco \/ Almacén/ });
    await kiosco.click();
    await expect(pageHeader(page).getByText("Rubro actualizado")).toBeVisible();
    await expect(kiosco).toContainText("Activo");
    await clickInMain(page, "button", /Volver/);
    await expect(page.getByRole("heading", { name: "Mi comercio" })).toBeVisible();
  });

  test("backup manual", async ({ tauriPage: page }) => {
    await clickInMain(page, "button", /^Copias de seguridad/);
    const save = page.getByRole("button", { name: /Guardar copia ahora/i });
    await expect(save).toBeVisible();
    await save.click();
    await expect(pageHeader(page).getByText("Copia guardada")).toBeVisible({ timeout: 20_000 });
  });

  test("restaurar (UI visible)", async ({ tauriPage: page }) => {
    await clickInMain(page, "button", /^Ayuda y soporte/);
    await page.getByText("Información avanzada").click();
    await clickInMain(page, "button", /Para soporte/);
    await expect(page.getByRole("button", { name: /Restaurar copia anterior/i })).toBeVisible();
  });
});
