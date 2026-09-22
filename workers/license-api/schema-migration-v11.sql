-- Carta pública gastronomía (walqo.pro/carta).
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v11.sql

CREATE TABLE IF NOT EXISTS menu_portal_snapshots (
  license_id TEXT PRIMARY KEY NOT NULL,
  menu_slug TEXT NOT NULL,
  payload TEXT NOT NULL,
  business_name TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (license_id) REFERENCES licenses(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_portal_slug
  ON menu_portal_snapshots(menu_slug);

CREATE INDEX IF NOT EXISTS idx_menu_portal_updated
  ON menu_portal_snapshots(updated_at);
