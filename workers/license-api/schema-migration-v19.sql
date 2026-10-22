-- Mozos desde el celular: celulares vinculados por mozo, estado del salón que publica la PC y comandas del mozo.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v19.sql

-- token_hash = SHA-256 del enlace del mozo; el enlace en claro no se guarda.
CREATE TABLE IF NOT EXISTS menu_portal_waiters (
  id TEXT PRIMARY KEY NOT NULL,
  license_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  user_id INTEGER,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_menu_waiters_token ON menu_portal_waiters (token_hash);
CREATE INDEX IF NOT EXISTS idx_menu_waiters_license ON menu_portal_waiters (license_id, revoked_at);

-- Mesas, cuentas y avisos tal como los ve la PC. seen_at = última vez que la PC se conectó.
CREATE TABLE IF NOT EXISTS menu_portal_floor (
  license_id TEXT PRIMARY KEY NOT NULL,
  floor_json TEXT NOT NULL,
  machine_id TEXT,
  updated_at TEXT NOT NULL,
  seen_at TEXT NOT NULL
);

-- kind: open | order | prebill | attend. status: sent (falta que la PC lo baje) | received | printed | rejected.
CREATE TABLE IF NOT EXISTS menu_portal_waiter_commands (
  license_id TEXT NOT NULL,
  id TEXT NOT NULL,
  waiter_id TEXT NOT NULL,
  table_number INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  result_note TEXT,
  claimed_by TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (license_id, id)
);

CREATE INDEX IF NOT EXISTS idx_waiter_cmd_license ON menu_portal_waiter_commands (license_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_waiter_cmd_waiter ON menu_portal_waiter_commands (waiter_id, created_at);
