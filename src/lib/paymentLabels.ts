const LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
  mercado_pago: "Mercado Pago",
  mp: "Mercado Pago",
  fiado: "Fiado",
  cuenta_corriente: "Fiado",
};

export function formatPaymentMethod(method: string): string {
  const key = method.trim().toLowerCase();
  return LABELS[key] ?? method;
}
