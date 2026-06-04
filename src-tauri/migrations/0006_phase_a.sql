-- Movimientos de caja (ingresos / egresos)
CREATE TABLE IF NOT EXISTS cash_movements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    cash_session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
    user_id         INTEGER REFERENCES users(id),
    type            TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount          REAL NOT NULL CHECK (amount > 0),
    concept         TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(cash_session_id);

-- Búsqueda rápida de productos (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
    name,
    barcode,
    sku,
    content='products',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

INSERT INTO products_fts(rowid, name, barcode, sku)
SELECT id, name, COALESCE(barcode, ''), COALESCE(sku, '')
FROM products WHERE active = 1;

CREATE TRIGGER IF NOT EXISTS products_fts_ai AFTER INSERT ON products
WHEN new.active = 1
BEGIN
    INSERT INTO products_fts(rowid, name, barcode, sku)
    VALUES (new.id, new.name, COALESCE(new.barcode, ''), COALESCE(new.sku, ''));
END;

CREATE TRIGGER IF NOT EXISTS products_fts_ad AFTER DELETE ON products
BEGIN
    INSERT INTO products_fts(products_fts, rowid, name, barcode, sku)
    VALUES ('delete', old.id, old.name, COALESCE(old.barcode, ''), COALESCE(old.sku, ''));
END;

CREATE TRIGGER IF NOT EXISTS products_fts_au AFTER UPDATE ON products
BEGIN
    INSERT INTO products_fts(products_fts, rowid, name, barcode, sku)
    VALUES ('delete', old.id, old.name, COALESCE(old.barcode, ''), COALESCE(old.sku, ''));
    INSERT INTO products_fts(rowid, name, barcode, sku)
    SELECT new.id, new.name, COALESCE(new.barcode, ''), COALESCE(new.sku, '')
    WHERE new.active = 1;
END;
