-- Portal web del cliente del taller: historial por patente/DNI.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v10.sql

CREATE TABLE IF NOT EXISTS workshop_portal_snapshots (
  license_id TEXT PRIMARY KEY NOT NULL,
  workshop_slug TEXT NOT NULL,
  payload TEXT NOT NULL,
  business_name TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (license_id) REFERENCES licenses(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_portal_slug
  ON workshop_portal_snapshots(workshop_slug);

CREATE INDEX IF NOT EXISTS idx_workshop_portal_updated
  ON workshop_portal_snapshots(updated_at);
