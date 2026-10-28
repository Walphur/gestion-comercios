import { test, expect } from "../support/fixtures";
import { loginAsAdmin, navigateSidebar } from "../support/helpers";

test.describe("Cobro de deuda", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await navigateSidebar(page, "Clientes");
  });

  test("el pago queda en el historial con quién cobró y el medio", async ({ tauriPage: page }) => {
    const name = `Deuda PW ${Date.now()}`;
    await page.getByRole("button", { name: /Nuevo cliente|Agregar/i }).first().click();
    await page.getByLabel(/Nombre/i).fill(name);
    await page.getByLabel(/Deuda inicial/i).fill("1000");
    await page.getByRole("button", { name: "Guardar" }).click();

    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Cobrar/i }).click();
    const pay = page.getByRole("dialog");
    await pay.getByLabel(/Monto a cobrar/i).fill("400");
    await pay.getByLabel(/^Medio/i).selectOption("transferencia");
    await pay.getByLabel(/Nota/i).fill("pagó una parte");
    await pay.getByRole("button", { name: /Registrar cobro/i }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    await row.getByRole("button", { name: /Historial/i }).click();
    const history = page.getByRole("dialog");
    await expect(history.getByText("Pago de deuda")).toBeVisible();
    await expect(history.getByText(/Transferencia · Cobró: Administrador · pagó una parte/)).toBeVisible();
    await expect(history.getByText("Deuda inicial")).toBeVisible();
    await expect(history.getByText("$ 600,00").first()).toBeVisible();
  });
});
