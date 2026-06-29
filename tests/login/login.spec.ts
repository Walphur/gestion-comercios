import { test, expect } from "../support/fixtures";
import {
  loginAsAdmin,
  loginAsCajero,
  ensureLoginScreen,
} from "../support/helpers";

test.describe("Login", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    await ensureLoginScreen(page);
  });

  test("iniciar sesión como administrador", async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("link", { name: "Inicio" })).toBeVisible();
  });

  test("PIN incorrecto", async ({ tauriPage: page }) => {
    await page.getByRole("button", { name: /otro usuario/i }).click();
    await page.getByLabel("Usuario (manual)").fill("admin");
    await page.getByLabel("PIN").fill("9999");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("PIN incorrecto")).toBeVisible();
  });

  test("usuario inexistente", async ({ tauriPage: page }) => {
    await page.getByRole("button", { name: /otro usuario/i }).click();
    await page.getByLabel("Usuario (manual)").fill("no_existe_xyz");
    await page.getByLabel("PIN").fill("0000");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("PIN incorrecto")).toBeVisible();
  });

  test("cerrar sesión", async ({ tauriPage: page }) => {
    await loginAsCajero(page);
    await page.getByRole("button", { name: /Cambiar empleado/i }).first().click();
    await expect(page).toHaveURL(/#\/login/);
    await expect(page.getByLabel("PIN")).toBeVisible();
  });
});
