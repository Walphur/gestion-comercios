-- Ejecutar una vez en D1 existente:
-- npx wrangler d1 execute gestion-licenses --file=./schema-migration-v2.sql

ALTER TABLE licenses ADD COLUMN billing_type TEXT NOT NULL DEFAULT 'perpetual';
ALTER TABLE licenses ADD COLUMN expires_at TEXT;
