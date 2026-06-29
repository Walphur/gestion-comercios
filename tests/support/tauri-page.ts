import { type BrowserContext, type Page } from "@playwright/test";

export function pickTauriPage(context: BrowserContext): Page | undefined {
  return context.pages().find((p) => {
    const url = p.url();
    return url.includes("localhost:1420") && !url.startsWith("blob:");
  });
}

export async function waitForTauriPage(
  context: BrowserContext,
  timeoutMs = 30_000,
): Promise<Page> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const page = pickTauriPage(context);
    if (page) return page;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No se encontró la página principal de Tauri (localhost:1420) vía CDP.");
}
