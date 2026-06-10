CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY NOT NULL,
  license_key TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL CHECK (plan IN ('basic', 'pro')),
  max_devices INTEGER NOT NULL DEFAULT 1,
  buyer_note TEXT,
  created_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS activations (
  id TEXT PRIMARY KEY NOT NULL,
  license_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  device_name TEXT,
  activated_at TEXT NOT NULL,
  UNIQUE (license_id, machine_id),
  FOREIGN KEY (license_id) REFERENCES licenses(id)
);

CREATE INDEX IF NOT EXISTS idx_activations_license ON activations(license_id);
