-- Integración Tienda Nube / Nuvemshop: vínculo producto↔variante + cola de stock + órdenes ya aplicadas.
ALTER TABLE products ADD COLUMN tn_product_id INTEGER;
ALTER TABLE products ADD COLUMN tn_variant_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_products_tn_variant
  ON products(tn_variant_id)
  WHERE tn_variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_tn_product
  ON products(tn_product_id)
  WHERE tn_product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tn_stock_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  tn_product_id INTEGER NOT NULL,
  tn_variant_id INTEGER NOT NULL,
  stock REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS tn_synced_orders (
  tn_order_id INTEGER PRIMARY KEY,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);
