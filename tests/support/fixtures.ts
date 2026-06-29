import { test as base, chromium, type Page, type Browser, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const RUN_META = path.join(ROOT, "tests", ".e2e-run.json");

type Fixtures = {
  tauriPage: Page;
  tauriBrowser: Browser;
};

export function pickTauriPage(context: BrowserContext): Page | undefined {
  return context.pages().find((p) => {
    const url = p.url();
    return url.includes("localhost:1420") && !url.startsWith("blob:");
  });
}

export async function waitForTauriPage(context: BrowserContext, timeoutMs = 30_000): Promise<Page> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const page = pickTauriPage(context);
    if (page) return page;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No se encontró la página principal de Tauri (localhost:1420) vía CDP.");
}

export const test = base.extend<Fixtures>({
  tauriBrowser: async ({}, use) => {
    const meta = fs.existsSync(RUN_META)
      ? (JSON.parse(fs.readFileSync(RUN_META, "utf8")) as { cdpUrl?: string })
      : {};
    const cdpUrl = meta.cdpUrl ?? process.env.PLAYWRIGHT_CDP_URL ?? "http://127.0.0.1:9222";
    const browser = await chromium.connectOverCDP(cdpUrl);
    await use(browser);
  },

  tauriPage: async ({ tauriBrowser }, use, testInfo) => {
    const context = tauriBrowser.contexts()[0];
    if (!context) throw new Error("Sin contexto CDP de Tauri");
    const page = await waitForTauriPage(context);
    testInfo.annotations.push({ type: "cdp", description: "Tauri WebView2" });
    await use(page);
  },
});

export { expect } from "@playwright/test";
