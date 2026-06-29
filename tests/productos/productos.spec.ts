import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  navigateSidebar,
  seedProducts,
  integrityCheck,
} from "../support/helpers";

const PRODUCT_NAME = `PW Test ${Date.now()}`;

test.describe("Productos", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await navigateSidebar(page, "Productos");
  });

  test("crear producto", async ({ tauriPage: page }) => {
    await page.getByRole("button", { name: /Agregar producto/i }).click();
    await page.getByRole("menuitem", { name: /Manual/i }).click();
    await page.getByLabel(/Nombre del producto/i).fill(PRODUCT_NAME);
    await page.getByLabel(/Precio/i).first().fill("150");
    await page.getByLabel(/Costo/i).first().fill("80");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(PRODUCT_NAME)).toBeVisible({ timeout: 15_000 });
  });

  test("buscar productos", async ({ tauriPage: page }) => {
    await seedProducts(page, 3);
    await page.reload();
    await navigateSidebar(page, "Productos");
    await page.getByPlaceholder(/Buscar/i).fill("E2E Producto");
    await expect(page.getByText("E2E Producto 0")).toBeVisible();
  });

  test("editar producto", async ({ tauriPage: page }) => {
    await seedProducts(page, 1);
    await page.reload();
    await navigateSidebar(page, "Productos");
    await page.getByPlaceholder(/Buscar/i).fill("E2E Producto 0");
    await page.getByLabel("Editar").first().click();
    await page.getByLabel(/Nombre del producto/i).fill("E2E Producto 0 Editado");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("E2E Producto 0 Editado")).toBeVisible();
  });

  test("eliminar producto", async ({ tauriPage: page }) => {
    await seedProducts(page, 1);
    await page.reload();
    await navigateSidebar(page, "Productos");
    await page.getByPlaceholder(/Buscar/i).fill("E2E Producto 0");
    await page.getByLabel("Eliminar").first().click();
    await page.getByRole("button", { name: /Sí, eliminar/i }).click();
    await expect(page.getByText("E2E Producto 0")).toHaveCount(0);
  });

  test("recuperar producto eliminado", async ({ tauriPage: page }) => {
    await page.getByRole("button", { name: /Más acciones/i }).click();
    const recoverBtn = page.getByRole("menuitem", { name: /Recuperar/i });
    if (await recoverBtn.isVisible()) {
      await recoverBtn.click();
      await expect(page.getByText(/recuper/i)).toBeVisible();
    } else {
      test.skip(true, "Sin productos eliminados para recuperar");
    }
  });

  test("importar productos (UI)", async ({ tauriPage: page }) => {
    await page.getByRole("button", { name: /Agregar producto/i }).click();
    await page.getByRole("menuitem", { name: /Importar/i }).click();
    await expect(page.getByText(/Importar/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("integridad BD tras productos", async ({ tauriPage: page }) => {
    const check = await integrityCheck(page);
    expect(check.integrity).toBe("ok");
  });
});
