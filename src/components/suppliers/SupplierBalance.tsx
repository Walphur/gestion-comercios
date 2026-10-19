import { formatMoney } from "../../lib/format";

/** Saldo con el proveedor: positivo = le debés, negativo = tenés a favor. */
export function SupplierBalance({
  balance,
  currency,
  large = false,
}: {
  balance: number;
  currency: string;
  large?: boolean;
}) {
  const state = balance > 0 ? "debt" : balance < 0 ? "credit" : "clear";
  const label = state === "debt" ? "Le debés" : state === "credit" ? "Tenés a favor" : "Estás al día";
  return (
    <div className={`supplier-balance supplier-balance--${state}${large ? " supplier-balance--large" : ""}`}>
      <span className="supplier-balance__label">{label}</span>
      {state !== "clear" && (
        <span className="supplier-balance__value tabular-nums">
          {formatMoney(Math.abs(balance), currency)}
        </span>
      )}
    </div>
  );
}
