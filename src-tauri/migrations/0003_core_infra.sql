-- =============================================================================
-- Usuarios y RBAC local
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'manager', 'cashier')),
    pin          TEXT NOT NULL,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT OR IGNORE INTO users (id, username, display_name, role, pin) VALUES
    (1, 'admin', 'Administrador', 'admin', '1234'),
    (2, 'cajero', 'Cajero', 'cashier', '0000');

-- =============================================================================
-- Auditoría (action log)
-- =============================================================================
CREATE TABLE IF NOT EXISTS action_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   INTEGER,
    details     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_action_log_created ON action_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_log_user ON action_log(user_id);

-- =============================================================================
-- Caja: sesiones y arqueo ciego
-- =============================================================================
CREATE TABLE IF NOT EXISTS cash_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    opened_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    closed_at       TEXT,
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    expected_cash   REAL,
    declared_cash   REAL,
    cash_difference REAL,
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions(status);

-- =============================================================================
-- Stock multi-rubro: unidades, códigos múltiples, kits, lotes
-- =============================================================================
ALTER TABLE products ADD COLUMN unit_type TEXT NOT NULL DEFAULT 'integer'
    CHECK (unit_type IN ('integer', 'fractional'));
ALTER TABLE products ADD COLUMN track_batches INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN is_kit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN batch_policy TEXT DEFAULT 'FIFO'
    CHECK (batch_policy IS NULL OR batch_policy IN ('FIFO', 'LIFO'));

CREATE TABLE IF NOT EXISTS product_barcodes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    barcode         TEXT NOT NULL,
    label           TEXT,
    quantity_factor REAL NOT NULL DEFAULT 1,
    is_primary      INTEGER NOT NULL DEFAULT 0,
    UNIQUE (barcode)
);

CREATE INDEX IF NOT EXISTS idx_product_barcodes_product ON product_barcodes(product_id);

-- Migrar códigos existentes a product_barcodes
INSERT OR IGNORE INTO product_barcodes (product_id, barcode, label, quantity_factor, is_primary)
SELECT id, barcode, 'Principal', 1, 1 FROM products WHERE barcode IS NOT NULL AND barcode != '';

CREATE TABLE IF NOT EXISTS product_kits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    kit_product_id  INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS kit_items (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    kit_id               INTEGER NOT NULL REFERENCES product_kits(id) ON DELETE CASCADE,
    component_product_id INTEGER NOT NULL REFERENCES products(id),
    qty                  REAL NOT NULL DEFAULT 1,
    UNIQUE (kit_id, component_product_id)
);

CREATE TABLE IF NOT EXISTS product_batches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    lot_code    TEXT,
    expires_at  TEXT,
    qty         REAL NOT NULL DEFAULT 0,
    cost        REAL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_expires ON product_batches(expires_at);

CREATE TABLE IF NOT EXISTS stock_movements (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id   INTEGER NOT NULL REFERENCES products(id),
    batch_id     INTEGER REFERENCES product_batches(id),
    movement_type TEXT NOT NULL,
    qty          REAL NOT NULL,
    reference_type TEXT,
    reference_id   INTEGER,
    user_id      INTEGER REFERENCES users(id),
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- =============================================================================
-- Ventas: vincular cajero, sesión y facturación
-- =============================================================================
ALTER TABLE sales ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE sales ADD COLUMN cash_session_id INTEGER REFERENCES cash_sessions(id);
ALTER TABLE sales ADD COLUMN requires_fiscal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN fiscal_status TEXT DEFAULT 'none'
    CHECK (fiscal_status IN ('none', 'pending', 'completed', 'failed'));
ALTER TABLE sales ADD COLUMN voided INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN voided_at TEXT;
ALTER TABLE sales ADD COLUMN voided_by INTEGER REFERENCES users(id);

CREATE TABLE IF NOT EXISTS fiscal_documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id         INTEGER NOT NULL UNIQUE REFERENCES sales(id),
    voucher_type    TEXT NOT NULL DEFAULT 'B',
    voucher_number  TEXT,
    cae             TEXT,
    cae_expires_at  TEXT,
    qr_payload      TEXT,
    raw_response    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- =============================================================================
-- Cola de sincronización fiscal (procesada por Rust en background)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sync_queue (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type  TEXT NOT NULL,
    entity_id    INTEGER NOT NULL,
    payload      TEXT,
    status       TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);

-- Configuración adicional
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('backup_path', ''),
    ('sync_interval_secs', '30'),
    ('fiscal_enabled', '0'),
    ('current_user_id', '1');
