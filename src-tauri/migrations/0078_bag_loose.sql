-- Bolsa / suelto: un producto con precio de bolsa y precio por kg suelto.
-- stock = bolsas cerradas; open_bag_kg = kilos que quedan de la bolsa abierta.
-- sale_mode en la línea: 'bag' | 'loose' (NULL = venta normal).

ALTER TABLE products ADD COLUMN sell_loose INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN loose_price_per_kg REAL;
ALTER TABLE products ADD COLUMN bag_kg REAL;
ALTER TABLE products ADD COLUMN open_bag_kg REAL NOT NULL DEFAULT 0;

ALTER TABLE sale_items ADD COLUMN sale_mode TEXT;
ALTER TABLE sale_items ADD COLUMN bags_opened INTEGER NOT NULL DEFAULT 0;
