-- Mesas con QR: secreto por comercio para firmar el QR de cada mesa, y los pedidos/llamados que llegan del QR.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v18.sql

CREATE TABLE IF NOT EXISTS menu_portal_tables (
  license_id TEXT PRIMARY KEY NOT NULL,
  secret TEXT NOT NULL,
  tables_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

-- kind: order | waiter | bill. status: pending (la PC no lo bajó) | received | closed (la mesa se cobró).
CREATE TABLE IF NOT EXISTS menu_portal_table_requests (
  id TEXT PRIMARY KEY NOT NULL,
  license_id TEXT NOT NULL,
  table_number INTEGER NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  items_json TEXT,
  total REAL,
  note TEXT,
  customer_name TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_menu_table_req_license
  ON menu_portal_table_requests (license_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_menu_table_req_table
  ON menu_portal_table_requests (license_id, table_number, created_at);
CREATE INDEX IF NOT EXISTS idx_menu_table_req_ip
  ON menu_portal_table_requests (ip_hash, created_at);
