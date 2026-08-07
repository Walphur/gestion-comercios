-- Cuentas cloud (registro + verificación por email).
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v6.sql

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);

CREATE TABLE IF NOT EXISTS account_otps (
  email TEXT PRIMARY KEY NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_devices (
  account_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (account_id, machine_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_account_devices_machine ON account_devices(machine_id);
