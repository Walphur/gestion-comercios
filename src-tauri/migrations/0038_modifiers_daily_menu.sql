-- Extras / modificadores por producto (ej. extra queso, sin cebolla).
CREATE TABLE IF NOT EXISTS product_modifiers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    price_delta REAL NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_product_modifiers_product
  ON product_modifiers(product_id);

-- Destacar como menú del día en el POS.
ALTER TABLE products ADD COLUMN is_daily_menu INTEGER NOT NULL DEFAULT 0;
