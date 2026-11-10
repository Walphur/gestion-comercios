-- Quién publica la tienda web de cada licencia: 'pc' (WalQo en la PC) o 'web' (WalQo Web).
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v25.sql

-- NULL = publicada por una PC antes de esta columna.
ALTER TABLE menu_portal_snapshots ADD COLUMN source TEXT;
