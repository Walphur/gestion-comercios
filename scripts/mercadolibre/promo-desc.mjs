// Texto de la Promo Cyber (30 días de prueba) en las descripciones de Mercado Libre.
//   node scripts/mercadolibre/promo-desc.mjs            muestra qué cambiaría
//   node scripts/mercadolibre/promo-desc.mjs --apply    pone el texto de la promo
//   node scripts/mercadolibre/promo-desc.mjs --revert --apply   vuelve a los 7 días (lunes 9/11)
import path from "node:path";
import { api, getToken, readJson } from "./auth.mjs";

const NORMAL = "al instalarlo tenés 7 días de prueba con todas las funciones";
const PROMO =
  "si lo instalás hasta el domingo 8 de noviembre tenés 30 días de prueba (después de esa fecha son 7 días) con todas las funciones";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const [from, to] = args.includes("--revert") ? [PROMO, NORMAL] : [NORMAL, PROMO];

const ROOT = path.resolve(import.meta.dirname, "../..");
const published = await readJson(path.join(ROOT, "marketing/mercadolibre/publicadas.json"), {});
const active = Object.entries(published).filter(([s, p]) => !s.endsWith("-replaced") && p.status !== "deleted");
const token = await getToken();

for (const [slug, p] of active) {
  const r = await api(token, "GET", `/items/${p.id}/description`);
  const text = r.data?.plain_text ?? "";
  if (!text.includes(from)) {
    console.log(slug.padEnd(30), text.includes(to) ? "ya estaba" : "NO ENCONTRADA la frase");
    continue;
  }
  if (!apply) {
    console.log(slug.padEnd(30), "se cambiaría");
    continue;
  }
  const u = await api(token, "PUT", `/items/${p.id}/description`, { plain_text: text.replace(from, to) });
  console.log(slug.padEnd(30), u.ok ? "cambiada" : `error ${u.status} ${u.data?.message ?? ""}`);
}
