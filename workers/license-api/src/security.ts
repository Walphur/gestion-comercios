/**
 * Límites de intentos y registro del panel. Las tablas son de schema-migration-v28:
 * si todavía no existen, nada se bloquea y nada se registra (el servicio sigue andando).
 */

type D1Database = any;

interface SecurityEnv {
  DB: D1Database;
}

/** Comparación en tiempo constante (sin cortar en el primer carácter distinto). */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * IP de quien pide. WalQo Web llama desde su servidor: ahí la IP del usuario viene en
 * x-walqo-client-ip y solo vale con el secreto del servicio.
 */
export function clientIp(req: Request, env?: { WEB_SERVICE_SECRET?: string }): string {
  const secret = env?.WEB_SERVICE_SECRET?.trim();
  const forwarded = (req.headers.get("x-walqo-client-ip") || "").trim();
  if (secret && forwarded && timingSafeEqual(req.headers.get("x-walqo-web-secret") || "", secret)) {
    return forwarded.slice(0, 64);
  }
  return (req.headers.get("CF-Connecting-IP") || "").trim() || "unknown";
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** Suma un intento a `key`. Devuelve true si con este se pasó de `max` en la ventana. */
export async function hitLimit(env: SecurityEnv, key: string, max: number, windowSec: number): Promise<boolean> {
  // Sin IP conocida (llamadas internas) no se suma: todas caerían en el mismo cupo.
  if (key.endsWith(":unknown")) return false;
  try {
    const now = nowSec();
    const row = await env.DB.prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start <= ?2 - ?3 THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start <= ?2 - ?3 THEN ?2 ELSE rate_limits.window_start END
       RETURNING count`,
    )
      .bind(key, now, windowSec)
      .first() as { count: number } | null;
    return Number(row?.count ?? 0) > max;
  } catch {
    return false;
  }
}

/** ¿`key` ya llegó a `max` intentos en la ventana? No suma. */
export async function isLimited(env: SecurityEnv, key: string, max: number, windowSec: number): Promise<boolean> {
  if (key.endsWith(":unknown")) return false;
  try {
    const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE key = ?1 AND window_start > ?2")
      .bind(key, nowSec() - windowSec)
      .first() as { count: number } | null;
    return Number(row?.count ?? 0) >= max;
  } catch {
    return false;
  }
}

export async function clearLimit(env: SecurityEnv, key: string): Promise<void> {
  try {
    await env.DB.prepare("DELETE FROM rate_limits WHERE key = ?1").bind(key).run();
  } catch {
    /* sin schema-migration-v28 */
  }
}

export const RATE_LIMIT_MESSAGE = "Demasiados intentos. Esperá unos minutos y probá de nuevo.";

/** Campos del pedido que ayudan a saber qué se tocó; nunca claves, tokens ni contraseñas. */
const AUDIT_FIELDS = [
  "id",
  "license_id",
  "code",
  "plan",
  "billing",
  "months",
  "days",
  "amount_ars",
  "active",
  "status",
  "seller_code",
  "max_devices",
];

export async function auditAdmin(
  env: SecurityEnv,
  req: Request,
  path: string,
  status: number,
  bodyText: string,
): Promise<void> {
  let detail: Record<string, unknown> = {};
  try {
    const body = JSON.parse(bodyText || "{}") as Record<string, unknown>;
    for (const field of AUDIT_FIELDS) {
      const value = body[field];
      if (value !== undefined && (typeof value !== "object" || value === null)) {
        detail[field] = typeof value === "string" ? value.slice(0, 80) : value;
      }
    }
    if (typeof body.license_key === "string" && body.license_key.length > 4) {
      detail.license_key_end = body.license_key.slice(-4);
    }
  } catch {
    detail = {};
  }
  try {
    await env.DB.prepare("INSERT INTO admin_audit (at, path, status, ip, detail) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(new Date().toISOString(), path, status, clientIp(req).slice(0, 64), JSON.stringify(detail))
      .run();
  } catch {
    /* sin schema-migration-v28 */
  }
}

/** Limpieza del cron: ventanas de más de un día y registro de más de un año. */
export async function pruneSecurityTables(env: SecurityEnv): Promise<void> {
  try {
    await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(nowSec() - 86_400).run();
    await env.DB.prepare("DELETE FROM admin_audit WHERE at < ?1")
      .bind(new Date(Date.now() - 365 * 86_400_000).toISOString())
      .run();
  } catch {
    /* sin schema-migration-v28 */
  }
}
