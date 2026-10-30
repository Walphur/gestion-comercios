/**
 * Condición SQL (sobre `customer_payments` sin alias) para dejar afuera los cobros anulados.
 * La anulación es un movimiento `payment_void` de la cuenta corriente que apunta al cobro.
 */
export const PAYMENT_NOT_VOIDED_SQL = `NOT EXISTS (
  SELECT 1 FROM customer_balance_movements pv
  WHERE pv.reason = 'payment_void' AND pv.reference_type = 'customer_payment'
    AND pv.reference_id = customer_payments.id AND pv.customer_id = customer_payments.customer_id
    AND ABS(pv.delta - customer_payments.amount) < 0.005
)`;
