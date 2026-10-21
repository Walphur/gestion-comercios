-- Celulares: unidades con IMEI/serie, garantía, precio en dólares y toma de usados.
-- Solo agrega columnas y tablas. No se sincroniza entre computadoras (el stock sí, por stock_movements).

ALTER TABLE products ADD COLUMN serialized INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN price_usd REAL;
ALTER TABLE products ADD COLUMN warranty_months_new INTEGER;
ALTER TABLE products ADD COLUMN warranty_months_used INTEGER;

CREATE TABLE IF NOT EXISTS product_units (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id           INTEGER NOT NULL,
    identifier           TEXT NOT NULL,
    identifier_kind      TEXT NOT NULL DEFAULT 'imei',
    color                TEXT,
    capacity             TEXT,
    condition            TEXT NOT NULL DEFAULT 'nuevo',
    battery_pct          INTEGER,
    cost                 REAL NOT NULL DEFAULT 0,
    price                REAL,
    status               TEXT NOT NULL DEFAULT 'in_stock',
    source               TEXT NOT NULL DEFAULT 'purchase',
    source_customer_id   INTEGER,
    source_sale_id       INTEGER,
    supplier_id          INTEGER,
    notes                TEXT,
    sale_id              INTEGER,
    sale_item_id         INTEGER,
    sold_at              TEXT,
    sold_customer_id     INTEGER,
    warranty_until       TEXT,
    reserved_customer_id INTEGER,
    reserved_deposit     REAL,
    reserved_at          TEXT,
    created_by           INTEGER,
    created_at           TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_product_units_product_status ON product_units(product_id, status);
CREATE INDEX IF NOT EXISTS idx_product_units_identifier ON product_units(identifier);
CREATE INDEX IF NOT EXISTS idx_product_units_sale ON product_units(sale_id);
CREATE INDEX IF NOT EXISTS idx_product_units_source_sale ON product_units(source_sale_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_units_active_identifier
    ON product_units(identifier) WHERE status IN ('in_stock', 'reserved');

CREATE TABLE IF NOT EXISTS product_unit_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id     INTEGER NOT NULL,
    kind        TEXT NOT NULL,
    detail      TEXT,
    sale_id     INTEGER,
    customer_id INTEGER,
    amount      REAL,
    user_id     INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_product_unit_events_unit ON product_unit_events(unit_id);
