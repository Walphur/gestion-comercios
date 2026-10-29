import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  navigateSidebar,
  openCashSession,
  scanProductInPos,
  seedProducts,
  expectSeededProduct,
} from "../support/helpers";

async function sellFiado(page: Page, customer: string) {
  await navigateSidebar(page, "Punto de venta");
  await scanProductInPos(page, "E2E00000000");
  await page.getByRole("button", { name: "Finalizar venta" }).click();
  const pay = page.getByRole("dialog");
  await pay.getByRole("group", { name: "Medio de pago" }).getByRole("button", { name: /Fiado/i }).click();
  await pay.getByPlaceholder("Buscar cliente...").fill(customer);
  await pay.getByRole("button", { name: new RegExp(customer) }).click();
  await pay.getByRole("button", { name: /Confirmar cobro/i }).click();
  await expect(page.getByRole("button", { name: /Confirmar cobro/i })).toHaveCount(0, { timeout: 20_000 });
}

async function setProductPrice(page: Page, price: string) {
  await expectSeededProduct(page, 0);
  await page.getByLabel("Editar").first().click();
  const field = page.getByLabel("Precio de venta", { exact: true });
  await field.fill(price);
  await expect(field).toHaveValue(price);
  await page.getByRole("button", { name: /Guardar/i }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
}

async function openHistory(page: Page, customer: string): Promise<Locator> {
  await navigateSidebar(page, "Clientes");
  await page.getByRole("row", { name: new RegExp(customer) }).getByRole("button", { name: /Historial/i }).click();
  const history = page.getByRole("dialog");
  await expect(history.getByText(/Están todos los movimientos/)).toBeVisible();
  return history;
}

test.describe("Fiado y cambio de precio", () => {
  test("subir el precio no suma deuda por lo que ya se pagó", async ({ tauriPage: page }) => {
    const name = `Libreta PW ${Date.now()}`;
    await loginAsAdmin(page);
    await seedProducts(page, 1);
    await openCashSession(page);
    await setProductPrice(page, "100");

    await navigateSidebar(page, "Clientes");
    await page.getByRole("button", { name: /Nuevo cliente|Agregar/i }).first().click();
    await page.getByLabel(/Nombre/i).fill(name);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(name)).toBeVisible();

    await sellFiado(page, name);
    await navigateSidebar(page, "Clientes");
    const row = page.getByRole("row", { name: new RegExp(name) });
    await row.getByRole("button", { name: /Cobrar/i }).click();
    const pay = page.getByRole("dialog");
    await pay.getByLabel(/Monto a cobrar/i).fill("100");
    await pay.getByRole("button", { name: /Registrar cobro/i }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    await row.getByRole("button", { name: /Cobrar/i }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /Registrar cobro/i })).toBeDisabled();
    await page.keyboard.press("Escape");

    await setProductPrice(page, "150");
    let history = await openHistory(page, name);
    await expect(history.getByText(/Aumento de precio en lo fiado/)).toHaveCount(0);
    await expect(history.getByTestId("customer-debt-today")).toHaveText("$ 0,00");
    await page.keyboard.press("Escape");

    await sellFiado(page, name);
    await setProductPrice(page, "200");
    history = await openHistory(page, name);
    await expect(history.getByText("Aumento de precio en lo fiado · E2E Producto 0")).toBeVisible();
    await expect(history.getByText(/E2E Producto 0: \$\s150,00 → \$\s200,00 · 1 u\./)).toBeVisible();
    await expect(history.getByTestId("customer-debt-today")).toHaveText("$ 200,00");
  });
});
