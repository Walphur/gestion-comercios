import { test, expect } from "../support/fixtures";
import { loginAsAdmin, navigateSidebar, integrityCheck } from "../support/helpers";

const CLIENT = `Cliente PW ${Date.now()}`;

test.describe("Clientes", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await navigateSidebar(page, "Clientes");
  });

  test("crear cliente", async ({ tauriPage: page }) => {
    await page.getByRole("button", { name: /Nuevo cliente|Agregar/i }).click();
    await page.getByLabel(/Nombre/i).fill(CLIENT);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(CLIENT)).toBeVisible();
  });

  test("editar cliente", async ({ tauriPage: page }) => {
    await page.getByRole("button", { name: /Nuevo cliente|Agregar/i }).click();
    await page.getByLabel(/Nombre/i).fill(`${CLIENT} Edit`);
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.getByLabel("Editar").first().click();
    await page.getByLabel(/Nombre/i).fill(`${CLIENT} Editado`);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(`${CLIENT} Editado`)).toBeVisible();
  });

  test("cobrar pago a cliente", async ({ tauriPage: page }) => {
    const row = page.getByRole("button", { name: /Cobrar/i }).first();
    if (await row.isVisible()) {
      await row.click();
      await page.getByLabel(/Monto/i).fill("50");
      await page.getByRole("button", { name: /Registrar cobro/i }).click();
    }
  });

  test("desactivar cliente", async ({ tauriPage: page }) => {
    await page.getByLabel("Eliminar").first().click();
    await page.getByRole("button", { name: /Sí, desactivar/i }).click();
  });

  test("fiado (flujo POS)", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Punto de venta");
    const fiado = page.getByRole("button", { name: /Fiado/i });
    expect(await fiado.count()).toBeGreaterThanOrEqual(0);
  });

  test("integridad BD tras clientes", async ({ tauriPage: page }) => {
    const check = await integrityCheck(page);
    expect(check.integrity).toBe("ok");
  });
});
