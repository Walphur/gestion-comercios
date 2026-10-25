-- Alta de vendedores desde walqo.pro: de dónde vino y tope por IP.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v21.sql

-- source: panel | web. ip_hash: SHA-256 de la IP (solo para el tope de altas por día).
ALTER TABLE sellers ADD COLUMN source TEXT;
ALTER TABLE sellers ADD COLUMN ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_sellers_phone ON sellers(phone);
