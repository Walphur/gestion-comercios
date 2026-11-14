-- «Recomendá WalQo»: cada comercio tiene un código (modelo 'month') atado a su licencia.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v26.sql

ALTER TABLE sellers ADD COLUMN license_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_license ON sellers(license_id) WHERE license_id IS NOT NULL;
