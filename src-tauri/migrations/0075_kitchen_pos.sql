-- KDS FASE 2: tickets de mostrador (POS) + estación por categoría.
-- table_id/order_id pasan a nullable; sale_id + source; ítems sin mesa.

ALTER TABLE categories ADD COLUMN kitchen_station_id INTEGER;

ALTER TABLE kitchen_tickets ADD COLUMN sale_id INTEGER;
ALTER TABLE kitchen_tickets ADD COLUMN source TEXT NOT NULL DEFAULT 'table';

-- Recrear tickets para permitir order_id/table_id NULL (SQLite no cambia NOT NULL con ALTER).
CREATE TABLE IF NOT EXISTS kitchen_tickets_v2 (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id        INTEGER,
    sale_id         INTEGER,
    source          TEXT NOT NULL DEFAULT 'table'
        CHECK (source IN ('table', 'pos')),
    round           INTEGER NOT NULL DEFAULT 1,
    station_id      INTEGER NOT NULL,
    table_id        INTEGER,
    waiter_user_id  INTEGER,
    waiter_label    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'preparing', 'ready', 'delivered', 'voided')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    started_at      TEXT,
    ready_at        TEXT,
    delivered_at    TEXT
);

INSERT INTO kitchen_tickets_v2 (
    id, order_id, sale_id, source, round, station_id, table_id,
    waiter_user_id, waiter_label, status, created_at, started_at, ready_at, delivered_at
)
SELECT
    id, order_id, sale_id, COALESCE(NULLIF(source, ''), 'table'), round, station_id, table_id,
    waiter_user_id, waiter_label, status, created_at, started_at, ready_at, delivered_at
FROM kitchen_tickets;

DROP TABLE kitchen_tickets;
ALTER TABLE kitchen_tickets_v2 RENAME TO kitchen_tickets;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_tickets_order_round_station
    ON kitchen_tickets(order_id, round, station_id)
    WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_tickets_sale_station
    ON kitchen_tickets(sale_id, station_id)
    WHERE sale_id IS NOT NULL AND source = 'pos';
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_status_created
    ON kitchen_tickets(status, created_at);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_station_status
    ON kitchen_tickets(station_id, status);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_table_status
    ON kitchen_tickets(table_id, status);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_sale
    ON kitchen_tickets(sale_id);

CREATE TABLE IF NOT EXISTS kitchen_ticket_items_v2 (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id            INTEGER NOT NULL,
    table_order_item_id  INTEGER,
    product_id           INTEGER NOT NULL,
    label                TEXT NOT NULL,
    qty                  REAL NOT NULL,
    modifiers_json       TEXT,
    cook                 TEXT,
    note                 TEXT,
    status               TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'preparing', 'ready', 'delivered', 'voided')),
    created_at           TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    started_at           TEXT,
    ready_at             TEXT,
    delivered_at         TEXT
);

INSERT INTO kitchen_ticket_items_v2 (
    id, ticket_id, table_order_item_id, product_id, label, qty, modifiers_json, cook, note,
    status, created_at, started_at, ready_at, delivered_at
)
SELECT
    id, ticket_id, table_order_item_id, product_id, label, qty, modifiers_json, cook, note,
    status, created_at, started_at, ready_at, delivered_at
FROM kitchen_ticket_items;

DROP TABLE kitchen_ticket_items;
ALTER TABLE kitchen_ticket_items_v2 RENAME TO kitchen_ticket_items;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kti_table_order_item
    ON kitchen_ticket_items(table_order_item_id)
    WHERE table_order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kitchen_ticket_items_ticket
    ON kitchen_ticket_items(ticket_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_ticket_items_status
    ON kitchen_ticket_items(status);
