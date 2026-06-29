import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const RUN_META = path.join(ROOT, "tests", ".e2e-run.json");

export default async function globalTeardown() {
  const proc = (globalThis as { __TAURI_E2E_PROC__?: ChildProcessWithoutNullStreams })
    .__TAURI_E2E_PROC__;
  if (proc && !proc.killed) {
    if (process.platform === "win32" && proc.pid) {
      spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { shell: true });
    } else {
      proc.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 2000));
      if (!proc.killed) proc.kill("SIGKILL");
    }
  }

  if (fs.existsSync(RUN_META)) {
    try {
      const meta = JSON.parse(fs.readFileSync(RUN_META, "utf8")) as { e2eDataDir?: string };
      fs.appendFileSync(
        path.join(ROOT, "tests", "reports", "teardown.log"),
        `E2E data dir: ${meta.e2eDataDir ?? "?"}\n`,
      );
    } catch {
      /* ignore */
    }
  }
}
