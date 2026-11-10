// Build web (vite --mode web): cuando la interfaz importa un módulo de src/db, recibe uno
// que tiene las mismas constantes pero cuyas funciones async corren en el servidor
// (workers/walqo-web). Entre módulos de src/db se siguen importando los originales.
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const PREFIX = "\0walqo-db:";

/** Funciones async que usan localStorage del aparato: corren en el navegador. */
const BROWSER_ONLY = {
  cash: ["syncCashSessionStorage"],
};

/** Archivos de src/db que la interfaz usa tal cual (conexión y transacción). */
const PASS_THROUGH = new Set(["index", "tx"]);

/** Módulos de la interfaz que en la web tienen su propia versión en src/web. */
const WEB_REPLACEMENTS = {
  "src/lib/accountAuth.ts": "src/web/accountAuth.ts",
  "src/lib/productImages.ts": "src/web/productImages.ts",
};

function remoteFunctionNames(source, moduleKey) {
  const names = new Set();
  for (const m of source.matchAll(/^export\s+async\s+function\s*\*?\s*([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*async\b/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^export\s+function\s+([A-Za-z0-9_$]+)/gm)) {
    const rest = source.slice(m.index);
    const end = rest.search(/\{\r?\n/);
    const signature = end >= 0 ? rest.slice(0, end) : rest.split(/\r?\n/, 1)[0];
    if (/\)\s*:\s*Promise</.test(signature)) names.add(m[1]);
  }
  for (const local of BROWSER_ONLY[moduleKey] ?? []) names.delete(local);
  return [...names];
}

export default function walqoDbRpc({ root }) {
  const dbDir = resolve(root, "src/db");
  const rpcPath = resolve(root, "src/web/rpc.ts").replace(/\\/g, "/");
  const replacements = new Map(
    Object.entries(WEB_REPLACEMENTS).map(([from, to]) => [resolve(root, from), resolve(root, to)]),
  );

  return {
    name: "walqo-db-rpc",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || importer.startsWith(PREFIX)) return null;
      const cleanImporter = resolve(importer.split("?")[0]);
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external) return null;
      const file = resolve(resolved.id.split("?")[0]);
      const replacement = replacements.get(file);
      if (replacement && cleanImporter !== replacement) return replacement;
      if (cleanImporter.startsWith(dbDir)) return null;
      if (!file.startsWith(dbDir) || !file.endsWith(".ts")) return null;
      const key = relative(dbDir, file).replace(/\\/g, "/").replace(/\.ts$/, "");
      if (PASS_THROUGH.has(key)) return null;
      return PREFIX + file;
    },
    load(id) {
      if (!id.startsWith(PREFIX)) return null;
      const file = id.slice(PREFIX.length);
      const key = relative(dbDir, file).replace(/\\/g, "/").replace(/\.ts$/, "");
      const realPath = file.replace(/\\/g, "/");
      const names = remoteFunctionNames(readFileSync(file, "utf8"), key);
      return [
        `import { rpcFunction } from ${JSON.stringify(rpcPath)};`,
        `import * as real from ${JSON.stringify(realPath)};`,
        `export * from ${JSON.stringify(realPath)};`,
        ...names.map(
          (name) => `export const ${name} = rpcFunction(${JSON.stringify(key)}, ${JSON.stringify(name)}, real);`,
        ),
      ].join("\n");
    },
  };
}
