import { test, expect } from "../support/fixtures";
import {
  bootGastronomia,
  confirmPosCheckout,
  loginAsAdmin,
  navigateSidebar,
  openCashSession,
  productStockByBarcode,
  waitForAppReady,
} from "../support/helpers";

/**
 * Flujo A — Venta en mesa: abrir, mozo, ítems, comanda, cobrar → POS → stock.
 */
test.describe("Gastronomía — Mesa (Flujo A)", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await bootGastronomia(page, "restaurante");
    await loginAsAdmin(page);
    await openCashSession(page);
  });

  test("abrir mesa, comanda, cobrar y descontar stock", async ({ tauriPage: page }) => {
    await waitForAppReady(page);
    const before = await productStockByBarcode(page, "E2EGASTROING");
    expect(before).toBeGreaterThan(0);

    await navigateSidebar(page, "Mesas");
    await expect(
      page.getByTestId("page-header").getByRole("heading", { name: "Mesas", exact: true }),
    ).toBeVisible({ timeout: 20_000 });

    // Mesa libre: botón con "Libre" o etiqueta Mesa 1.
    const mesaLibre = page.getByRole("main").getByRole("button").filter({ hasText: /Libre|Mesa 1/i }).first();
    await expect(mesaLibre).toBeVisible({ timeout: 15_000 });
    await mesaLibre.click();

    const openModal = page.getByRole("dialog");
    await expect(openModal.getByRole("heading", { name: /Abrir Mesa/i })).toBeVisible({ timeout: 10_000 });
    const waiterSelect = openModal.getByLabel(/Mozo/i);
    if (await waiterSelect.isVisible().catch(() => false)) {
      const options = waiterSelect.locator("option");
      const n = await options.count();
      if (n > 1) {
        const value = await options.nth(1).getAttribute("value");
        if (value) await waiterSelect.selectOption(value);
      }
    }
    await openModal.getByRole("button", { name: /Abrir mesa/i }).click();

    // Modal de cuenta: buscar producto y agregar.
    const orderDialog = page.getByRole("dialog");
    await expect(orderDialog.getByRole("button", { name: /Cobrar|Enviar a cocina/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const search = orderDialog.getByPlaceholder(/Buscar|carta|producto/i).first();
    await expect(search).toBeVisible({ timeout: 10_000 });
    await search.fill("E2E Café");
    const hit = orderDialog.getByRole("button", { name: /E2E Café/i }).first();
    await expect(hit).toBeVisible({ timeout: 10_000 });
    await hit.click();

    // La línea tiene que estar en la cuenta (no alcanza con el resultado de búsqueda).
    const pendingKitchen = orderDialog.locator("div").filter({ hasText: /Para mandar a cocina/i }).first();
    await expect(pendingKitchen.getByText("E2E Café", { exact: true })).toBeVisible({ timeout: 15_000 });

    const sendBtn = orderDialog.getByRole("button", { name: /Enviar a cocina/i });
    await expect(sendBtn).toBeEnabled({ timeout: 10_000 });
    await sendBtn.click();
    await expect(page.getByText(/enviada a cocina/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(orderDialog.getByText(/Ronda \d+/i).first()).toBeVisible({ timeout: 10_000 });

    await orderDialog.getByRole("button", { name: /^Cobrar/i }).click();
    // Si quedó algún ítem new (cobro sin cocina), confirmar.
    const cobrarIgual = page.getByRole("alertdialog").getByRole("button", { name: /Cobrar igual/i });
    if (await cobrarIgual.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cobrarIgual.click();
    }

    // Pasa a POS con chargeTableOrderId.
    await expect(page).toHaveURL(/#\/pos/i, { timeout: 20_000 });
    await page.getByRole("button", { name: /Finalizar venta|Cobrar/i }).first().click();
    const pay = page.getByRole("dialog", { name: /Cobrar venta|Cobrar/i });
    await expect(pay).toBeVisible({ timeout: 15_000 });
    await confirmPosCheckout(page);

    await navigateSidebar(page, "Ventas");
    await expect(page.locator("table tbody tr").first()).toBeVisible();

    const after = await productStockByBarcode(page, "E2EGASTROING");
    expect(after!).toBeLessThan(before!);

    // Mesa debería volver a libre.
    await navigateSidebar(page, "Mesas");
    await expect(page.getByRole("main").getByRole("button").filter({ hasText: /Libre/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
