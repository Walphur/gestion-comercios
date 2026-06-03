-- Clientes y cuenta corriente (fiado)
CREATE TABLE IF NOT EXISTS customers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    phone        TEXT,
    document     TEXT,
    email        TEXT,
    credit_limit REAL NOT NULL DEFAULT 0,
    balance      REAL NOT NULL DEFAULT 0,
    notes        TEXT,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(active);

CREATE TABLE IF NOT EXISTS customer_payments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id     INTEGER NOT NULL REFERENCES customers(id),
    amount          REAL NOT NULL,
    payment_method  TEXT NOT NULL DEFAULT 'efectivo',
    notes           TEXT,
    user_id         INTEGER REFERENCES users(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);

-- Vincular ventas a cliente; cantidad real descontada de stock por línea
ALTER TABLE sales ADD COLUMN customer_id INTEGER REFERENCES customers(id);
ALTER TABLE sale_items ADD COLUMN stock_qty REAL;

UPDATE sale_items SET stock_qty = qty WHERE stock_qty IS NULL;
