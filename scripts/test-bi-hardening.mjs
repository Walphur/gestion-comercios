#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("\n=== BI Hardening Tests ===\n");

run("npx", ["tsx", "workers/bi-ia/src/selftest.ts"]);
run("npx", ["tsx", "scripts/run-bi-client-selftest.ts"]);
run("npx", ["tsx", "scripts/run-bi-adversarial-tests.ts"]);

console.log("\nBI hardening self-tests PASS\n");
