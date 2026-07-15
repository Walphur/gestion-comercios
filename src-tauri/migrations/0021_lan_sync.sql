-- WalTech Sync LAN (Fase 1): metadatos + outbox + logs
-- Filosofía: cada PC tiene SQLite local; se sincronizan eventos, no el archivo.

-- Identidad estable cross-device
ALTER TABLE categories ADD COLUMN sync_id TEXT;
ALTER TABLE products ADD COLUMN sync_id TEXT;
ALTER TABLE suppliers ADD COLUMN sync_id TEXT;
ALTER TABLE sales ADD COLUMN sync_id TEXT;
ALTER TABLE sale_items ADD COLUMN sync_id TEXT;
ALTER TABLE stock_movements ADD COLUMN sync_id TEXT;
ALTER TABLE customers ADD COLUMN updated_at TEXT;
ALTER TABLE categories ADD COLUMN updated_at TEXT;
ALTER TABLE suppliers ADD COLUMN updated_at TEXT;
ALTER TABLE sales ADD COLUMN updated_at TEXT;
ALTER TABLE stock_movements ADD COLUMN device_id TEXT;

-- customers.sync_id ya existe desde 0013; índice puede fallar si ya está — IF NOT EXISTS
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_sync_id ON categories(sync_id) WHERE sync_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sync_id ON products(sync_id) WHERE sync_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_sync_id ON suppliers(sync_id) WHERE sync_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_sync_id ON sales(sync_id) WHERE sync_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_items_sync_id ON sale_items(sync_id) WHERE sync_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_sync_id ON stock_movements(sync_id) WHERE sync_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_sync_id ON customers(sync_id) WHERE sync_id IS NOT NULL;

-- Backfill UUIDs (formato hex sin guiones cortos vía randomblob)
UPDATE categories SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL;
UPDATE products SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL;
UPDATE suppliers SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL;
UPDATE customers SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL;
UPDATE sales SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL;
UPDATE sale_items SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL;
UPDATE stock_movements SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL;

UPDATE customers SET updated_at = COALESCE(created_at, datetime('now','localtime')) WHERE updated_at IS NULL;
UPDATE categories SET updated_at = COALESCE(created_at, datetime('now','localtime')) WHERE updated_at IS NULL;
UPDATE suppliers SET updated_at = COALESCE(created_at, datetime('now','localtime')) WHERE updated_at IS NULL;
UPDATE sales SET updated_at = COALESCE(created_at, datetime('now','localtime')) WHERE updated_at IS NULL;

-- Cola de eventos salientes (CDC)
CREATE TABLE IF NOT EXISTS lan_sync_outbox (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL UNIQUE,
    entity_type     TEXT NOT NULL,
    entity_sync_id  TEXT NOT NULL,
    op              TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
    payload         TEXT,
    lamport         INTEGER NOT NULL DEFAULT 0,
    origin_device   TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sending', 'acked', 'failed')),
    last_error      TEXT,
    acked_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_lan_outbox_status ON lan_sync_outbox(status, id);

-- Eventos ya aplicados (dedup)
CREATE TABLE IF NOT EXISTS lan_sync_applied (
    event_id     TEXT PRIMARY KEY,
    entity_type  TEXT NOT NULL,
    applied_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Cursores de catch-up por peer
CREATE TABLE IF NOT EXISTS lan_sync_cursors (
    peer_device_id TEXT PRIMARY KEY,
    last_event_id  TEXT,
    last_lamport   INTEGER NOT NULL DEFAULT 0,
    updated_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Historial visible en UI
CREATE TABLE IF NOT EXISTS lan_sync_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    at           TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    direction    TEXT NOT NULL CHECK (direction IN ('in', 'out', 'info', 'error')),
    peer         TEXT,
    summary      TEXT NOT NULL,
    detail       TEXT
);

CREATE INDEX IF NOT EXISTS idx_lan_sync_log_at ON lan_sync_log(at DESC);

-- Hub event store: todos los eventos aplicados/producidos para catch-up multi-cliente
CREATE TABLE IF NOT EXISTS lan_sync_event_store (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL UNIQUE,
    entity_type     TEXT NOT NULL,
    entity_sync_id  TEXT NOT NULL,
    op              TEXT NOT NULL,
    payload         TEXT,
    lamport         INTEGER NOT NULL,
    origin_device   TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lan_event_store_lamport
    ON lan_sync_event_store(lamport, event_id);

-- Settings por defecto Sync LAN
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('lan_sync_role', 'off'),
    ('lan_sync_port', '48765'),
    ('lan_sync_psk', ''),
    ('lan_sync_device_id', ''),
    ('lan_sync_device_name', ''),
    ('lan_sync_server_host', ''),
    ('lan_sync_lamport', '0'),
    ('lan_sync_last_ok_at', ''),
    ('lan_sync_enabled', '0'),
    ('lan_sync_applying', '0');

-- Triggers: encolar cambios Fase 1 (payload se completa al drenar la outbox)
-- Nota: stock absoluto de products NO se aplica en peers; solo stock_movements.
-- lan_sync_applying=1 evita re-encolar cuando el applier escribe eventos remotos.

CREATE TRIGGER IF NOT EXISTS trg_lan_categories_ai
AFTER INSERT ON categories
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') = '0'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))),
    'category',
    COALESCE(NEW.sync_id, lower(hex(randomblob(16)))),
    'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_categories_au
AFTER UPDATE ON categories
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') = '0'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))),
    'category',
    COALESCE(NEW.sync_id, lower(hex(randomblob(16)))),
    'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_products_ai
AFTER INSERT ON products
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') = '0'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))),
    'product',
    COALESCE(NEW.sync_id, lower(hex(randomblob(16)))),
    'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_products_au
AFTER UPDATE ON products
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') = '0'
  AND (
    OLD.name IS NOT NEW.name OR OLD.price IS NOT NEW.price OR OLD.cost IS NOT NEW.cost
    OR OLD.description IS NOT NEW.description OR OLD.barcode IS NOT NEW.barcode
    OR OLD.sku IS NOT NEW.sku OR OLD.active IS NOT NEW.active
    OR OLD.category_id IS NOT NEW.category_id OR OLD.supplier_id IS NOT NEW.supplier_id
    OR OLD.min_stock IS NOT NEW.min_stock OR OLD.unit IS NOT NEW.unit
    OR OLD.tax_rate IS NOT NEW.tax_rate
  )
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))),
    'product',
    COALESCE(NEW.sync_id, lower(hex(randomblob(16)))),
    'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_customers_ai
AFTER INSERT ON customers
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') = '0'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))),
    'customer',
    COALESCE(NEW.sync_id, lower(hex(randomblob(16)))),
    'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_customers_au
AFTER UPDATE ON customers
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') = '0'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))),
    'customer',
    COALESCE(NEW.sync_id, lower(hex(randomblob(16)))),
    'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_suppliers_ai
AFTER INSERT ON suppliers
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') = '0'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))),
    'supplier',
    COALESCE(NEW.sync_id, lower(hex(randomblob(16)))),
    'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_suppliers_au
AFTER UPDATE ON suppliers
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') = '0'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))),
    'supplier',
    COALESCE(NEW.sync_id, lower(hex(randomblob(16)))),
    'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_sales_ai
AFTER INSERT ON sales
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') = '0'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))),
    'sale',
    COALESCE(NEW.sync_id, lower(hex(randomblob(16)))),
    'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_stock_movements_ai
AFTER INSERT ON stock_movements
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') = '0'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))),
    'stock_movement',
    COALESCE(NEW.sync_id, lower(hex(randomblob(16)))),
    'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;
