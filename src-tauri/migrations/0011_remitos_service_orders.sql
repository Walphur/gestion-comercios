-- Remitos (módulo Pro)
CREATE TABLE IF NOT EXISTS delivery_notes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    note_number   TEXT NOT NULL,
    customer_id   INTEGER REFERENCES customers(id),
    destination   TEXT,
    status        TEXT NOT NULL DEFAULT 'draft',
    notes         TEXT,
    issued_at     TEXT,
    stock_applied INTEGER NOT NULL DEFAULT 0,
    user_id       INTEGER REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS delivery_note_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id    INTEGER NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    name       TEXT NOT NULL,
    qty        REAL NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_delivery_notes_status ON delivery_notes(status);
CREATE INDEX IF NOT EXISTS idx_delivery_note_items_note ON delivery_note_items(note_id);

-- Órdenes de servicio (módulo Pro)
CREATE TABLE IF NOT EXISTS service_orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number  TEXT NOT NULL,
    customer_id   INTEGER REFERENCES customers(id),
    title         TEXT NOT NULL,
    subject_notes TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    subtotal      REAL NOT NULL DEFAULT 0,
    discount_pct  REAL NOT NULL DEFAULT 0,
    total         REAL NOT NULL DEFAULT 0,
    notes         TEXT,
    quote_id      INTEGER REFERENCES quotes(id),
    sale_id       INTEGER REFERENCES sales(id),
    stock_applied INTEGER NOT NULL DEFAULT 0,
    user_id       INTEGER REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS service_order_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
    product_id   INTEGER REFERENCES products(id),
    variant_id   INTEGER,
    name         TEXT NOT NULL,
    qty          REAL NOT NULL,
    unit_price   REAL NOT NULL DEFAULT 0,
    discount_pct REAL NOT NULL DEFAULT 0,
    line_total   REAL NOT NULL DEFAULT 0,
    is_labor     INTEGER NOT NULL DEFAULT 0,
    sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders(status);
CREATE INDEX IF NOT EXISTS idx_service_order_items_order ON service_order_items(order_id);
