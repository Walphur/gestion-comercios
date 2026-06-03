export function formatMoney(value: number, currency = "$"): string {
  return `${currency} ${value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatQty(value: number): string {
  return Number.isInteger(value)
    ? value.toString()
    : value.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}
