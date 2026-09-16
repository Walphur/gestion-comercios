import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const token = readFileSync(join(dir, "portal-session.token"), "utf8").trim();
const js = `localStorage.setItem(${JSON.stringify("walqo_portal_token")}, ${JSON.stringify(token)}); location.href=${JSON.stringify("/app/")};`;
writeFileSync(join(dir, "inject-token.js"), js, "utf8");
// Also a tiny HTML under docs so we can open it via the static server
writeFileSync(
  join(dir, "..", "docs", "_fase2_inject.html"),
  `<!doctype html><meta charset="utf-8"><title>inject</title><script src="/../.tmp/inject-token.js"></script><script>${js}</script>`,
  "utf8",
);
console.log("ready", token.length);
