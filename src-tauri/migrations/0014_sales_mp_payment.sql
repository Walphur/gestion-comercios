-- Referencias de cobro Mercado Pago QR (orden y pago aprobado).
ALTER TABLE sales ADD COLUMN mp_order_id TEXT;
ALTER TABLE sales ADD COLUMN mp_payment_id TEXT;
