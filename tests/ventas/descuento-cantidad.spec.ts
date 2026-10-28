import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  navigateSidebar,
  openCashSession,
  seedProducts,
  expectSeededProduct,
  scanProductInPos,
} from "../support/helpers";

test.describe("Descuento por cantidad", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await seedProducts(page, 1);
    await openCashSession(page);
  });

  test("la caja aplica el escalón al llegar a la cantidad", async ({ tauriPage: page }) => {
    await expectSeededProduct(page, 0);
    await page.getByLabel("Editar").first().click();
    await page.getByRole("button", { name: /Agregar descuento por cantidad/i }).click();
    await page.getByLabel("Cantidad mínima del escalón 1").fill("2");
    await page.getByLabel("Descuento del escalón 1").fill("15");
    await page.getByRole("button", { name: /Guardar/i }).last().click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    await navigateSidebar(page, "Punto de venta");
    await scanProductInPos(page, "E2E00000000");
    await expect(page.getByText(/Descuento por cantidad: 15% off/)).toHaveCount(0);
    await scanProductInPos(page, "E2E00000000");
    await expect(page.getByText("Descuento por cantidad: 15% off")).toBeVisible();
    await expect(page.getByText("$ 170,00").first()).toBeVisible();

    await page.getByRole("button", { name: /Finalizar venta/i }).click();
    await expect(page.getByRole("dialog").getByText("$ 170,00").first()).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
