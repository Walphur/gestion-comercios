-- 1 = resta stock al vender; 0 = elaborado al momento (hamburguesa, plato, etc.).
ALTER TABLE products ADD COLUMN track_stock INTEGER NOT NULL DEFAULT 1;
