import {
  test as base,
  chromium,
  type Page,
  type Browser,
  type BrowserContext,
} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { resetTestEnvironment } from "./reset";
import { pickTauriPage, waitForTauriPage } from "./tauri-page";

export { pickTauriPage, waitForTauriPage };

const ROOT = path.resolve(import.meta.dirname, "../..");
const RUN_META = path.join(ROOT, "tests", ".e2e-run.json");

export type QaTestContext = {
  consoleErrors: string[];
  pageErrors: string[];
};

type Fixtures = {
  tauriPage: Page;
  tauriBrowser: Browser;
  qa: QaTestContext;
};

function attachRuntimeMonitors(page: Page, qa: QaTestContext) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("Download the React DevTools")) {
        qa.consoleErrors.push(text);
      }
    }
  });
  page.on("pageerror", (err) => {
    qa.pageErrors.push(err.message);
  });
}

export const test = base.extend<Fixtures>({
  tauriBrowser: [
    async ({}, use) => {
      const meta = fs.existsSync(RUN_META)
        ? (JSON.parse(fs.readFileSync(RUN_META, "utf8")) as { cdpUrl?: string })
        : {};
      const cdpUrl = meta.cdpUrl ?? process.env.PLAYWRIGHT_CDP_URL ?? "http://127.0.0.1:9222";
      const browser = await chromium.connectOverCDP(cdpUrl);
      await use(browser);
    },
    { scope: "worker" },
  ],

  qa: async ({}, use) => {
    await use({ consoleErrors: [], pageErrors: [] });
  },

  tauriPage: [
    async ({ tauriBrowser, qa }, use, testInfo) => {
      const context = tauriBrowser.contexts()[0];
      if (!context) throw new Error("Sin contexto CDP de Tauri");

      const page = await resetTestEnvironment(context);
      attachRuntimeMonitors(page, qa);

      testInfo.annotations.push({
        type: "qa-reset",
        description: "BD + storage + UI en estado limpio",
      });

      await use(page);

      if (process.env.QA_STRICT_CONSOLE === "1" && qa.consoleErrors.length > 0) {
        throw new Error(`Errores de consola: ${qa.consoleErrors.join(" | ")}`);
      }
      if (process.env.QA_STRICT_CONSOLE === "1" && qa.pageErrors.length > 0) {
        throw new Error(`Errores de página: ${qa.pageErrors.join(" | ")}`);
      }
    },
    { scope: "test" },
  ],
});

export { expect } from "@playwright/test";
