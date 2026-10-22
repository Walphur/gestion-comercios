-- Mozos desde el celular: nombre del mozo que abrió la mesa sin usuario en la PC, y registro de comandas
-- ya anotadas para que la misma comanda no entre dos veces. Solo agrega columnas y tablas.

ALTER TABLE table_orders ADD COLUMN waiter_label TEXT;

CREATE TABLE IF NOT EXISTS waiter_commands (
    remote_id    TEXT PRIMARY KEY NOT NULL,
    kind         TEXT NOT NULL,
    table_number INTEGER NOT NULL,
    waiter_name  TEXT,
    status       TEXT NOT NULL,
    note         TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
