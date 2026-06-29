import { test, expect } from "../support/fixtures";
import { loginAsAdmin, navigateSidebar, openCashSession, integrityCheck } from "../support/helpers";

test.describe("Caja", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await navigateSidebar(page, "Caja");
  });

  test("abrir caja", async ({ tauriPage: page }) => {
    const openBtn = page.getByRole("button", { name: "Abrir turno" });
    if (await openBtn.isEnabled()) {
      await openBtn.click();
    }
    await expect(page.getByText(/Turno abierto|Turno #/i)).toBeVisible();
  });

  test("ingreso de efectivo", async ({ tauriPage: page }) => {
    await openCashSession(page);
    await navigateSidebar(page, "Caja");
    await page.getByLabel("Tipo").selectOption("income");
    await page.getByLabel("Monto").fill("500");
    await page.getByLabel("Concepto").fill("Ingreso E2E");
    await page.getByRole("button", { name: /Registrar ingreso/i }).click();
    await expect(page.getByText(/Ingresos:/i)).toBeVisible();
  });

  test("egreso de efectivo", async ({ tauriPage: page }) => {
    await openCashSession(page);
    await navigateSidebar(page, "Caja");
    await page.getByLabel("Tipo").selectOption("expense");
    await page.getByLabel("Monto").fill("100");
    await page.getByLabel("Concepto").fill("Egreso E2E");
    await page.getByRole("button", { name: /Registrar egreso/i }).click();
    await expect(page.getByText(/Egresos:/i)).toBeVisible();
  });

  test("cierre y arqueo", async ({ tauriPage: page }) => {
    await openCashSession(page);
    await navigateSidebar(page, "Caja");
    await page.getByLabel("Efectivo contado").fill("1000");
    await page.getByRole("button", { name: "Cerrar turno" }).click();
    const check = await integrityCheck(page);
    expect(check.integrity).toBe("ok");
  });
});
