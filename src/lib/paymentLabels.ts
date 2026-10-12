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
