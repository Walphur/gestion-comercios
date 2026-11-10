interface Env {
  STORE: DurableObjectNamespace<import("./store").StoreDb>;
  ALLOWED_ORIGINS: string;
  WEB_DEV_TOKEN?: string;
}

declare module "*.sql" {
  const sql: string;
  export default sql;
}
