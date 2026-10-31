import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  navigateSidebar,
  openCashSession,
  seedProducts,
  confirmDialog,
  integrityCheck,
  scanProductInPos,
  finalizePosSale,
  openPosCheckout,
  confirmPosCheckout,
  pageHeader,
} from "../support/helpers";

test.describe("Ventas", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await seedProducts(page, 2);
    await openCashSession(page);
  });

  test("venta simple en efectivo", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Punto de venta");
    await scanProductInPos(page, "E2E00000000");
    await finalizePosSale(page);
    await navigateSidebar(page, "Ventas");
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("venta con descuento", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Punto de venta");
    await scanProductInPos(page, "E2E00000001");
    const pay = await openPosCheckout(page);
    await pay.getByLabel("Ajuste %").fill("-10");
    await pay.getByLabel("Ajuste %").press("Tab");
    await expect(pay.locator(".pos-pay__subtotal", { hasText: "Ajuste" })).toBeVisible();
    await confirmPosCheckout(page);
    await navigateSidebar(page, "Ventas");
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("venta con cliente", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Clientes");
    await pageHeader(page).getByRole("button", { name: /Nuevo cliente/i }).click();
    await page.getByLabel(/Nombre/i).fill("Cliente E2E");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Cliente E2E").first()).toBeVisible();
    await navigateSidebar(page, "Punto de venta");
    await scanProductInPos(page, "E2E00000000");
    const pay = await openPosCheckout(page);
    await pay.getByPlaceholder("Buscar cliente...").fill("Cliente E2E");
    await pay.getByRole("button", { name: /Cliente E2E/ }).click();
    await confirmPosCheckout(page);
    await navigateSidebar(page, "Ventas");
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await page.getByLabel("Ver detalle").first().click();
    await expect(page.getByRole("dialog").getByText("Cliente E2E").first()).toBeVisible();
  });

  test("venta Mercado Pago (simulación UI)", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Punto de venta");
    await scanProductInPos(page, "E2E00000000");
    const mp = page.getByRole("button", { name: /Mercado Pago/i });
    if (await mp.isVisible()) {
      await mp.click();
    }
    await page.getByRole("button", { name: "Finalizar venta" }).click();
    const modal = page.getByText(/Mercado Pago|QR/i);
    if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.keyboard.press("Escape");
    }
  });

  test("anular venta", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Punto de venta");
    await scanProductInPos(page, "E2E00000000");
    await finalizePosSale(page);
    await navigateSidebar(page, "Ventas");
    await page.getByLabel("Ver detalle").first().click();
    await page.getByRole("button", { name: /Anular venta/i }).click();
    await confirmDialog(page, /Sí, anular/i);
    await expect(page.getByText("Anulada", { exact: true }).first()).toBeVisible();
  });

  test("editar venta", async ({ tauriPage: page }) => {
    await navigateSidebar(page, "Punto de venta");
    await scanProductInPos(page, "E2E00000000");
    await finalizePosSale(page);
    await navigateSidebar(page, "Ventas");
    await page.getByLabel("Editar venta").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /Editar venta/i })).toBeVisible();
    await dialog.getByRole("button", { name: /Cancelar/i }).click();
  });

  test("integridad BD tras ventas", async ({ tauriPage: page }) => {
    const check = await integrityCheck(page);
    expect(check.integrity).toBe("ok");
  });
});
