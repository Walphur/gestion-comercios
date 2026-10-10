import { chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const task = process.argv[2];
if (!task || !/^[A-Za-z][A-Za-z0-9]*$/.test(task)) {
  console.error("Tarea de Gradle inválida");
  process.exit(1);
}

const androidDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "android");
const windows = process.platform === "win32";

if (!windows) chmodSync(path.join(androidDir, "gradlew"), 0o755);

const command = windows ? "gradlew.bat" : "./gradlew";
const result = spawnSync(command, [task], {
  cwd: androidDir,
  stdio: "inherit",
  shell: windows,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status === 0 ? 0 : result.status || 1);
