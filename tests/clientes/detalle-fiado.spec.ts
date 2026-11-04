import { test, expect } from "../support/fixtures";
import { loginAsAdmin, navigateSidebar } from "../support/helpers";

test.describe("Detalle de fiado", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await navigateSidebar(page, "Clientes");
  });

  test("cliente con DNI, domicilio y organismo sale en el detalle con sus totales", async ({ tauriPage: page }) => {
    const stamp = Date.now();
    const name = `Fiado Muni PW ${stamp}`;
    const org = `Municipalidad PW ${stamp}`;
    await page.getByRole("button", { name: /Nuevo cliente|Agregar/i }).first().click();
    const form = page.getByRole("dialog");
    await form.getByLabel(/Nombre y apellido/i).fill(name);
    await form.getByLabel(/DNI \/ CUIT/i).fill("30123456");
    await form.getByLabel(/Domicilio/i).fill("Calle Falsa 123");
    await form.getByLabel(/Organismo \/ empresa/i).fill(org);
    await form.getByLabel(/Deuda inicial/i).fill("1000");
    await form.getByRole("button", { name: "Guardar" }).click();

    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("customer-id-line")).toHaveText(`DNI 30123456 · Calle Falsa 123 · ${org}`);

    await page.getByPlaceholder(/Buscar por nombre/i).fill("Calle Falsa");
    await expect(row).toBeVisible();
    await page.getByPlaceholder(/Buscar por nombre/i).fill("");

    await row.getByRole("button", { name: /Cobrar/i }).click();
    const pay = page.getByRole("dialog");
    await pay.getByLabel(/Monto a cobrar/i).fill("400");
    await pay.getByRole("button", { name: /Registrar cobro/i }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole("button", { name: /Detalle de fiado/i }).click();
    const report = page.getByRole("dialog");
    await report.getByRole("button", { name: "Este mes" }).click();
    await report.getByLabel(/^Organismo/).selectOption(org);

    const customer = report.getByTestId("fiado-customer");
    await expect(customer).toHaveCount(1, { timeout: 15_000 });
    await expect(customer).toContainText(name);
    await expect(customer).toContainText(`DNI 30123456 · Calle Falsa 123 · ${org}`);
    await expect(customer).toContainText("2 movimientos");
    await expect(customer.getByTestId("fiado-closing")).toHaveText(/600,00/);

    const totals = report.getByTestId("fiado-totals");
    await expect(totals).toContainText(/Saldo al inicio\s*\$\s*1\.000,00/);
    await expect(totals).toContainText(/Pagado\s*\$\s*400,00/);
    await expect(totals).toContainText(/Saldo al final\s*\$\s*600,00/);

    // En E2E la app no abre el diálogo nativo de guardar: exporta a la carpeta temporal.
    await report.getByRole("button", { name: /Exportar Excel/i }).click();
    await expect(page.getByText(/Listo: 1 cliente con su detalle/).first()).toBeVisible({ timeout: 20_000 });
  });
});
