-- Precio de lista (antes) para mostrar el descuento en la tienda web. No cambia lo que se cobra.
-- list_price en pesos; list_price_usd en dólares para los productos con precio en US$.

ALTER TABLE products ADD COLUMN list_price REAL;
ALTER TABLE products ADD COLUMN list_price_usd REAL;
