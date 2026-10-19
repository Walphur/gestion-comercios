-- Las búsquedas por código comparan con COLLATE NOCASE: sin estos índices SQLite recorre toda la tabla en cada escaneo.
CREATE INDEX IF NOT EXISTS idx_product_barcodes_barcode_nocase ON product_barcodes(barcode COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_products_barcode_nocase ON products(barcode COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_products_sku_nocase ON products(sku COLLATE NOCASE);
