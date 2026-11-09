-- Versión de WalQo y última conexión de cada PC activada (panel de licencias).
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v24.sql

-- app_version: la que mandó la PC en /v1/activate o /v1/validate (WalQo 1.3.11+).
ALTER TABLE activations ADD COLUMN app_version TEXT;
-- last_seen_at: última activación o validación de esa PC (ISO).
ALTER TABLE activations ADD COLUMN last_seen_at TEXT;
