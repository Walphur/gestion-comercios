-- Pruebas gratuitas (demo): quién inició la prueba de 7 días
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v4.sql

CREATE TABLE IF NOT EXISTS trial_events (
  id TEXT PRIMARY KEY NOT NULL,
  machine_id TEXT NOT NULL UNIQUE,
  started_at TEXT NOT NULL,
  app_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_trial_started ON trial_events(started_at);
