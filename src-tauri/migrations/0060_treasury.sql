-- Tesorería: dónde está la plata (cajón, guardado, banco, Mercado Pago y otras cuentas).
-- Las cuentas por defecto se crean al abrir la pantalla, no acá.
CREATE TABLE IF NOT EXISTS treasury_accounts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL
                    CHECK (kind IN ('cajon', 'guardado', 'banco', 'mercadopago', 'otra')),
    opening_balance REAL NOT NULL DEFAULT 0,
    opening_date    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    active          INTEGER NOT NULL DEFAULT 1,
    sort            INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS treasury_movements (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    type             TEXT NOT NULL CHECK (type IN ('traslado', 'retiro', 'aporte', 'ajuste')),
    from_account_id  INTEGER REFERENCES treasury_accounts(id) ON DELETE SET NULL,
    to_account_id    INTEGER REFERENCES treasury_accounts(id) ON DELETE SET NULL,
    amount           REAL NOT NULL CHECK (amount > 0),
    note             TEXT NOT NULL DEFAULT '',
    moved_at         TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    cash_movement_id INTEGER,
    user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    voided           INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_treasury_movements_moved_at ON treasury_movements(moved_at);
