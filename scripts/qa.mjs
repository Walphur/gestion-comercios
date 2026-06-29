#!/usr/bin/env node
/**
 * Modo QA WalTech — un comando para validar antes de publicar.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS = path.join(ROOT, "tests", "reports");

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    shell: true,
    stdio: "inherit",
    encoding: "utf8",
  });
  return r.status ?? 1;
}

console.log("\n╔══════════════════════════════════════╗");
console.log("║       WalTech — Modo QA              ║");
console.log("╚══════════════════════════════════════╝\n");

fs.mkdirSync(REPORTS, { recursive: true });
fs.mkdirSync(path.join(ROOT, "tests", "results"), { recursive: true });

if (process.env.SKIP_CARGO_BUILD !== "1") {
  const prebuild = run("cargo", ["build", "--manifest-path", "src-tauri/Cargo.toml"]);
  if (prebuild !== 0) process.exit(prebuild);
}

const strict = process.env.QA_STRICT_CONSOLE === "1" ? "1" : "0";
const code = run("npx", ["playwright", "test", "--project=tauri-e2e"], {
  GESTION_E2E: "1",
  GESTION_LICENSE_DEV: "1",
  QA_STRICT_CONSOLE: strict,
});

const metaPath = path.join(REPORTS, "run-meta.json");
const informe = path.join(REPORTS, "INFORME-E2E.md");
const html = path.join(REPORTS, "html", "index.html");

let meta = { total: 0, passed: 0, failed: 0, durationMs: 0, status: "unknown" };
if (fs.existsSync(metaPath)) {
  meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
}

console.log("\n══════════════════════════════════════");
console.log(code === 0 ? "  RESULTADO: APROBADO" : "  RESULTADO: FALLÓ");
console.log("══════════════════════════════════════");
console.log(`  Tests ejecutados : ${meta.total}`);
console.log(`  Aprobados        : ${meta.passed}`);
console.log(`  Fallos           : ${meta.failed}`);
console.log(`  Duración         : ${((meta.durationMs ?? 0) / 1000).toFixed(1)}s`);
console.log(`  Reporte HTML     : ${html}`);
if (code === 0) {
  console.log("\n  ✔ Suite E2E OK");
  console.log("  ✔ SQLite (integrity en tests de módulo)");
  console.log("  ✔ Reporte generado");
}
console.log("══════════════════════════════════════\n");

process.exit(code);
