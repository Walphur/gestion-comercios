#!/usr/bin/env node
/**
 * Ejecuta la suite E2E N veces consecutivas (objetivo: 20/20).
 * Aborta en el primer fallo.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNS = Number(process.env.QA_RUNS ?? "20");
const REPORTS = path.join(ROOT, "tests", "reports");

const log = [];
let failedAt = 0;

console.log(`\n=== WalTech QA × ${RUNS} corridas ===\n`);

for (let i = 1; i <= RUNS; i++) {
  const started = Date.now();
  console.log(`\n--- Corrida ${i}/${RUNS} ---`);
  const r = spawnSync("npm", ["run", "qa"], {
    cwd: ROOT,
    env: { ...process.env, GESTION_E2E: "1", GESTION_LICENSE_DEV: "1", SKIP_CARGO_BUILD: "1" },
    shell: true,
    stdio: "inherit",
  });
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  const ok = r.status === 0;
  log.push({ run: i, ok, seconds: sec, exit: r.status ?? 1 });
  if (!ok) {
    failedAt = i;
    break;
  }
}

const summaryPath = path.join(REPORTS, "QA-REPEAT-SUMMARY.md");
const passed = log.filter((x) => x.ok).length;
const lines = [
  `# QA repetición — ${passed}/${RUNS}`,
  ``,
  `Fecha: ${new Date().toISOString()}`,
  failedAt ? `**Falló en corrida ${failedAt}**` : `**${RUNS}/${RUNS} exitosas**`,
  ``,
  ...log.map((x) => `- Corrida ${x.run}: ${x.ok ? "OK" : "FALLO"} (${x.seconds}s)`),
];
fs.mkdirSync(REPORTS, { recursive: true });
fs.writeFileSync(summaryPath, lines.join("\n"), "utf8");

console.log(`\nResumen: ${summaryPath}`);
console.log(`Resultado: ${passed}/${RUNS} corridas OK\n`);

process.exit(failedAt ? 1 : 0);
