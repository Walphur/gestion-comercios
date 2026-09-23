-- Deliverys: dirección y cadete asignado en pedidos POS.
ALTER TABLE sales ADD COLUMN delivery_address TEXT;
ALTER TABLE sales ADD COLUMN delivery_rider TEXT;
ALTER TABLE sales ADD COLUMN delivery_dispatched_at TEXT;
