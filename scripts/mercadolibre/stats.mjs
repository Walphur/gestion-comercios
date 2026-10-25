/**
 * Visitas, preguntas y ventas de cada publicación de marketing/mercadolibre/publicadas.json.
 *
 *   node scripts/mercadolibre/stats.mjs            resumen por rubro
 *   node scripts/mercadolibre/stats.mjs --save     además guarda marketing/mercadolibre/stats/AAAA-MM-DD.json
 *
 * No guarda datos de compradores: solo cantidades por publicación.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { api, getToken, readCredentials, readJson } from "./auth.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const DAY = 86_400_000;

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

async function windowVisits(token, id, days) {
  const r = await api(token, "GET", `/items/${id}/visits/time_window?last=${days}&unit=day`);
  return r.ok ? Number(r.data?.total_visits ?? 0) : null;
}

async function totalVisits(token, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const r = await api(token, "GET", `/visits/items?ids=${chunk.join(",")}`);
    if (r.ok && r.data && typeof r.data === "object") Object.assign(out, r.data);
  }
  return out;
}

async function allPages(token, url, key, max = 500) {
  const list = [];
  let offset = 0;
  while (offset < max) {
    const sep = url.includes("?") ? "&" : "?";
    const r = await api(token, "GET", `${url}${sep}limit=50&offset=${offset}`);
    if (!r.ok) return { list, error: r.status };
    const page = r.data?.[key] ?? [];
    list.push(...page);
    const total = Number(r.data?.paging?.total ?? r.data?.total ?? page.length);
    offset += 50;
    if (!page.length || offset >= total) break;
  }
  return { list, error: null };
}

async function categoryRank(token, ids) {
  const r = await api(token, "GET", "/highlights/MLA/category/MLA1728");
  if (!r.ok) return { available: false, status: r.status };
  const content = r.data?.content ?? [];
  const ranks = {};
  content.forEach((c, i) => {
    if (ids.includes(c.id)) ranks[c.id] = i + 1;
  });
  return { available: true, size: content.length, ranks };
}

async function adsProbe(token) {
  const r = await api(token, "GET", "/advertising/advertisers?product_id=PADS", null, { "Api-Version": "1" });
  const advertisers = r.data?.advertisers ?? [];
  return { status: r.status, ok: r.ok, advertisers: advertisers.length, message: r.ok ? null : r.data?.message ?? null };
}

function verdict(row) {
  if (row.sales > 0) return "vende";
  if (row.questions > 0) return "consultan";
  const perDay = row.visits_total / Math.max(1, row.days_live);
  if (perDay >= 10) return "muchas visitas, sin consultas";
  if (perDay >= 3) return "anda";
  if (row.visits_total > 0) return "pocas visitas";
  return "sin visitas";
}

async function main() {
  const published = await readJson(path.join(ROOT, "marketing/mercadolibre/publicadas.json"), {});
  const { items: catalog } = await readJson(path.join(ROOT, "marketing/mercadolibre/publicaciones.json"), { items: [] });
  const active = Object.entries(published).filter(([slug, p]) => !slug.endsWith("-replaced") && p.status !== "deleted");
  const ids = active.map(([, p]) => p.id);
  const token = await getToken();
  const { user_id: sellerId } = await readCredentials();

  const totals = await totalVisits(token, ids);
  const { list: questions, error: qErr } = await allPages(
    token,
    `/questions/search?seller_id=${sellerId}&api_version=4`,
    "questions",
  );
  const { list: orders, error: oErr } = await allPages(token, `/orders/search?seller=${sellerId}&sort=date_desc`, "results");
  const rank = await categoryRank(token, ids);
  const ads = await adsProbe(token);

  const rows = [];
  for (const [slug, p] of active) {
    const live = await api(token, "GET", `/items/${p.id}?attributes=status,price,sold_quantity,date_created`);
    const created = Date.parse(live.data?.date_created ?? p.published_at);
    const q = questions.filter((x) => x.item_id === p.id);
    const sold = orders
      .filter((o) => o.status === "paid" && (o.order_items ?? []).some((it) => it.item?.id === p.id))
      .reduce((n, o) => n + (o.order_items ?? []).filter((it) => it.item?.id === p.id).reduce((s, it) => s + it.quantity, 0), 0);
    const row = {
      slug,
      id: p.id,
      plan: catalog.find((c) => c.slug === slug)?.plan ?? null,
      status: live.data?.status ?? p.status,
      price: live.data?.price ?? p.price,
      days_live: Math.max(1, Math.round((Date.now() - created) / DAY)),
      visits_7d: await windowVisits(token, p.id, 7),
      visits_30d: await windowVisits(token, p.id, 30),
      visits_total: 0,
      questions: q.length,
      questions_unanswered: q.filter((x) => x.status === "UNANSWERED").length,
      sales: sold,
      category_rank: rank.ranks?.[p.id] ?? null,
    };
    // /visits/items llega con demora: nunca menos que la ventana de 30 días.
    row.visits_total = Math.max(Number(totals[p.id] ?? 0), row.visits_30d ?? 0);
    row.verdict = verdict(row);
    rows.push(row);
  }
  rows.sort((a, b) => b.sales - a.sales || b.questions - a.questions || b.visits_total - a.visits_total);

  console.log(`Publicaciones activas: ${rows.length}  ·  ${isoDay(Date.now())}`);
  console.log("rubro".padEnd(30), "7d".padStart(5), "30d".padStart(5), "total".padStart(6), "preg".padStart(5), "ventas".padStart(7), "  estado");
  for (const r of rows) {
    console.log(
      r.slug.padEnd(30),
      String(r.visits_7d ?? "?").padStart(5),
      String(r.visits_30d ?? "?").padStart(5),
      String(r.visits_total).padStart(6),
      String(r.questions).padStart(5),
      String(r.sales).padStart(7),
      ` ${r.verdict}${r.status === "active" ? "" : ` (${r.status})`}`,
    );
  }
  const sum = (k) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
  console.log(`Total: ${sum("visits_total")} visitas, ${sum("questions")} preguntas, ${sum("sales")} ventas.`);
  if (qErr) console.log(`(preguntas: la API respondió ${qErr})`);
  if (oErr) console.log(`(ventas: la API respondió ${oErr})`);
  console.log(
    rank.available
      ? `Más vendidos de la categoría: ${Object.keys(rank.ranks).length ? JSON.stringify(rank.ranks) : `ninguna en el top ${rank.size}`}.`
      : `Más vendidos de la categoría: no disponible (${rank.status}).`,
  );
  console.log(
    ads.ok
      ? `Publicidad (Product Ads): cuenta de anunciante ${ads.advertisers ? "encontrada" : "no creada"}.`
      : `Publicidad (Product Ads): sin acceso por API (${ads.status}${ads.message ? `: ${ads.message}` : ""}).`,
  );

  if (args.includes("--save")) {
    const dir = path.join(ROOT, "marketing/mercadolibre/stats");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${isoDay(Date.now())}.json`);
    await writeFile(file, JSON.stringify({ date: new Date().toISOString(), rows, category_rank: rank, ads }, null, 2) + "\n", "utf8");
    console.log(`Guardado en ${path.relative(ROOT, file)}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
