import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  navigateSidebar,
  integrityCheck,
  openCashSession,
  scanProductInPos,
  seedProducts,
} from "../support/helpers";

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
    const name = `Cliente Del ${Date.now()}`;
    await page.getByRole("button", { name: /Nuevo cliente|Agregar/i }).click();
    await page.getByLabel(/Nombre/i).fill(name);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(name)).toBeVisible();
    await page.getByRole("row", { name: new RegExp(name) }).getByLabel("Eliminar").click();
    await page.getByRole("button", { name: /Sí, desactivar/i }).click();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("fiado (flujo POS): ventas seguidas, sin trabarse ni duplicar", async ({
    tauriPage: page,
  }) => {
    const name = `Fiado PW ${Date.now()}`;
    await page.getByRole("button", { name: /Nuevo cliente|Agregar/i }).first().click();
    await page.getByLabel(/Nombre/i).fill(name);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(name)).toBeVisible();
    await seedProducts(page, 1);
    await openCashSession(page);
    await navigateSidebar(page, "Punto de venta");

    const before = (await integrityCheck(page)).sale_count;
    for (let i = 0; i < 3; i++) {
      await scanProductInPos(page, "E2E00000000");
      await page.getByRole("button", { name: "Finalizar venta" }).click();
      const pay = page.getByRole("dialog");
      await pay.getByRole("group", { name: "Medio de pago" }).getByRole("button", { name: /Fiado/i }).click();
      await pay.getByPlaceholder("Buscar cliente...").fill(name);
      await pay.getByRole("button", { name: new RegExp(name) }).click();
      if (i === 2) {
        // Doble Enter seguido: tiene que quedar una sola venta.
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
      } else {
        await pay.getByRole("button", { name: /Confirmar cobro/i }).click();
      }
      await expect(page.getByRole("button", { name: /Confirmar cobro/i })).toHaveCount(0, {
        timeout: 20_000,
      });
    }
    await page.waitForTimeout(1500);
    expect((await integrityCheck(page)).sale_count - before).toBe(3);
  });

  test("integridad BD tras clientes", async ({ tauriPage: page }) => {
    const check = await integrityCheck(page);
    expect(check.integrity).toBe("ok");
  });
});
