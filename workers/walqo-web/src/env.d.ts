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
}

declare module "*.sql" {
  const sql: string;
  export default sql;
}
