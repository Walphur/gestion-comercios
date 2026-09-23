-- Stock mínimo por variante (indumentaria / talle-color).
ALTER TABLE product_variants ADD COLUMN min_stock REAL NOT NULL DEFAULT 0;
