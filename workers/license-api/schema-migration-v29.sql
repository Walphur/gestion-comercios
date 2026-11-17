-- Ledger de pagos enriquecido + día ancla de facturación (meses calendario).
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v29.sql

ALTER TABLE licenses ADD COLUMN billing_anchor_day INTEGER;

ALTER TABLE license_payments ADD COLUMN periods INTEGER;
ALTER TABLE license_payments ADD COLUMN period_unit TEXT;
ALTER TABLE license_payments ADD COLUMN previous_expires_at TEXT;
ALTER TABLE license_payments ADD COLUMN new_expires_at TEXT;
ALTER TABLE license_payments ADD COLUMN extends_license INTEGER NOT NULL DEFAULT 1;
ALTER TABLE license_payments ADD COLUMN recorded_by TEXT;
ALTER TABLE license_payments ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_license_payments_idem
  ON license_payments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS license_change_log (
  id TEXT PRIMARY KEY NOT NULL,
  license_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  recorded_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (license_id) REFERENCES licenses(id)
);

CREATE INDEX IF NOT EXISTS idx_license_change_log_license
  ON license_change_log(license_id, created_at);
