import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  navigateSidebar,
  openCashSession,
  scanProductInPos,
  seedProducts,
} from "../support/helpers";

test.describe("Detalle de la venta (quién retiró)", () => {
  test("fiado con detalle: se anota al cobrar con Enter y sale en la cuenta corriente", async ({ tauriPage: page }) => {
    const name = `Muni Retiro PW ${Date.now()}`;
    await loginAsAdmin(page);
    await seedProducts(page, 1);
    await openCashSession(page);

    await navigateSidebar(page, "Clientes");
    await page.getByRole("button", { name: /Nuevo cliente|Agregar/i }).first().click();
    await page.getByLabel(/Nombre/i).first().fill(name);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(name)).toBeVisible();

    await navigateSidebar(page, "Punto de venta");
    await scanProductInPos(page, "E2E00000000");
    await page.getByRole("button", { name: "Finalizar venta" }).click();
    const pay = page.getByRole("dialog");
    await expect(pay.getByTestId("sale-note-open")).toBeVisible();
    await expect(pay.getByTestId("sale-note-input")).toHaveCount(0);

    await pay.getByRole("group", { name: "Medio de pago" }).getByRole("button", { name: /Fiado/i }).click();
    await expect(pay.getByTestId("sale-note-input")).toBeVisible();
    await expect(pay.getByTestId("sale-note-input")).not.toBeFocused();
    await pay.getByPlaceholder("Buscar cliente...").fill(name);
    await pay.getByRole("button", { name: new RegExp(name) }).click();
    await pay.getByTestId("sale-note-input").fill("La llevó Juan");
    await pay.getByTestId("sale-note-input").press("Enter");
    await expect(page.getByRole("button", { name: /Confirmar cobro/i })).toHaveCount(0, { timeout: 20_000 });

    await navigateSidebar(page, "Clientes");
    await page.getByRole("row", { name: new RegExp(name) }).getByRole("button", { name: /Historial/i }).click();
    const history = page.getByRole("dialog");
    await expect(history.getByText(/Están todos los movimientos/)).toBeVisible();
    const note = history.getByTestId("ledger-sale-note");
    await expect(note).toHaveText("La llevó Juan");

    await history.getByRole("button", { name: /Compra a fiado/ }).click();
    await history.getByTestId("sale-note-edit").click();
    await history.getByTestId("sale-note-input").fill("La llevó Juan, garrafa para el corral");
    await history.getByTestId("sale-note-save").click();
    await expect(note).toHaveText("La llevó Juan, garrafa para el corral");
  });
});
