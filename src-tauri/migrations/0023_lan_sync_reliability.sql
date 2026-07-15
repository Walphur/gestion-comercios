-- Sync LAN confiabilidad: catch-up/outbox/balances/conflictos/numeración

-- Outbox: reintentos y timestamp de envío
ALTER TABLE lan_sync_outbox ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lan_sync_outbox ADD COLUMN sending_at TEXT;
ALTER TABLE lan_sync_outbox ADD COLUMN next_retry_at TEXT;

-- Meta LWW: lamport + device (no solo reloj de pared)
ALTER TABLE products ADD COLUMN sync_lamport INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN sync_origin TEXT;
ALTER TABLE categories ADD COLUMN sync_lamport INTEGER NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN sync_origin TEXT;
ALTER TABLE suppliers ADD COLUMN sync_lamport INTEGER NOT NULL DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN sync_origin TEXT;
ALTER TABLE customers ADD COLUMN sync_lamport INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN sync_origin TEXT;

-- Movimientos de saldo cliente (append-only). El balance se recalcula desde aquí.
CREATE TABLE IF NOT EXISTS customer_balance_movements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT NOT NULL UNIQUE,
    customer_id     INTEGER NOT NULL REFERENCES customers(id),
    device_id       TEXT NOT NULL,
    delta           REAL NOT NULL,
    reason          TEXT,
    reference_type  TEXT,
    reference_id    INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_cust_bal_mov_customer
    ON customer_balance_movements(customer_id, id);

-- Seed: un movimiento por saldo existente (migración única)
INSERT INTO customer_balance_movements (sync_id, customer_id, device_id, delta, reason, created_at)
SELECT
    lower(hex(randomblob(16))),
    c.id,
    'legacy-backfill',
    c.balance,
    'legacy_seed',
    COALESCE(c.updated_at, c.created_at, datetime('now','localtime'))
FROM customers c
WHERE ABS(COALESCE(c.balance, 0)) > 0.0000001
  AND NOT EXISTS (
    SELECT 1 FROM customer_balance_movements m WHERE m.customer_id = c.id
  );

-- Recalcular balance desde movimientos
UPDATE customers SET balance = (
    SELECT COALESCE(SUM(m.delta), 0) FROM customer_balance_movements m WHERE m.customer_id = customers.id
);

-- Cola de conflictos (no detiene la sync)
CREATE TABLE IF NOT EXISTS lan_sync_conflicts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL UNIQUE,
    entity_type     TEXT NOT NULL,
    entity_sync_id  TEXT NOT NULL,
    op              TEXT NOT NULL,
    payload         TEXT,
    lamport         INTEGER NOT NULL,
    origin_device   TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    reason          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved', 'discarded')),
    resolved_at     TEXT,
    resolution      TEXT
);

CREATE INDEX IF NOT EXISTS idx_lan_conflicts_open
    ON lan_sync_conflicts(status, id);

-- Numeración comercial offline-first: secuencia por dispositivo
-- Formato visible: {device_code}-{doc_type}-{NNNNNNNN}  ej. CJ01-V-00000042
ALTER TABLE sales ADD COLUMN doc_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_doc_number
    ON sales(doc_number) WHERE doc_number IS NOT NULL AND doc_number != '';

CREATE TABLE IF NOT EXISTS document_sequences (
    device_code TEXT NOT NULL,
    doc_type    TEXT NOT NULL,
    next_value  INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (device_code, doc_type)
);

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('lan_sync_device_code', ''),
    ('lan_sync_sending_timeout_secs', '30');

-- Triggers: clientes ya no encolan por cambio de balance (solo ficha)
DROP TRIGGER IF EXISTS trg_lan_customers_au;
CREATE TRIGGER IF NOT EXISTS trg_lan_customers_au
AFTER UPDATE OF name, phone, document, email, credit_limit, notes, active ON customers
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

-- Encolar movimientos de saldo
CREATE TRIGGER IF NOT EXISTS trg_lan_cust_bal_mov_ai
AFTER INSERT ON customer_balance_movements
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'customer_balance_movement',
    COALESCE(NEW.sync_id, 'pending-cbal-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;
