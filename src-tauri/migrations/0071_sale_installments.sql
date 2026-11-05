-- Cuotas de la tarjeta de crédito (1, 3 o 6). NULL en cualquier otro medio.
-- payment_method sigue siendo 'crédito': reportes, caja y Tesorería no cambian.
ALTER TABLE sales ADD COLUMN installments INTEGER;
