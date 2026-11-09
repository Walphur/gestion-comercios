import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import {
  finalizePosSale,
  loginAsAdmin,
  navigateSidebar,
  openCashSession,
  scanProductInPos,
  seedProducts,
  tauriInvoke,
} from "../support/helpers";

async function sql<T>(page: Page, query: string): Promise<T[]> {
  return tauriInvoke<T[]>(page, "plugin:sql|select", { db: "sqlite:gestion.db", query, values: [] });
}

async function stockOf(page: Page): Promise<number> {
  const rows = await sql<{ stock: number }>(page, "SELECT stock FROM products WHERE barcode = 'E2E00000000'");
  return rows[0]?.stock ?? NaN;
}

test.describe("Borrar turno de caja", () => {
  test("el admin borra un turno cerrado con su venta y el stock vuelve", async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await seedProducts(page, 1);
    await openCashSession(page);

    await navigateSidebar(page, "Punto de venta");
    await scanProductInPos(page, "E2E00000000");
    await finalizePosSale(page);
    expect(await stockOf(page)).toBe(9);

    await navigateSidebar(page, "Caja");
    await page.getByLabel("Efectivo contado").fill("100");
    await page.getByRole("button", { name: "Cerrar turno" }).click();

    const report = page.getByRole("dialog", { name: /^Turno #\d+/ });
    await expect(report).toBeVisible({ timeout: 15_000 });
    await report.getByRole("button", { name: "Borrar turno" }).click();

    const del = page.getByRole("dialog", { name: /^Borrar turno #\d+/ });
    await expect(del.getByText(/Se borran el turno, su arqueo, sus movimientos de caja y la venta de ese turno/)).toBeVisible();
    await del.getByRole("button", { name: "Sí, borrar" }).click();

    const pin = del.getByLabel("PIN de administrador");
    await pin.fill("0000");
    await del.getByRole("button", { name: "Borrar turno" }).click();
    await expect(del.getByText(/PIN incorrecto/)).toBeVisible();

    await pin.fill("1234");
    await del.getByRole("button", { name: "Borrar turno" }).click();
    await expect(del).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(/Turno #\d+ borrado con 1 venta/)).toBeVisible();

    expect(await sql<{ n: number }>(page, "SELECT COUNT(*) AS n FROM cash_sessions")).toEqual([{ n: 0 }]);
    expect(await sql<{ n: number }>(page, "SELECT COUNT(*) AS n FROM sales")).toEqual([{ n: 0 }]);
    expect(await sql<{ n: number }>(page, "SELECT COUNT(*) AS n FROM sale_items")).toEqual([{ n: 0 }]);
    expect(await stockOf(page)).toBe(10);
    const log = await sql<{ details: string }>(
      page,
      "SELECT details FROM action_log WHERE action = 'cash_session_deleted'",
    );
    expect(log[0]?.details).toMatch(/^ventas=1, total=\d+/);
    await expect(page.getByText("Turnos anteriores")).toHaveCount(0);
  });
});
