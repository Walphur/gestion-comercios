-- PLU de balanza (Kretz y similares): mismo número que en la balanza para etiquetas EAN-13.
ALTER TABLE products ADD COLUMN scale_plu TEXT;

CREATE INDEX IF NOT EXISTS idx_products_scale_plu ON products(scale_plu);
