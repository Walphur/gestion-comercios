-- Primer uso de la app (abre el programa), distinto de «Probar 7 días».
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v5.sql

CREATE TABLE IF NOT EXISTS app_open_events (
  id TEXT PRIMARY KEY NOT NULL,
  machine_id TEXT NOT NULL UNIQUE,
  first_opened_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL,
  app_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_open_first ON app_open_events(first_opened_at);
