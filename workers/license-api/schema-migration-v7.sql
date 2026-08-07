-- Licencias free para signup + vínculo cuenta↔licencia (rebuild seguro).
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v7.sql

ALTER TABLE accounts ADD COLUMN license_id TEXT;
ALTER TABLE accounts ADD COLUMN license_key TEXT;

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS activations_bak AS SELECT * FROM activations;
DROP TABLE IF EXISTS activations;

CREATE TABLE licenses_new (
  id TEXT PRIMARY KEY NOT NULL,
  license_key TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL CHECK (plan IN ('basic', 'pro', 'free')),
  max_devices INTEGER NOT NULL DEFAULT 1,
  buyer_note TEXT,
  created_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  billing_type TEXT NOT NULL DEFAULT 'perpetual',
  expires_at TEXT,
  client_name TEXT,
  client_phone TEXT,
  amount_ars INTEGER,
  last_paid_at TEXT,
  updated_at TEXT
);

INSERT INTO licenses_new (
  id, license_key, plan, max_devices, buyer_note, created_at, revoked,
  billing_type, expires_at, client_name, client_phone, amount_ars,
  last_paid_at, updated_at
)
SELECT
  id, license_key, plan, max_devices, buyer_note, created_at, revoked,
  COALESCE(billing_type, 'perpetual'), expires_at, client_name, client_phone,
  amount_ars, last_paid_at, updated_at
FROM licenses;

DROP TABLE licenses;
ALTER TABLE licenses_new RENAME TO licenses;

CREATE TABLE activations (
  id TEXT PRIMARY KEY NOT NULL,
  license_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  device_name TEXT,
  activated_at TEXT NOT NULL,
  UNIQUE (license_id, machine_id)
);

INSERT INTO activations (id, license_id, machine_id, device_name, activated_at)
SELECT id, license_id, machine_id, device_name, activated_at FROM activations_bak;

DROP TABLE activations_bak;

CREATE INDEX IF NOT EXISTS idx_activations_license ON activations(license_id);
CREATE INDEX IF NOT EXISTS idx_licenses_created ON licenses(created_at);
CREATE INDEX IF NOT EXISTS idx_licenses_plan ON licenses(plan);

PRAGMA foreign_keys = ON;
