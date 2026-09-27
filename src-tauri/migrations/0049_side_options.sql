-- Guarniciones: un extra puede apuntar a un producto (ensalada, papas)
-- y al vender se descuenta su stock. side_json guarda la elección por ítem de venta.
ALTER TABLE product_modifiers ADD COLUMN linked_product_id INTEGER;
ALTER TABLE product_modifiers ADD COLUMN qty REAL NOT NULL DEFAULT 1;
ALTER TABLE sale_items ADD COLUMN side_json TEXT;
