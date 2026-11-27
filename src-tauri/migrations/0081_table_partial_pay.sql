-- Cobro parcial de mesa (estilo fu.do): marcar ítems pagados sin cerrar toda la cuenta.
-- paid_sale_id apunta a la venta POS de ese cobro; la mesa sigue abierta si queda algo sin pagar.

ALTER TABLE table_order_items ADD COLUMN paid_sale_id INTEGER;
ALTER TABLE table_order_items ADD COLUMN paid_at TEXT;

CREATE INDEX IF NOT EXISTS idx_table_order_items_paid_sale
    ON table_order_items(paid_sale_id)
    WHERE paid_sale_id IS NOT NULL;
