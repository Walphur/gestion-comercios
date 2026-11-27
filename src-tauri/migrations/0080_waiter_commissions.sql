-- Comisiones de mozos V1 (B+P0): % global sobre mercadería neta, sin propina.
-- Separado de workshop_resources / comisiones de estética.
-- Una fila por venta cobrada de mesa; preparado para futuros cobros parciales (sale_id).

CREATE TABLE IF NOT EXISTS waiter_commission_entries (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id            INTEGER NOT NULL,
    table_order_id     INTEGER,
    table_number       INTEGER,
    waiter_user_id     INTEGER,
    waiter_label       TEXT,
    merchandise_base   REAL NOT NULL DEFAULT 0,
    tip_amount         REAL NOT NULL DEFAULT 0,
    commission_pct     REAL NOT NULL DEFAULT 0,
    commission_amount  REAL NOT NULL DEFAULT 0,
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'paid', 'reversed')),
    paid_at            TEXT,
    paid_by            INTEGER,
    reversed_at        TEXT,
    reversed_by        INTEGER,
    reverse_of_id      INTEGER,
    note               TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Idempotencia: un mozo (usuario o label) por venta.
CREATE UNIQUE INDEX IF NOT EXISTS ux_waiter_commission_sale_user
    ON waiter_commission_entries(sale_id, waiter_user_id)
    WHERE waiter_user_id IS NOT NULL AND reverse_of_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_waiter_commission_sale_label
    ON waiter_commission_entries(sale_id, waiter_label)
    WHERE waiter_user_id IS NULL AND waiter_label IS NOT NULL AND reverse_of_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_waiter_commission_status
    ON waiter_commission_entries(status, created_at);

CREATE INDEX IF NOT EXISTS idx_waiter_commission_waiter
    ON waiter_commission_entries(waiter_user_id, status);

-- Defaults: desactivado; % 0 hasta que el comercio lo configure.
INSERT INTO settings (key, value) VALUES ('waiter_commissions_enabled', '0')
ON CONFLICT(key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('waiter_commission_pct', '0')
ON CONFLICT(key) DO NOTHING;
