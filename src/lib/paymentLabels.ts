const LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  débito: "Débito",
  debito: "Débito",
  crédito: "Crédito",
  credito: "Crédito",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  qr: "QR",
  mercadopago: "Mercado Pago",
  payway: "Payway QR",
  mercado_pago: "Mercado Pago",
  mp: "Mercado Pago",
  fiado: "Fiado",
  cuenta_corriente: "Fiado",
};

export function formatPaymentMethod(method: string): string {
  const key = method.trim().toLowerCase();
  return LABELS[key] ?? method;
}

/** «Crédito · 3 cuotas» cuando la venta va en cuotas; si no, el medio solo. */
export function formatSalePayment(method: string, installments?: number | null): string {
  const label = formatPaymentMethod(method);
  const credit = method.trim().toLowerCase() === "crédito";
  return credit && installments != null && installments > 1 ? `${label} · ${installments} cuotas` : label;
}
