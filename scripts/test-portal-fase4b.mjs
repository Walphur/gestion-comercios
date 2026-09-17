#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync("npx", ["tsx", "scripts/run-portal-fase4b-tests.ts"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);
