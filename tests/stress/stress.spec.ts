import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  navigateSidebar,
  openCashSession,
  seedProducts,
  integrityCheck,
  tauriInvoke,
} from "../support/helpers";

test.describe("Stress — integridad de base de datos", () => {
  test("crear 1000 productos vía seed E2E", async ({ tauriPage: page }) => {
    test.setTimeout(300_000);
    await loginAsAdmin(page);
    const n = await seedProducts(page, 1000);
    expect(n).toBeGreaterThan(900);
    const check = await integrityCheck(page);
    expect(check.ok).toBe(true);
    expect(check.integrity).toBe("ok");
    expect(check.product_count).toBeGreaterThanOrEqual(1000);
  });

  test("editar 1000 productos (Rust)", async ({ tauriPage: page }) => {
    test.setTimeout(300_000);
    await loginAsAdmin(page);
    await seedProducts(page, 1000);
    const updated = await tauriInvoke<number>(page, "e2e_bulk_update_products", { count: 1000 });
    expect(updated).toBeGreaterThan(900);
    const check = await integrityCheck(page);
    expect(check.integrity).toBe("ok");
  });

  test("eliminar 1000 productos (desactivar masivo)", async ({ tauriPage: page }) => {
    test.setTimeout(300_000);
    await loginAsAdmin(page);
    await seedProducts(page, 1000);
    const removed = await tauriInvoke<number>(page, "e2e_bulk_deactivate_products", {
      count: 1000,
    });
    expect(removed).toBeGreaterThan(900);
    const check = await integrityCheck(page);
    expect(check.integrity).toBe("ok");
  });

  test("500 ventas vía seed E2E", async ({ tauriPage: page }) => {
    test.setTimeout(600_000);
    await loginAsAdmin(page);
    await seedProducts(page, 5);
    await openCashSession(page);
    const n = await tauriInvoke<number>(page, "e2e_seed_sales", { count: 500 });
    expect(n).toBe(500);
    const check = await integrityCheck(page);
    expect(check.integrity).toBe("ok");
    expect(check.sale_count).toBeGreaterThanOrEqual(500);
  });

  test("abrir y cerrar caja repetidamente", async ({ tauriPage: page }) => {
    test.setTimeout(300_000);
    await loginAsAdmin(page);
    for (let i = 0; i < 15; i++) {
      await navigateSidebar(page, "Caja");
      const open = page.getByRole("button", { name: "Abrir turno" });
      if (await open.isEnabled()) await open.click();
      const close = page.getByRole("button", { name: "Cerrar turno" });
      if (await close.isVisible()) {
        await page.getByLabel("Efectivo contado").fill("100");
        await close.click();
        await page.waitForTimeout(300);
      }
    }
    const check = await integrityCheck(page);
    expect(check.integrity).toBe("ok");
  });

  test("PRAGMA integrity_check final", async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    const check = await integrityCheck(page);
    expect(check.ok, `integrity_check = ${check.integrity}`).toBe(true);
  });
});
