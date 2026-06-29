import { expect, type BrowserContext, type Page } from "@playwright/test";
import { APP_ORIGIN, tauriInvoke, waitForE2eBridge } from "./helpers";
import { pickTauriPage, waitForTauriPage } from "./tauri-page";

async function livePage(context: BrowserContext): Promise<Page> {
  const current = pickTauriPage(context);
  if (current && !current.isClosed()) return current;
  return waitForTauriPage(context, 60_000);
}

/** Cierra conexiones JS, storage del WebView y restaura BD desde plantilla QA. */
export async function resetTestEnvironment(context: BrowserContext): Promise<Page> {
  let page = await livePage(context);

  await waitForE2eBridge(page);
  await page.evaluate(async () => {
    const bridge = window.__GESTION_E2E__;
    if (bridge) {
      await bridge.closeDb();
      bridge.clearStorage();
    }
  });

  page = await livePage(context);
  await tauriInvoke(page, "e2e_reset_environment");

  const freshUrl = `${APP_ORIGIN}/?qa=${Date.now()}#/login`;
  try {
    await page.goto(freshUrl, { waitUntil: "load", timeout: 30_000 });
  } catch {
    /* el target CDP puede cerrarse al recargar */
  }

  page = await waitForTauriPage(context, 60_000);
  await waitForE2eBridge(page, 60_000);

  await expect(page.getByLabel("PIN")).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: /Cajero|Administrador/i }).first(),
  ).toBeVisible({ timeout: 20_000 });

  return page;
}

/** Crea la plantilla de BD limpia (global setup, una vez por corrida). */
export async function ensureBaselineTemplate(page: Page): Promise<void> {
  await tauriInvoke<string>(page, "e2e_ensure_baseline_template");
}
