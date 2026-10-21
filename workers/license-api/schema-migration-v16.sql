-- Tienda web: galería de hasta 4 fotos por producto (comprimidas en la PC, base64).
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v16.sql

CREATE TABLE IF NOT EXISTS menu_portal_photos (
  license_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT NOT NULL,
  PRIMARY KEY (license_id, hash)
);
