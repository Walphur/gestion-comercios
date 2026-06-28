-- Panel admin: datos de cliente y pagos
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v3.sql

ALTER TABLE licenses ADD COLUMN client_name TEXT;
ALTER TABLE licenses ADD COLUMN client_phone TEXT;
ALTER TABLE licenses ADD COLUMN amount_ars INTEGER;
ALTER TABLE licenses ADD COLUMN last_paid_at TEXT;
ALTER TABLE licenses ADD COLUMN updated_at TEXT;
