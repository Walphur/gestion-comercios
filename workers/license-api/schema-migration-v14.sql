-- Tienda web: pedidos desde walqo.pro/NombreDelLocal que baja la PC.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v14.sql

ALTER TABLE menu_portal_snapshots ADD COLUMN order_catalog TEXT;

CREATE TABLE IF NOT EXISTS menu_portal_orders (
  id TEXT PRIMARY KEY NOT NULL,
  license_id TEXT NOT NULL,
  menu_slug TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  fulfillment TEXT NOT NULL,
  address TEXT,
  note TEXT,
  items_json TEXT NOT NULL,
  total REAL NOT NULL,
  delivery_cost REAL,
  currency TEXT,
  ip_hash TEXT,
  reject_reason TEXT,
  notified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_menu_orders_license_status
  ON menu_portal_orders(license_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_menu_orders_ip
  ON menu_portal_orders(ip_hash, created_at);

CREATE INDEX IF NOT EXISTS idx_menu_orders_created
  ON menu_portal_orders(created_at);
