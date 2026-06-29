import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  navigateSidebar,
  seedProducts,
  integrityCheck,
} from "../support/helpers";

test.describe("Stock", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await seedProducts(page, 2);
    await navigateSidebar(page, "Stock");
  });

  test("ver inventario", async ({ tauriPage: page }) => {
    await expect(page.getByText("E2E Producto 0")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("E2E Producto 1")).toBeVisible();
  });

  test("ajuste de stock", async ({ tauriPage: page }) => {
    await page.getByRole("button", { name: "Ajustar" }).first().click();
    await page.getByLabel(/Cantidad/i).fill("5");
    await page.getByRole("button", { name: "Guardar" }).click();
  });

  test("filtro stock bajo", async ({ tauriPage: page }) => {
    await page.getByLabel(/Solo stock bajo/i).check();
    await page.waitForTimeout(500);
  });

  test("movimientos de stock", async ({ tauriPage: page }) => {
    await page.getByRole("button", { name: /Movimientos/i }).click();
    await expect(page.locator("table")).toBeVisible();
  });

  test("ingreso compra (modal)", async ({ tauriPage: page }) => {
    await page.getByRole("button", { name: /Ingreso compra/i }).click();
    await expect(page.getByText(/compra|ingreso/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("integridad BD tras stock", async ({ tauriPage: page }) => {
    const check = await integrityCheck(page);
    expect(check.integrity).toBe("ok");
  });
});
