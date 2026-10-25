type D1Database = any;

export type SellerModel = "pct" | "sixth";

export interface SellerRow {
  code: string;
  name: string;
  phone: string | null;
  model: SellerModel;
  pct: number;
  active: number;
  note: string | null;
  created_at: string;
}

export interface SellerLocal {
  license_key: string;
  client_name: string | null;
  plan: string;
  paying: boolean;
  /** Con el modelo «sixth»: este local es del vendedor (paga entero para él). */
  own: boolean;
  month_paid_ars: number;
}

export interface SellerReport extends SellerRow {
  locales: number;
  paying: number;
  month_collected_ars: number;
  commission_ars: number;
  /** Con «sixth»: cuántos locales pagando faltan para el próximo propio. */
  next_own_in: number | null;
  items: SellerLocal[];
}

export const DEFAULT_SELLER_PCT = 15;

/** Letras y números en mayúscula, de 3 a 16. */
export function normalizeSellerCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length >= 3 && code.length <= 16 ? code : null;
}

export async function findActiveSeller(db: D1Database, code: string): Promise<SellerRow | null> {
  try {
    return (
      (await db
        .prepare("SELECT * FROM sellers WHERE code = ?1 AND active = 1")
        .bind(code)
        .first()) ?? null
    );
  } catch {
    return null;
  }
}

/** Mes «YYYY-MM» en hora de Argentina (UTC-3). Sin mes válido, el actual. */
export function sellerMonthRange(ym: string | null): { start: string; end: string; month: string } {
  let year: number;
  let month: number;
  const m = /^(\d{4})-(\d{2})$/.exec(ym ?? "");
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
  } else {
    const now = new Date(Date.now() - 3 * 3600 * 1000);
    year = now.getUTCFullYear();
    month = now.getUTCMonth() + 1;
  }
  const start = new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 3, 0, 0));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    month: `${year}-${String(month).padStart(2, "0")}`,
  };
}

export async function sellerCodesByLicense(db: D1Database): Promise<Map<string, string>> {
  try {
    const rows = await db
      .prepare("SELECT id, seller_code FROM licenses WHERE seller_code IS NOT NULL")
      .all();
    return new Map(
      ((rows.results ?? []) as { id: string; seller_code: string }[]).map((r) => [r.id, r.seller_code]),
    );
  } catch {
    return new Map();
  }
}

export async function sellerReport(db: D1Database, ym: string | null): Promise<{
  month: string;
  sellers: SellerReport[];
}> {
  const range = sellerMonthRange(ym);
  const sellers = ((await db.prepare("SELECT * FROM sellers ORDER BY created_at").all()).results ??
    []) as SellerRow[];
  const licenses = ((
    await db
      .prepare(
        `SELECT l.id, l.license_key, l.client_name, l.plan, l.seller_code, l.created_at,
                (SELECT MIN(paid_at) FROM license_payments p WHERE p.license_id = l.id) AS first_paid_at,
                (SELECT COALESCE(SUM(amount_ars), 0) FROM license_payments p
                  WHERE p.license_id = l.id AND p.paid_at >= ?1 AND p.paid_at < ?2) AS month_paid
         FROM licenses l WHERE l.seller_code IS NOT NULL`,
      )
      .bind(range.start, range.end)
      .all()
  ).results ?? []) as {
    id: string;
    license_key: string;
    client_name: string | null;
    plan: string;
    seller_code: string;
    created_at: string;
    first_paid_at: string | null;
    month_paid: number;
  }[];

  const report = sellers.map((s): SellerReport => {
    const mine = licenses.filter((l) => l.seller_code === s.code);
    const paying = mine
      .filter((l) => l.first_paid_at)
      .sort((a, b) => String(a.first_paid_at).localeCompare(String(b.first_paid_at)));
    const ownIds = new Set(
      s.model === "sixth" ? paying.filter((_, i) => (i + 1) % 6 === 0).map((l) => l.id) : [],
    );
    const items: SellerLocal[] = mine
      .map((l) => ({
        license_key: l.license_key,
        client_name: l.client_name,
        plan: l.plan,
        paying: !!l.first_paid_at,
        own: ownIds.has(l.id),
        month_paid_ars: Number(l.month_paid) || 0,
      }))
      .sort((a, b) => Number(b.paying) - Number(a.paying) || b.month_paid_ars - a.month_paid_ars);
    const collected = items.reduce((sum, it) => sum + it.month_paid_ars, 0);
    const commission =
      s.model === "sixth"
        ? items.filter((it) => it.own).reduce((sum, it) => sum + it.month_paid_ars, 0)
        : Math.round((collected * (Number(s.pct) || 0)) / 100);
    return {
      ...s,
      locales: mine.length,
      paying: paying.length,
      month_collected_ars: collected,
      commission_ars: commission,
      next_own_in: s.model === "sixth" ? 6 - (paying.length % 6) : null,
      items,
    };
  });
  return { month: range.month, sellers: report };
}

