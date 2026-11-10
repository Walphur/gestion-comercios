-- Detalle libre de la venta (p. ej. quién retiró la mercadería en una cuenta corriente).
-- No interviene en totales, stock ni pagos.
ALTER TABLE sales ADD COLUMN note TEXT;
