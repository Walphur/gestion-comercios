interface Env {
  STORE: DurableObjectNamespace<import("./store").StoreDb>;
  ALLOWED_ORIGINS: string;
  /** Servidor de licencias y cuentas (workers/license-api) por service binding. */
  LICENSE?: Fetcher;
  /** Si no hay service binding (p. ej. en otra cuenta), la URL pública. */
  LICENSE_API_URL: string;
  /** Secreto compartido con license-api para /v1/web/account. */
  WEB_SERVICE_SECRET?: string;
  /** Firma las sesiones del navegador. */
  SESSION_SECRET?: string;
  /** Topes de /v1/session/* (wrangler.toml [[ratelimits]]). */
  LOGIN_IP_LIMIT?: RateLimiter;
  LOGIN_EMAIL_LIMIT?: RateLimiter;
  /** App de WalQo en Mercado Pago Developers (la misma que usa la PC). */
  MP_CLIENT_ID?: string;
  MP_CLIENT_SECRET?: string;
  MP_REDIRECT_URI?: string;
}

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

declare module "*.sql" {
  const sql: string;
  export default sql;
}
