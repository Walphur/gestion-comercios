// Copia dist-web a docs/web: GitHub Pages lo sirve en walqo.pro/web/ al hacer push a main.
import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const from = resolve(root, "dist-web");
const to = resolve(root, "docs", "web");

if (!existsSync(resolve(from, "index.html"))) {
  console.error("Falta dist-web: corré antes `npm run build:web`.");
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log("WalQo Web copiado a docs/web (walqo.pro/web/).");