const WEB_SIGNUPS_PER_IP_PER_DAY = 3;

function codeBase(name: string): string {
  const first = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, "")
    .trim()
    .split(/\s+/)[0] ?? "";
  return (first || "WALQO").slice(0, 8).padEnd(3, "X");
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Alta pública desde walqo.pro. El mismo teléfono devuelve el código que ya tenía. */
export async function signupSellerFromWeb(
  db: D1Database,
  body: { name?: string; phone?: string; model?: string },
  ip: string,
): Promise<{ ok: true; code: string; name: string; existing: boolean } | { ok: false; message: string; status: number }> {
  const name = (body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const phone = (body.phone ?? "").replace(/\D/g, "");
  if (name.length < 3) return { ok: false, message: "Poné tu nombre y apellido.", status: 400 };
  if (phone.length < 8 || phone.length > 15) {
    return { ok: false, message: "Poné tu WhatsApp con característica, sin 0 ni 15.", status: 400 };
  }

  const existing = (await db
    .prepare("SELECT code FROM sellers WHERE phone = ?1 LIMIT 1")
    .bind(phone)
    .first()) as { code: string } | null;
  if (existing) return { ok: true, code: existing.code, name, existing: true };

  const ipHash = await sha256Hex(`walqo-seller:${ip}`);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const recent = (await db
    .prepare("SELECT COUNT(*) AS n FROM sellers WHERE ip_hash = ?1 AND created_at >= ?2")
    .bind(ipHash, since)
    .first()) as { n: number } | null;
  if ((recent?.n ?? 0) >= WEB_SIGNUPS_PER_IP_PER_DAY) {
    return { ok: false, message: "Ya se generaron varios códigos desde acá hoy. Probá mañana o escribinos por WhatsApp.", status: 429 };
  }

  const model: SellerModel = body.model === "sixth" ? "sixth" : "pct";
  const base = codeBase(name);
  for (let i = 0; i < 8; i++) {
    const code = `${base}${Math.floor(10 + Math.random() * 90)}`;
    const res = await db
      .prepare(
        `INSERT INTO sellers (code, name, phone, model, pct, active, note, created_at, source, ip_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, NULL, ?6, 'web', ?7)
         ON CONFLICT(code) DO NOTHING`,
      )
      .bind(code, name, phone, model, DEFAULT_SELLER_PCT, new Date().toISOString(), ipHash)
      .run();
    if (res.meta?.changes) return { ok: true, code, name, existing: false };
  }
  return { ok: false, message: "No se pudo generar el código. Probá de nuevo.", status: 500 };
}

export async function saveSeller(
  db: D1Database,
  body: {
    code?: string;
    name?: string;
    phone?: string;
    model?: string;
    pct?: number;
    active?: boolean;
    note?: string;
  },
): Promise<{ ok: true; seller: SellerRow } | { ok: false; message: string }> {
  const code = normalizeSellerCode(body.code);
  if (!code) return { ok: false, message: "El código va con letras y números, de 3 a 16." };
  const name = (body.name ?? "").trim();
  if (name.length < 2) return { ok: false, message: "Poné el nombre del vendedor." };
  const model: SellerModel = body.model === "sixth" ? "sixth" : "pct";
  const pct = Number(body.pct ?? DEFAULT_SELLER_PCT);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return { ok: false, message: "El porcentaje va de 0 a 100." };
  }
  await db
    .prepare(
      `INSERT INTO sellers (code, name, phone, model, pct, active, note, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(code) DO UPDATE SET name = ?2, phone = ?3, model = ?4, pct = ?5, active = ?6, note = ?7`,
    )
    .bind(
      code,
      name,
      (body.phone ?? "").trim() || null,
      model,
      pct,
      body.active === false ? 0 : 1,
      (body.note ?? "").trim() || null,
      new Date().toISOString(),
    )
    .run();
  const seller = (await db.prepare("SELECT * FROM sellers WHERE code = ?1").bind(code).first()) as SellerRow;
  return { ok: true, seller };
}
