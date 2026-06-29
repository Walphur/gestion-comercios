import { test, expect } from "../support/fixtures";
import { loginAsAdmin, loginAsCajero, logout, appGoto } from "../support/helpers";

test.describe("Login", () => {
  test.beforeEach(async ({ tauriPage: page }) => {
    const switchBtn = page.getByRole("button", { name: /Cambiar empleado/i });
    if (await switchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await switchBtn.click();
    } else {
      await appGoto(page, "/login");
    }
  });

  test("iniciar sesión como administrador", async ({ tauriPage: page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("link", { name: "Inicio" })).toBeVisible();
  });

  test("PIN incorrecto", async ({ tauriPage: page }) => {
    await appGoto(page, "/login");
    await page.getByRole("button", { name: /Administrador/i }).click();
    await page.getByLabel("PIN").fill("9999");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("PIN incorrecto")).toBeVisible();
  });

  test("usuario inexistente", async ({ tauriPage: page }) => {
    await appGoto(page, "/login");
    await page.getByRole("button", { name: /otro usuario/i }).click();
    await page.getByLabel("Usuario (manual)").fill("no_existe_xyz");
    await page.getByLabel("PIN").fill("0000");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("PIN incorrecto")).toBeVisible();
  });

  test("cerrar sesión", async ({ tauriPage: page }) => {
    await loginAsCajero(page);
    await page.getByRole("button", { name: /Cambiar empleado/i }).click();
    await expect(page).toHaveURL(/#\/login/);
    await logout(page);
  });
});
