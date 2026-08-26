/** Extrae el código de caja del número de documento (p. ej. CJ01-V-00000042 → CJ01). */
export function parseDeviceCodeFromDocNumber(
  docNumber: string | null | undefined,
): string | null {
  if (!docNumber?.trim()) return null;
  const idx = docNumber.indexOf("-V-");
  if (idx <= 0) return null;
  return docNumber.slice(0, idx).trim().toUpperCase();
}

export function formatSaleRegisterLabel(sale: {
  device_name?: string | null;
  device_code?: string | null;
  doc_number?: string | null;
}): string {
  const name = sale.device_name?.trim();
  if (name) return name;
  const code =
    sale.device_code?.trim().toUpperCase() ||
    parseDeviceCodeFromDocNumber(sale.doc_number);
  return code || "—";
}
