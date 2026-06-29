import { expect, type Page } from "@playwright/test";

export const APP_ORIGIN = "http://localhost:1420";

export async function appGoto(page: Page, hashPath: string) {
  const path = hashPath.startsWith("/") ? hashPath : `/${hashPath}`;
  await page.goto(`${APP_ORIGIN}/#${path.startsWith("/#") ? path.slice(2) : path}`);
}

export async function tauriInvoke<T>(
  page: Page,
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return page.evaluate(
    async ({ command, payload }) => {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke(command, payload);
    },
    { command: cmd, payload: args ?? {} },
  );
}

export async function ensureLoginScreen(page: Page) {
  const onDashboard = await page
    .getByRole("link", { name: "Inicio" })
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (onDashboard) {
    await page.getByRole("button", { name: /Cambiar empleado/i }).first().click();
  } else if (!(await page.getByLabel("PIN").isVisible({ timeout: 2000 }).catch(() => false))) {
    await appGoto(page, "/login");
  }
  await dismissCatalogWizardIfNeeded(page);
  await expect(page.getByLabel("PIN")).toBeVisible({ timeout: 20_000 });
}

export async function dismissCatalogWizardIfNeeded(page: Page) {
  const wizard = page.getByRole("heading", { name: "Configurá tu comercio" });
  if (await wizard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByText("Empezar vacío", { exact: true }).first().click();
    await page.getByRole("button", { name: /Empezar vacío/i }).click();
    await expect(wizard).toBeHidden({ timeout: 60_000 });
  }
}

export async function loginAs(
  page: Page,
  user: { displayName: string; pin: string },
) {
  await ensureLoginScreen(page);
  await page.getByRole("button", { name: new RegExp(user.displayName, "i") }).first().click();
  await page.getByLabel("PIN").fill(user.pin);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/#\/($|\?)/, { timeout: 30_000 });
  await dismissCatalogWizardIfNeeded(page);
}

export async function loginAsAdmin(page: Page) {
  await loginAs(page, { displayName: "Administrador", pin: "1234" });
}

export async function loginAsCajero(page: Page) {
  await loginAs(page, { displayName: "Cajero", pin: "0000" });
}

export async function logout(page: Page) {
  await appGoto(page, "/login");
}

export async function navigateSidebar(page: Page, label: string) {
  await page.getByRole("link", { name: label, exact: true }).click();
}

export async function openCashSession(page: Page) {
  await navigateSidebar(page, "Caja");
  const openBtn = page.getByRole("button", { name: "Abrir turno" });
  if (await openBtn.isEnabled()) {
    await openBtn.click();
    await page.waitForTimeout(800);
  }
}

export async function integrityCheck(page: Page) {
  return tauriInvoke<{
    ok: boolean;
    integrity: string;
    product_count: number;
    sale_count: number;
  }>(page, "e2e_integrity_check");
}

export async function seedProducts(page: Page, count: number) {
  return tauriInvoke<number>(page, "e2e_seed_products", { count });
}

export async function confirmDialog(page: Page, confirmLabel = /Sí|Confirmar|Anular|Eliminar/i) {
  const btn = page.getByRole("button", { name: confirmLabel }).last();
  await btn.click({ timeout: 5000 });
}

export async function unlockAdminConfig(page: Page) {
  await page.getByPlaceholder("PIN").fill("1234");
  await page.getByRole("button", { name: "Ingresar" }).click();
}

export async function scanProductInPos(page: Page, barcode: string) {
  await page.getByPlaceholder(/Escaneá|buscá/i).fill(barcode);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
}

export async function finalizePosSale(page: Page) {
  await page.getByRole("button", { name: "Finalizar venta" }).click();
  await expect(page.getByText(/Venta registrada/i)).toBeVisible({ timeout: 25_000 });
}
