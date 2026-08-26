-- Portal web del dueño: snapshot periódico desde la PC.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v9.sql

CREATE TABLE IF NOT EXISTS portal_snapshots (
  license_id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  device_name TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (license_id) REFERENCES licenses(id)
);

CREATE INDEX IF NOT EXISTS idx_portal_snapshots_updated
  ON portal_snapshots(updated_at);
