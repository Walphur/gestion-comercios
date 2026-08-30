-- Referencias de cobro Payway / Prisma QR (intención y pago aprobado).
ALTER TABLE sales ADD COLUMN payway_payment_id TEXT;
ALTER TABLE sales ADD COLUMN payway_intention_id TEXT;
