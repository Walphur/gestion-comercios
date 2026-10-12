-- Historial de cobros de licencias. No rellena pagos viejos.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v12.sql

ALTER TABLE licenses ADD COLUMN balance_ars INTEGER;

CREATE TABLE IF NOT EXISTS license_payments (
  id TEXT PRIMARY KEY NOT NULL,
  license_id TEXT NOT NULL,
  amount_ars INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (license_id) REFERENCES licenses(id)
);

CREATE INDEX IF NOT EXISTS idx_license_payments_license
  ON license_payments(license_id);

CREATE INDEX IF NOT EXISTS idx_license_payments_paid_at
  ON license_payments(paid_at);
