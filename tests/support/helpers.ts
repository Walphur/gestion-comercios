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
  // Layout usa "Cargando…" (ellipsis unicode); aceptar también ASCII.
  await expect(page.getByText(/^Cargando(\.\.\.|…)$/)).toHaveCount(0, {
    timeout: 30_000,
  });
}

export async function waitForLoginReady(page: Page) {
  await expect(page.locator("#login-pin")).toBeVisible({ timeout: 20_000 });
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
  await page.locator("#login-pin").fill(user.pin);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/#\/($|\?)/, { timeout: 30_000 });
  await waitForAppReady(page);
}

export async function loginAsAdmin(page: Page) {
  await loginAs(page, { displayName: "Administrador", pin: "1234" });
}

/** Nombre del ítem de /asistente en el menú lateral. */
export const BI_NAV_LABEL = "Sugerencias";

export async function loginAsCajero(page: Page) {
  await loginAs(page, { displayName: "Cajero", pin: "0000" });
}

export async function loginAsManual(page: Page, username: string, pin: string) {
  await waitForLoginReady(page);
  await page.getByRole("button", { name: /otro usuario/i }).click();
  await page.getByLabel("Usuario (manual)").fill(username);
  await page.locator("#login-pin").fill(pin);
  await page.getByRole("button", { name: "Entrar" }).click();
}

export async function ensureSidebarExpanded(page: Page) {
  const aside = page.getByRole("complementary");
  await expect(aside).toBeVisible({ timeout: 30_000 });
  const expandBtn = aside.getByRole("button", { name: /Abrir menú completo/i });
  if (await expandBtn.isVisible().catch(() => false)) {
    await expandBtn.click();
    await expect(aside.getByRole("button", { name: /Volver a solo íconos/i })).toBeVisible({
      timeout: 5_000,
    });
  }
}

export async function collapseSidebar(page: Page) {
  const aside = page.getByRole("complementary");
  await expect(aside).toBeVisible({ timeout: 30_000 });
  const collapseBtn = aside.getByRole("button", { name: /Volver a solo íconos/i });
  if (await collapseBtn.isVisible().catch(() => false)) {
    await collapseBtn.click();
  }
  await expect(aside.getByRole("button", { name: /Abrir menú completo/i })).toBeVisible({
    timeout: 5_000,
  });
}

/** Abre todas las secciones del menú: un ítem dentro de una sección cerrada no figura como link. */
export async function openAllNavGroups(page: Page) {
  await ensureSidebarExpanded(page);
  const collapsed = page
    .getByRole("complementary")
    .locator('button[data-nav-group][aria-expanded="false"]');
  for (let n = await collapsed.count(); n > 0; n--) {
    await collapsed.first().click();
  }
  await expect(collapsed).toHaveCount(0);
}

export async function navigateSidebar(page: Page, label: string) {
  await ensureSidebarExpanded(page);
  const aside = page.getByRole("complementary");
  const link = aside.getByRole("link", { name: label, exact: true });
  // Al abrir un grupo deja de matchear el selector: siempre abrir el primero que quede cerrado.
  const collapsed = aside.locator('button[data-nav-group][aria-expanded="false"]');
  for (let n = await collapsed.count(); n > 0; n--) {
    if (await link.isVisible().catch(() => false)) break;
    await collapsed.first().click();
  }
  await link.click();
}

/** Solo E2E: cambia billing del bypass y recarga para remount de LicenseProvider. */
export async function setE2eBilling(
  page: Page,
  billing: "monthly" | "perpetual" | "trial" | "free",
) {
  await tauriInvoke(page, "e2e_set_billing", { billing });
  await page.goto(`${APP_ORIGIN}/?qa=${Date.now()}#/login`, { waitUntil: "load" });
  await waitForE2eBridge(page, 60_000);
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

/** Encabezado de la pantalla actual (título y botones de acción). */
export function pageHeader(page: Page) {
  return page.getByTestId("page-header");
}

export async function openCashSession(page: Page) {
  await navigateSidebar(page, "Caja");
  const opened = page.getByText(/^Turno abierto:/);
  const closed = page.getByText("Sin turno activo");
  await expect(opened.or(closed)).toBeVisible({ timeout: 15_000 });
  if (await closed.isVisible()) {
    await page.getByRole("main").getByRole("button", { name: "Abrir turno" }).click();
    await page.getByLabel("Efectivo de apertura").fill("0");
    await page.getByRole("button", { name: "Confirmar apertura" }).click();
    await expect(opened).toBeVisible({ timeout: 15_000 });
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

/** El Administrador entra directo; otro rol ve el pedido de PIN. */
export async function unlockAdminConfig(page: Page) {
  const pin = page.getByLabel("PIN de administrador");
  const hub = page.getByRole("heading", { name: "Mi comercio" });
  await expect(pin.or(hub)).toBeVisible({ timeout: 15_000 });
  if (await pin.isVisible()) {
    await pin.fill("1234");
    await page.getByRole("button", { name: "Ingresar" }).click();
  }
  await expect(hub).toBeVisible();
}

export async function scanProductInPos(page: Page, barcode: string) {
  await page.getByPlaceholder(/Escaneá|buscá/i).fill(barcode);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
}

/** Abre «Cobrar venta» desde el carrito y devuelve el diálogo. */
export async function openPosCheckout(page: Page) {
  await page.getByRole("button", { name: "Finalizar venta" }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar venta" });
  await expect(pay).toBeVisible();
  return pay;
}

/** Confirma el cobro una sola vez: el botón se traba con la ruedita hasta que termina. */
export async function confirmPosCheckout(page: Page) {
  const pay = page.getByRole("dialog", { name: "Cobrar venta" });
  await pay.getByRole("button", { name: /Confirmar cobro/i }).click();
  await expect(pay).toHaveCount(0, { timeout: 25_000 });
  await expect(page.getByText(/Venta registrada/i).first()).toBeVisible();
}

/** Venta en efectivo (medio por defecto) con lo que haya en el carrito. */
export async function finalizePosSale(page: Page) {
  await openPosCheckout(page);
  await confirmPosCheckout(page);
}
