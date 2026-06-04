-- Fecha de vencimiento opcional por producto (alertas en Stock / Inicio)
ALTER TABLE products ADD COLUMN expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_products_expires ON products(expires_at);
