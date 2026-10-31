import { test, expect } from "../support/fixtures";
import {
  collapseSidebar,
  ensureSidebarExpanded,
  loginAsAdmin,
  loginAsCajero,
  loginAsManual,
  waitForLoginReady,
} from "../support/helpers";

test.describe("Login", () => {
  test("iniciar sesión como administrador", async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await expect(
      page.getByRole("complementary").getByRole("link", { name: "Inicio", exact: true }),
    ).toBeVisible();
  });

  test("PIN incorrecto", async ({ tauriPage: page }) => {
    await loginAsManual(page, "admin", "9999");
    await expect(page.getByText("PIN incorrecto")).toBeVisible();
  });

  test("usuario inexistente", async ({ tauriPage: page }) => {
    await loginAsManual(page, "no_existe_xyz", "0000");
    await expect(page.getByText("PIN incorrecto")).toBeVisible();
  });

  test("cerrar sesión", async ({ tauriPage: page }) => {
    await loginAsCajero(page);
    await collapseSidebar(page);
    await page.getByRole("complementary").getByRole("button", { name: /Cambiar empleado/i }).click();
    await expect(page).toHaveURL(/#\/login/);
    await waitForLoginReady(page);
  });

  test("cambiar empleado desde el menú completo", async ({ tauriPage: page }) => {
    await loginAsCajero(page);
    await ensureSidebarExpanded(page);
    await page.getByRole("complementary").getByRole("button", { name: /Cambiar empleado/i }).click();
    await expect(page).toHaveURL(/#\/login/);
    await waitForLoginReady(page);
  });
});
