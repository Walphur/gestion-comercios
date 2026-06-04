-- Origen del producto (supermercado = catálogo masivo importado)
ALTER TABLE products ADD COLUMN catalog_source TEXT;

CREATE INDEX IF NOT EXISTS idx_products_catalog_source ON products(catalog_source);
