-- Gastos del negocio (alquiler, luz, sueldos…) y gastos fijos de cada mes.
-- Las compras de mercadería van por proveedores, no acá.
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    category     TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    amount       REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
    day_of_month INTEGER NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS expenses (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    category         TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    amount           REAL NOT NULL CHECK (amount > 0),
    method           TEXT NOT NULL
                     CHECK (method IN ('efectivo_caja', 'transferencia', 'tarjeta', 'mercadopago', 'otro')),
    paid_at          TEXT NOT NULL,
    cash_movement_id INTEGER,
    recurring_id     INTEGER REFERENCES recurring_expenses(id) ON DELETE SET NULL,
    user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    voided           INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_expenses_paid_at ON expenses(paid_at);
CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON expenses(recurring_id, paid_at);
