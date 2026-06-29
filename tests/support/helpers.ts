import { expect, type Page } from "@playwright/test";

export const APP_ORIGIN = "http://localhost:1420";

export async function appGoto(page: Page, hashPath: string) {
  const path = hashPath.startsWith("/") ? hashPath : `/${hashPath}`;
  await page.goto(`${APP_ORIGIN}/#${path.startsWith("/#") ? path.slice(2) : path}`);
}

export async function waitForE2eBridge(page: Page, timeoutMs = 30_000) {
  await page.waitForFunction(
    () => !!(window as Window & { __GESTION_E2E__?: unknown }).__GESTION_E2E__,
    undefined,
    { timeout: timeoutMs },
  );
}

export async function tauriInvoke<T>(
  page: Page,
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await waitForE2eBridge(page);
      return await page.evaluate(
        async ({ command, payload }) => {
          const bridge = window.__GESTION_E2E__;
          if (!bridge) throw new Error("Puente E2E no disponible");
          return bridge.invoke(command, payload);
        },
        { command: cmd, payload: args ?? {} },
      );
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      if (
        attempt < 3 &&
        (msg.includes("Execution context was destroyed") ||
          msg.includes("Target page, context or browser has been closed"))
      ) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function waitForAppReady(page: Page) {
  await expect(page.getByRole("complementary")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Cargando...", { exact: true })).toHaveCount(0, {
    timeout: 30_000,
  });
}

export async function waitForLoginReady(page: Page) {
  await expect(page.getByLabel("PIN")).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: /Cajero|Administrador/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

export async function loginAs(
  page: Page,
  user: { displayName: string; pin: string },
) {
  await waitForLoginReady(page);
  await page.getByRole("button", { name: new RegExp(user.displayName, "i") }).first().click();
  await page.getByLabel("PIN").fill(user.pin);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/#\/($|\?)/, { timeout: 30_000 });
  await waitForAppReady(page);
}

export async function loginAsAdmin(page: Page) {
  await loginAs(page, { displayName: "Administrador", pin: "1234" });
}

export async function loginAsCajero(page: Page) {
  await loginAs(page, { displayName: "Cajero", pin: "0000" });
}

export async function loginAsManual(page: Page, username: string, pin: string) {
  await waitForLoginReady(page);
  await page.getByRole("button", { name: /otro usuario/i }).click();
  await page.getByLabel("Usuario (manual)").fill(username);
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Entrar" }).click();
}

export async function navigateSidebar(page: Page, label: string) {
  await page
    .getByRole("complementary")
    .getByRole("link", { name: label, exact: true })
    .click();
}

export async function clickInMain(
  page: Page,
  role: "button" | "link",
  name: string | RegExp,
) {
  await page.getByRole("main").getByRole(role, { name }).click();
}

export async function openProductAddManual(page: Page) {
  await page.getByRole("button", { name: /Agregar producto/i }).first().click();
  await page.getByRole("button", { name: /^Manualmente/i }).click();
}

export async function openProductImport(page: Page) {
  await page.getByRole("button", { name: /Agregar producto/i }).first().click();
  await page.getByRole("button", { name: /Importar desde Excel/i }).click();
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
  await waitForAppReady(page);
  return tauriInvoke<number>(page, "e2e_seed_products", { count });
}

export async function expectSeededProduct(page: Page, index = 0) {
  const name = `E2E Producto ${index}`;
  await navigateSidebar(page, "Productos");
  await page.getByPlaceholder(/Buscar/i).fill("E2E Producto");
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });
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
