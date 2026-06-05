-- Presupuestos (módulo Pro)
CREATE TABLE IF NOT EXISTS quotes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_number  TEXT NOT NULL,
    customer_id   INTEGER REFERENCES customers(id),
    status        TEXT NOT NULL DEFAULT 'draft',
    subtotal      REAL NOT NULL DEFAULT 0,
    discount_pct  REAL NOT NULL DEFAULT 0,
    total         REAL NOT NULL DEFAULT 0,
    notes         TEXT,
    valid_until   TEXT,
    sale_id       INTEGER REFERENCES sales(id),
    user_id       INTEGER REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS quote_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id     INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    product_id   INTEGER REFERENCES products(id),
    variant_id   INTEGER,
    name         TEXT NOT NULL,
    qty          REAL NOT NULL,
    unit_price   REAL NOT NULL,
    discount_pct REAL NOT NULL DEFAULT 0,
    line_total   REAL NOT NULL,
    sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
