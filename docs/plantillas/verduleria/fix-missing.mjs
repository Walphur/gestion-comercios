/**
 * Completa fotos faltantes: busca en Commons API y baja con pausa + reintentos.
 */
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const __dir = dirname(fileURLToPath(import.meta.url));
const IMG_DIR = join(__dir, "imagenes");
const CSV = join(__dir, "productos-verduleria-walqo.csv");
const UA = "WalQoCatalogBuilder/1.0 (demo plantilla verduleria; https://walqo.pro)";

const SEARCH = {
  106: "grapefruit fruit",
  110: "table grapes bunch",
  111: "strawberry fruit",
  115: "cantaloupe melon",
  118: "mango fruit",
  122: "raspberry fruit",
  124: "fig fruit",
  126: "coconut fruit",
  127: "passion fruit",
  128: "lime fruit citrus",
  131: "tomato red fruit",
  132: "roma tomato",
  133: "onion bulb",
  135: "garlic bulb",
  137: "butternut squash",
  138: "kabocha squash",
  143: "yellow bell pepper",
  144: "cucumber vegetable",
  147: "corn cob maize",
  148: "lettuce iceberg",
  149: "lettuce leaf",
  150: "arugula rocket",
  151: "swiss chard",
  152: "spinach leaves",
  153: "white cabbage",
  154: "cauliflower",
  155: "broccoli",
  156: "beetroot",
  157: "radish",
  158: "celery stalks",
  159: "fennel bulb",
  160: "artichoke",
  161: "asparagus",
  162: "white mushroom",
  163: "portobello mushroom",
  164: "chicory",
  165: "endive",
  166: "watercress",
  167: "kale",
  168: "brussels sprouts",
  169: "leek vegetable",
  170: "turnip",
  171: "parsley herb",
  172: "coriander cilantro",
  173: "basil herb",
  174: "oregano herb",
  175: "mint leaves",
  176: "rosemary herb",
  177: "thyme herb",
  178: "bay laurel leaves",
  179: "chives",
  180: "dill herb",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function commonsSearch(query) {
  const url =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `filetype:bitmap ${query}`,
      gsrlimit: "8",
      gsrnamespace: "6",
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: "800",
    });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429) throw Object.assign(new Error("rate"), { rate: true });
  if (!res.ok) throw new Error(`search HTTP ${res.status}`);
  const data = await res.json();
  const pages = Object.values(data.query?.pages || {});
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const mime = (info.mime || "").toLowerCase();
    if (!mime.startsWith("image/")) continue;
    if ((info.size || 0) < 5000) continue;
    const fileUrl = info.thumburl || info.url;
    const title = (p.title || "").replace(/^File:/i, "");
    if (fileUrl) return { fileUrl, title, mime };
  }
  return null;
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (res.status === 429) throw Object.assign(new Error("rate"), { rate: true });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function wikiFilePath(title) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}?width=800`;
}

async function main() {
  await mkdir(IMG_DIR, { recursive: true });
  const codes = Object.keys(SEARCH)
    .map(Number)
    .filter((c) => !existsSync(join(IMG_DIR, `${c}.jpg`)))
    .sort((a, b) => a - b);

  console.log(`Faltan ${codes.length} fotos`);
  const urlByCode = new Map();

  for (const code of codes) {
    const q = SEARCH[code];
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        process.stdout.write(`${code} «${q}»… `);
        const hit = await commonsSearch(q);
        if (!hit) {
          console.log("sin resultado");
          break;
        }
        const dest = join(IMG_DIR, `${code}.jpg`);
        await download(hit.fileUrl, dest);
        urlByCode.set(code, wikiFilePath(hit.title));
        console.log(`ok ← ${hit.title}`);
        await sleep(1200);
        break;
      } catch (e) {
        if (e.rate || /rate/i.test(String(e.message))) {
          const wait = 8000 * attempt;
          console.log(`rate-limit, espero ${wait}ms`);
          await sleep(wait);
          if (attempt < 6) continue;
        }
        console.log(`FALLÓ: ${e.message || e}`);
        break;
      }
    }
  }

  // Actualizar CSV: reemplazar URLs de códigos que resolvimos vía API
  if (urlByCode.size) {
    const text = await readFile(CSV, "utf8");
    const lines = text.trimEnd().split(/\r?\n/);
    const out = lines.map((line, idx) => {
      if (idx === 0) return line;
      const parts = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQ = !inQ;
          cur += ch;
          continue;
        }
        if (ch === "," && !inQ) {
          parts.push(cur);
          cur = "";
          continue;
        }
        cur += ch;
      }
      parts.push(cur);
      const code = Number(parts[0]);
      if (urlByCode.has(code)) {
        parts[parts.length - 1] = urlByCode.get(code);
        return parts.join(",");
      }
      return line;
    });
    await writeFile(CSV, out.join("\n") + "\n", "utf8");
    console.log(`CSV actualizado (${urlByCode.size} URLs nuevas)`);
  }

  const have = codes.filter((c) => existsSync(join(IMG_DIR, `${c}.jpg`))).length;
  console.log(`Descargas nuevas ok en esta pasada: ${have}/${codes.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
