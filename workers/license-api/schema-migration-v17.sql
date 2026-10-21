-- Tienda web: dólar del día (dolarapi) por casa, compartido por todos los comercios.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v17.sql

CREATE TABLE IF NOT EXISTS menu_portal_usd_rates (
  casa TEXT PRIMARY KEY NOT NULL,
  venta REAL NOT NULL,
  fetched_at TEXT NOT NULL,
  checked_at TEXT NOT NULL
);
