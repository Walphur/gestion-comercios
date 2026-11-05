import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  navigateSidebar,
  openAllNavGroups,
  openProductAddManual,
  seedProducts,
  setE2eBilling,
  tauriInvoke,
} from "../support/helpers";

test.describe("Licencia Permanente", () => {
  test.afterEach(async ({ tauriPage: page }) => {
    await tauriInvoke(page, "e2e_clear_billing");
  });

  test("sin proveedores ni reportes y tope de 1.000 productos", async ({ tauriPage: page }) => {
    await setE2eBilling(page, "perpetual");
    await loginAsAdmin(page);
    await seedProducts(page, 1000);

    await openAllNavGroups(page);
    const aside = page.getByRole("complementary");
    await expect(aside.getByRole("link", { name: "Proveedores", exact: true })).toHaveCount(0);
    await expect(aside.getByRole("link", { name: "Reportes", exact: true })).toHaveCount(0);
    await expect(aside.getByRole("link", { name: "Productos", exact: true })).toBeVisible();

    await page.evaluate(() => {
      window.location.hash = "#/proveedores";
    });
    await expect(page.getByText(/Proveedores, ingreso de compras y pedidos para reponer vienen con WalQo Completo/i)).toBeVisible();

    await page.evaluate(() => {
      window.location.hash = "#/reportes";
    });
    await expect(page.getByText(/Los reportes por fechas, la ganancia y las sugerencias vienen con WalQo Completo/i)).toBeVisible();

    await navigateSidebar(page, "Productos");
    await openProductAddManual(page);
    await page.getByLabel(/Nombre del producto/i).fill(`PW Permanente ${Date.now()}`);
    await page.getByLabel(/Precio/i).first().fill("150");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(/Tu licencia Permanente permite hasta 1\.000 productos/i)).toBeVisible();
  });
});
