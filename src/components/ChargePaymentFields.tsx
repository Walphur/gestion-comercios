import { useEffect, useState } from "react";
import { Input, Select } from "./ui";
import { formatMoney } from "../lib/format";
import { formatPaymentMethod } from "../lib/paymentLabels";
import { activeQrPaymentIds, loadQrProviders, type QrPaymentProvider } from "../lib/posQrProviders";
import {
  applyPaymentSurcharge,
  CREDIT_INSTALLMENTS,
  CREDIT_METHOD,
  loadPaymentSurcharges,
  surchargePctForMethod,
  type PaymentSurchargeMap,
} from "../lib/paymentSurcharges";

export interface ChargeMethodOption {
  id: string;
  label: string;
}

/** Medios para cobrar una orden o un presupuesto: los manuales del POS y fiado si hay cliente. */
export function useChargePaymentOptions(withFiado: boolean) {
  const [providers, setProviders] = useState<QrPaymentProvider[]>([]);
  const [surcharges, setSurcharges] = useState<PaymentSurchargeMap>({});

  useEffect(() => {
    void loadQrProviders().then(setProviders).catch(() => setProviders([]));
    void loadPaymentSurcharges().then(setSurcharges).catch(() => setSurcharges({}));
  }, []);

  const qrIds = activeQrPaymentIds(providers);
  const methods: ChargeMethodOption[] = [
    { id: "efectivo", label: "Efectivo" },
    { id: "débito", label: "Débito" },
    { id: CREDIT_METHOD, label: "Crédito" },
    { id: "transferencia", label: "Transferencia" },
    ...qrIds.map((id) => ({
      id,
      label: providers.find((p) => p.id === id)?.label || formatPaymentMethod(id),
    })),
    ...(withFiado ? [{ id: "fiado", label: "Fiado / cuenta corriente" }] : []),
  ];
  return { methods, surcharges };
}

interface Props {
  subtotal: number;
  discountPct: number;
  total: number;
  currency: string;
  methods: ChargeMethodOption[];
  surcharges: PaymentSurchargeMap;
  payment: string;
  onPaymentChange: (method: string) => void;
  installments: number;
  onInstallmentsChange: (n: number) => void;
  paid: number | "";
  onPaidChange: (paid: number | "") => void;
  paidLabel?: string;
}

/** Medio de pago, cuotas con crédito y total con el recargo que se va a cobrar. */
export default function ChargePaymentFields({
  subtotal,
  discountPct,
  total,
  currency,
  methods,
  surcharges,
  payment,
  onPaymentChange,
  installments,
  onInstallmentsChange,
  paid,
  onPaidChange,
  paidLabel = "Paga con",
}: Props) {
  const isCredit = payment === CREDIT_METHOD;
  const surcharge = surchargePctForMethod(surcharges, payment, isCredit ? installments : null);
  const charged = applyPaymentSurcharge(subtotal, discountPct, total, surcharge);
  const cuotas = isCredit && installments > 1 ? installments : 0;

  return (
    <div className="min-w-0 space-y-3">
      <div className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2">
        <p className="text-sm text-ink-muted">
          Total a cobrar:{" "}
          <strong className="text-ink" data-testid="charge-total">
            {formatMoney(charged.total, currency)}
          </strong>
        </p>
        {surcharge > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">Incluye recargo de {surcharge}%</p>
        )}
        {cuotas > 0 && (
          <p className="text-sm font-medium text-ink" data-testid="charge-installments-detail">
            {cuotas} cuotas de {formatMoney(charged.total / cuotas, currency)}
          </p>
        )}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Pago"
          value={payment}
          onChange={(e) => onPaymentChange(e.target.value)}
          data-testid="charge-payment"
        >
          {methods.map((m) => {
            const pct = surchargePctForMethod(surcharges, m.id);
            return (
              <option key={m.id} value={m.id}>
                {pct > 0 ? `${m.label} (+${pct}%)` : m.label}
              </option>
            );
          })}
        </Select>
        {payment === "efectivo" && (
          <Input
            label={paidLabel}
            type="number"
            value={paid}
            onChange={(e) => onPaidChange(e.target.value === "" ? "" : Number(e.target.value))}
          />
        )}
      </div>
      {isCredit && (
        <CreditInstallmentsPicker
          value={installments}
          onChange={onInstallmentsChange}
          surcharges={surcharges}
        />
      )}
    </div>
  );
}

export function CreditInstallmentsPicker({
  value,
  onChange,
  surcharges,
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  surcharges: PaymentSurchargeMap;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="field-label">Cuotas</span>
      <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Cuotas">
        {CREDIT_INSTALLMENTS.map((n) => {
          const selected = value === n;
          const pct = surchargePctForMethod(surcharges, CREDIT_METHOD, n);
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(n)}
              className={`min-w-0 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                selected
                  ? "border-brand-500 bg-brand-500/15 text-brand-700 dark:text-brand-200"
                  : "border-[var(--color-panel-border)] bg-[var(--color-input-bg)] text-ink hover:border-brand-300"
              }`}
            >
              {n === 1 ? "1 pago" : `${n} cuotas`}
              {pct > 0 && (
                <span className="ml-1 text-xs font-medium text-amber-700 dark:text-amber-300">+{pct}%</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
