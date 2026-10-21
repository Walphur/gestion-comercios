-- Mesas de gastronomía: salón, cuenta abierta por mesa, ítems por ronda y avisos del QR.
-- Solo agrega tablas. Quedan en esta PC (no se sincronizan entre computadoras).
-- La venta, el stock y la caja se mueven recién al cobrar, por el camino normal de ventas.

CREATE TABLE IF NOT EXISTS dining_tables (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    number      INTEGER NOT NULL,
    name        TEXT,
    zone        TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dining_tables_active_number
    ON dining_tables(number) WHERE active = 1;

CREATE TABLE IF NOT EXISTS table_orders (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id          INTEGER NOT NULL,
    status            TEXT NOT NULL DEFAULT 'open',
    guests            INTEGER,
    waiter_user_id    INTEGER,
    note              TEXT,
    bill_requested_at TEXT,
    sale_id           INTEGER,
    opened_by         INTEGER,
    opened_at         TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    closed_at         TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_table_orders_open_table
    ON table_orders(table_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_table_orders_status ON table_orders(status);

CREATE TABLE IF NOT EXISTS table_order_items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id       INTEGER NOT NULL,
    product_id     INTEGER NOT NULL,
    variant_id     INTEGER,
    label          TEXT NOT NULL,
    unit_price     REAL NOT NULL,
    qty            REAL NOT NULL,
    modifiers_json TEXT,
    cook           TEXT,
    note           TEXT,
    status         TEXT NOT NULL DEFAULT 'new',
    source         TEXT NOT NULL DEFAULT 'staff',
    round          INTEGER,
    remote_id      TEXT,
    sent_at        TEXT,
    created_by     INTEGER,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_table_order_items_order ON table_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_table_order_items_remote ON table_order_items(remote_id);

CREATE TABLE IF NOT EXISTS table_calls (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id    INTEGER NOT NULL,
    kind        TEXT NOT NULL,
    remote_id   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    done_at     TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_table_calls_remote ON table_calls(remote_id) WHERE remote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_table_calls_open ON table_calls(done_at);
