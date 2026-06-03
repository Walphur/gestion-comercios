-- Configuración general del comercio (clave/valor)
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT
);

-- Rubros / categorías de productos
CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Productos
CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sku          TEXT,
    barcode      TEXT,
    name         TEXT NOT NULL,
    description  TEXT,
    category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    cost         REAL NOT NULL DEFAULT 0,
    price        REAL NOT NULL DEFAULT 0,
    stock        REAL NOT NULL DEFAULT 0,
    min_stock    REAL NOT NULL DEFAULT 0,
    unit         TEXT NOT NULL DEFAULT 'unidad',
    tax_rate     REAL NOT NULL DEFAULT 21,
    has_variants INTEGER NOT NULL DEFAULT 0,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Variantes (talle/color para ropa, etc.)
CREATE TABLE IF NOT EXISTS product_variants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attributes TEXT,
    sku        TEXT,
    barcode    TEXT,
    price      REAL,
    stock      REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

-- Valores de configuración por defecto
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('rubro', 'general'),
    ('business_name', 'Mi Comercio'),
    ('admin_pin', '1234'),
    ('currency', '$'),
    ('feature_overrides', '{}');
