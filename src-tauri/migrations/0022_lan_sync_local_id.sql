-- Fix Sync LAN: outbox guarda id local; materialize asigna sync_id fuera del trigger
-- (evitar recursión de triggers al hacer UPDATE dentro de AFTER/AFTER INSERT).

ALTER TABLE lan_sync_outbox ADD COLUMN entity_local_id INTEGER;

DROP TRIGGER IF EXISTS trg_lan_categories_ai;
DROP TRIGGER IF EXISTS trg_lan_categories_au;
DROP TRIGGER IF EXISTS trg_lan_products_ai;
DROP TRIGGER IF EXISTS trg_lan_products_au;
DROP TRIGGER IF EXISTS trg_lan_customers_ai;
DROP TRIGGER IF EXISTS trg_lan_customers_au;
DROP TRIGGER IF EXISTS trg_lan_suppliers_ai;
DROP TRIGGER IF EXISTS trg_lan_suppliers_au;
DROP TRIGGER IF EXISTS trg_lan_sales_ai;
DROP TRIGGER IF EXISTS trg_lan_stock_movements_ai;

CREATE TRIGGER IF NOT EXISTS trg_lan_categories_ai
AFTER INSERT ON categories
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'category',
    COALESCE(NEW.sync_id, 'pending-cat-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_categories_au
AFTER UPDATE OF name ON categories
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'category',
    COALESCE(NEW.sync_id, 'pending-cat-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_products_ai
AFTER INSERT ON products
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'product',
    COALESCE(NEW.sync_id, 'pending-prod-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_products_au
AFTER UPDATE OF name, price, cost, description, barcode, sku, active, category_id, supplier_id, min_stock, unit, tax_rate ON products
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'product',
    COALESCE(NEW.sync_id, 'pending-prod-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_customers_ai
AFTER INSERT ON customers
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'customer',
    COALESCE(NEW.sync_id, 'pending-cust-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_customers_au
AFTER UPDATE OF name, phone, document, email, credit_limit, balance, notes, active ON customers
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'customer',
    COALESCE(NEW.sync_id, 'pending-cust-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_suppliers_ai
AFTER INSERT ON suppliers
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'supplier',
    COALESCE(NEW.sync_id, 'pending-sup-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_suppliers_au
AFTER UPDATE OF name, phone, notes ON suppliers
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'supplier',
    COALESCE(NEW.sync_id, 'pending-sup-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_sales_ai
AFTER INSERT ON sales
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'sale',
    COALESCE(NEW.sync_id, 'pending-sale-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_stock_movements_ai
AFTER INSERT ON stock_movements
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'stock_movement',
    COALESCE(NEW.sync_id, 'pending-mov-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;
