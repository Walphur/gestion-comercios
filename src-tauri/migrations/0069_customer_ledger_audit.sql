-- Historial de cuenta corriente: el cobro guarda medio, quién cobró y nota en el movimiento de saldo,
-- que es lo que viaja entre cajas (customer_payments queda solo en la PC que cobró).

ALTER TABLE customer_balance_movements ADD COLUMN payment_method TEXT;
ALTER TABLE customer_balance_movements ADD COLUMN user_name TEXT;
ALTER TABLE customer_balance_movements ADD COLUMN notes TEXT;

-- Cobros ya hechos en esta PC: mismo cliente y mismo importe para no confundir ids de otra caja.
UPDATE customer_balance_movements
SET payment_method = (
      SELECT p.payment_method FROM customer_payments p
      WHERE p.id = customer_balance_movements.reference_id
        AND p.customer_id = customer_balance_movements.customer_id
        AND ABS(p.amount + customer_balance_movements.delta) < 0.005
    ),
    user_name = (
      SELECT u.display_name FROM customer_payments p JOIN users u ON u.id = p.user_id
      WHERE p.id = customer_balance_movements.reference_id
        AND p.customer_id = customer_balance_movements.customer_id
        AND ABS(p.amount + customer_balance_movements.delta) < 0.005
    ),
    notes = (
      SELECT p.notes FROM customer_payments p
      WHERE p.id = customer_balance_movements.reference_id
        AND p.customer_id = customer_balance_movements.customer_id
        AND ABS(p.amount + customer_balance_movements.delta) < 0.005
    )
WHERE reference_type = 'customer_payment';

-- Cobros y movimientos de saldo no se editan ni se borran: una corrección es un movimiento nuevo.
CREATE TRIGGER IF NOT EXISTS trg_customer_payments_no_update
BEFORE UPDATE ON customer_payments
BEGIN
  SELECT RAISE(ABORT, 'Los cobros de cuenta corriente no se pueden modificar.');
END;

CREATE TRIGGER IF NOT EXISTS trg_customer_payments_no_delete
BEFORE DELETE ON customer_payments
WHEN COALESCE((SELECT value FROM settings WHERE key = 'qa_ledger_purge'), '0') != '1'
BEGIN
  SELECT RAISE(ABORT, 'Los cobros de cuenta corriente no se pueden borrar.');
END;

CREATE TRIGGER IF NOT EXISTS trg_customer_balance_movements_no_update
BEFORE UPDATE ON customer_balance_movements
BEGIN
  SELECT RAISE(ABORT, 'Los movimientos de cuenta corriente no se pueden modificar.');
END;

CREATE TRIGGER IF NOT EXISTS trg_customer_balance_movements_no_delete
BEFORE DELETE ON customer_balance_movements
WHEN COALESCE((SELECT value FROM settings WHERE key = 'qa_ledger_purge'), '0') != '1'
BEGIN
  SELECT RAISE(ABORT, 'Los movimientos de cuenta corriente no se pueden borrar.');
END;
