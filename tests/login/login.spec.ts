import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  loginAsCajero,
  loginAsManual,
  waitForLoginReady,
} from "../support/helpers";

test.describe("Login", () => {
  test("iniciar sesión como administrador", async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("link", { name: "Inicio" })).toBeVisible();
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
    await page.getByRole("button", { name: /Cambiar empleado/i }).first().click();
    await expect(page).toHaveURL(/#\/login/);
    await waitForLoginReady(page);
  });
});
