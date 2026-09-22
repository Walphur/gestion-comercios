-- Pedidos para llevar / delivery (aviso WhatsApp manual con wa.me).
ALTER TABLE sales ADD COLUMN order_type TEXT NOT NULL DEFAULT 'counter';
ALTER TABLE sales ADD COLUMN pickup_name TEXT;
ALTER TABLE sales ADD COLUMN pickup_phone TEXT;
ALTER TABLE sales ADD COLUMN order_ready_at TEXT;
