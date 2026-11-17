-- KDS FASE 1: estaciones de cocina y tickets por ronda/estación.
-- Se alimenta desde sendTableOrderToKitchen (table_order_items status=sent).
-- No toca ventas, stock ni caja. No se sincroniza por LAN entre PCs.

CREATE TABLE IF NOT EXISTS kitchen_stations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT INTO kitchen_stations (id, name, sort_order, active)
SELECT 1, 'Cocina', 0, 1
WHERE NOT EXISTS (SELECT 1 FROM kitchen_stations WHERE id = 1);

ALTER TABLE products ADD COLUMN kitchen_station_id INTEGER;

CREATE TABLE IF NOT EXISTS kitchen_tickets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id        INTEGER NOT NULL,
    round           INTEGER NOT NULL,
    station_id      INTEGER NOT NULL,
    table_id        INTEGER NOT NULL,
    waiter_user_id  INTEGER,
    waiter_label    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'preparing', 'ready', 'delivered', 'voided')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    started_at      TEXT,
    ready_at        TEXT,
    delivered_at    TEXT,
    UNIQUE (order_id, round, station_id)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_status_created
    ON kitchen_tickets(status, created_at);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_station_status
    ON kitchen_tickets(station_id, status);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_table_status
    ON kitchen_tickets(table_id, status);

CREATE TABLE IF NOT EXISTS kitchen_ticket_items (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id            INTEGER NOT NULL,
    table_order_item_id  INTEGER NOT NULL UNIQUE,
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

CREATE INDEX IF NOT EXISTS idx_kitchen_ticket_items_ticket
    ON kitchen_ticket_items(ticket_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_ticket_items_status
    ON kitchen_ticket_items(status);
