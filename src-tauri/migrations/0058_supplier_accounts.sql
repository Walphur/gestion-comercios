-- Cuenta corriente con proveedores y pedidos de reposición.
-- amount con signo: compra a cuenta suma deuda (+), pago la descuenta (-).
CREATE TABLE IF NOT EXISTS supplier_movements (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id      INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    kind             TEXT NOT NULL CHECK (kind IN ('purchase', 'payment')),
    amount           REAL NOT NULL,
    payment_method   TEXT,
    note             TEXT,
    reference_type   TEXT,
    reference_id     INTEGER,
    cash_movement_id INTEGER,
    user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_supplier_movements_supplier
    ON supplier_movements(supplier_id, created_at);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'received', 'cancelled')),
    note        TEXT,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    closed_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status, created_at);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name       TEXT NOT NULL,
    qty        REAL NOT NULL,
    unit_cost  REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items(order_id);
