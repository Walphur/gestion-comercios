CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  api_token TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL DEFAULT '',
  pair_code TEXT,
  pair_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS phone_sessions (
  token TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  tenant_id TEXT NOT NULL,
  sync_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'unidad',
  active INTEGER NOT NULL DEFAULT 1,
  has_variants INTEGER NOT NULL DEFAULT 0,
  desktop_stock REAL NOT NULL DEFAULT 0,
  content_rev INTEGER NOT NULL DEFAULT 0,
  content_origin TEXT NOT NULL DEFAULT 'desktop',
  created_on_phone INTEGER NOT NULL DEFAULT 0,
  desktop_seen INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, sync_id)
);

CREATE TABLE IF NOT EXISTS variants (
  tenant_id TEXT NOT NULL,
  sync_id TEXT NOT NULL,
  product_sync_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  attributes_json TEXT NOT NULL DEFAULT '{}',
  sku TEXT NOT NULL DEFAULT '',
  price REAL,
  desktop_stock REAL NOT NULL DEFAULT 0,
  content_rev INTEGER NOT NULL DEFAULT 0,
  content_origin TEXT NOT NULL DEFAULT 'desktop',
  created_on_phone INTEGER NOT NULL DEFAULT 0,
  desktop_seen INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, sync_id)
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON variants (tenant_id, product_sync_id);

CREATE TABLE IF NOT EXISTS stock_ops (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sync_id TEXT NOT NULL,
  variant_sync_id TEXT NOT NULL DEFAULT '',
  delta REAL NOT NULL,
  acked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_ops_open ON stock_ops (tenant_id, acked);

CREATE TABLE IF NOT EXISTS reports (
  tenant_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  sync_id TEXT NOT NULL,
  variant_sync_id TEXT NOT NULL DEFAULT '',
  field TEXT NOT NULL,
  kept TEXT NOT NULL,
  discarded TEXT NOT NULL,
  created_at TEXT NOT NULL
);
