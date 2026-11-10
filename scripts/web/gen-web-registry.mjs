// Genera para workers/walqo-web la lista de módulos de src/db y las migraciones
// en el mismo orden que src-tauri/src/lib.rs.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dbDir = join(root, "src/db");
const outDir = join(root, "workers/walqo-web/src/generated");
mkdirSync(outDir, { recursive: true });

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.ts$/.test(name) && !/\.selftest\.ts$/.test(name) ? [full] : [];
  });
}

const modules = walk(dbDir)
  .map((file) => relative(dbDir, file).replace(/\\/g, "/").replace(/\.ts$/, ""))
  .filter((key) => key !== "index" && key !== "tx")
  .sort();

const ident = (key) => "m_" + key.replace(/[^a-zA-Z0-9]/g, "_");
const dbLines = [
  "// Generado por scripts/web/gen-web-registry.mjs. No editar.",
  ...modules.map((key) => `import * as ${ident(key)} from "../../../../src/db/${key}";`),
  "",
  "export const DB_MODULES: Record<string, Record<string, unknown>> = {",
  ...modules.map((key) => `  ${JSON.stringify(key)}: ${ident(key)},`),
  "};",
  "",
];
writeFileSync(join(outDir, "dbModules.ts"), dbLines.join("\n"));

const libRs = readFileSync(join(root, "src-tauri/src/lib.rs"), "utf8");
const migrationRe = /version:\s*(\d+),[\s\S]*?include_str!\("\.\.\/migrations\/([^"]+)"\)/g;
const migrations = [];
for (const match of libRs.matchAll(migrationRe)) {
  migrations.push({ version: Number(match[1]), file: match[2] });
}
const migrationLines = [
  "// Generado por scripts/web/gen-web-registry.mjs. No editar.",
  ...migrations.map((m) => `import m${m.version} from "../../../../src-tauri/migrations/${m.file}";`),
  "",
  "export const MIGRATIONS: { version: number; sql: string }[] = [",
  ...migrations.map((m) => `  { version: ${m.version}, sql: m${m.version} },`),
  "];",
  "",
];
writeFileSync(join(outDir, "migrations.ts"), migrationLines.join("\n"));

console.log(`walqo-web: ${modules.length} módulos de src/db, ${migrations.length} migraciones`);
