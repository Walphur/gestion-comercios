import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { waitForTauriPage } from "./tauri-page";
import { ensureBaselineTemplate } from "./reset";
import { waitForE2eBridge } from "./helpers";

const ROOT = path.resolve(import.meta.dirname, "../..");
const RUN_META = path.join(ROOT, "tests", ".e2e-run.json");
const LOG_FILE = path.join(ROOT, "tests", "reports", "tauri-dev.log");

let tauriProc: ChildProcessWithoutNullStreams | null = null;

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timeout esperando ${url} (${timeoutMs}ms)`);
}

function buildE2eEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GESTION_E2E: "1",
    GESTION_LICENSE_DEV: "1",
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9222",
  };
}

function prebuildTauri(env: NodeJS.ProcessEnv) {
  const manifest = path.join(ROOT, "src-tauri", "Cargo.toml");
  const marker = path.join(ROOT, "src-tauri", "target", "debug", "tauri-app.exe");
  if (fs.existsSync(marker)) {
    return;
  }
  const log = path.join(ROOT, "tests", "reports", "cargo-prebuild.log");
  const out = spawnSync(
    "cargo",
    ["build", "--manifest-path", manifest],
    { cwd: ROOT, env, shell: true, encoding: "utf8" },
  );
  fs.writeFileSync(log, `${out.stdout ?? ""}\n${out.stderr ?? ""}`, "utf8");
  if (out.status !== 0) {
    throw new Error(`cargo build falló (ver tests/reports/cargo-prebuild.log)`);
  }
}

export default async function globalSetup() {
  fs.mkdirSync(path.join(ROOT, "tests", "reports"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "tests", "results"), { recursive: true });

  const env = buildE2eEnv();
  prebuildTauri(env);

  const logStream = fs.createWriteStream(LOG_FILE, { flags: "w" });
  tauriProc = spawn("npm", ["run", "tauri", "dev", "--", "--no-watch", "--config", "src-tauri/tauri.conf.e2e.json"], {
    cwd: ROOT,
    env,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  tauriProc.stdout?.pipe(logStream);
  tauriProc.stderr?.pipe(logStream);

  (globalThis as { __TAURI_E2E_PROC__?: ChildProcessWithoutNullStreams }).__TAURI_E2E_PROC__ =
    tauriProc;

  await waitForHttp("http://localhost:1420", 120_000);
  await waitForHttp("http://127.0.0.1:9222/json/version", 600_000);

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  if (!context) throw new Error("Sin contexto CDP al iniciar Tauri.");
  const page = await waitForTauriPage(context, 60_000);
  await waitForE2eBridge(page, 60_000);
  await ensureBaselineTemplate(page);
  await browser.close();

  fs.writeFileSync(
    RUN_META,
    JSON.stringify(
      {
        cdpUrl: "http://127.0.0.1:9222",
        startedAt: new Date().toISOString(),
        logFile: LOG_FILE,
        e2eIdentifier: "com.gestioncomercios.app.e2e",
      },
      null,
      2,
    ),
  );

  process.env.PLAYWRIGHT_CDP_URL = "http://127.0.0.1:9222";
}
