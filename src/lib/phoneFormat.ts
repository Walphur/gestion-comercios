/**
 * Teléfonos móviles Argentina para WhatsApp: 549 + área + número (13 dígitos).
 */

export function normalizePhoneForWhatsApp(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;

  while (digits.startsWith("0")) digits = digits.slice(1);

  if (digits.startsWith("54")) {
    if (digits.startsWith("549") && digits.length >= 12) return digits;
    const local = digits.slice(2);
    if (local.startsWith("9") && local.length >= 10) return digits;
    if (local.startsWith("15") && local.length >= 10) {
      return `549${local.slice(2)}`;
    }
    return `549${local}`;
  }

  if (digits.startsWith("15") && digits.length >= 10) {
    return `549${digits.slice(2)}`;
  }

  if (digits.length === 10) return `549${digits}`;

  if (digits.length >= 11 && digits.length <= 13) return digits;

  return null;
}

/** ¿El usuario ingresó un número internacional que no es Argentina? */
export function isNonArgentinaPhoneInput(phone: string): boolean {
  const raw = phone.trim();
  if (!raw.startsWith("+")) return false;
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 && !digits.startsWith("54");
}

/** Guarda con prefijo +549 formateado. Si empieza con + y no es AR, deja el valor manual. */
export function formatPhoneArgentina(phone: string | null | undefined): string | null {
  const raw = phone?.trim();
  if (!raw) return null;

  if (isNonArgentinaPhoneInput(raw)) return raw;

  if (raw.startsWith("+") || raw.replace(/\D/g, "").startsWith("54")) {
    const wa = normalizePhoneForWhatsApp(raw);
    return wa ? formatPhoneDisplay(wa) : raw;
  }

  const wa = normalizePhoneForWhatsApp(raw);
  if (!wa) return raw;
  return formatPhoneDisplay(wa);
}

/** Muestra +549 11 2345-6789 a partir de dígitos 549... */
export function formatPhoneDisplay(digits549: string): string {
  if (!digits549.startsWith("549")) return `+${digits549}`;
  const local = digits549.slice(3);
  if (local.length === 10) {
    return `+549 ${local.slice(0, 2)} ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return `+549 ${local}`;
}

/** Para el campo de edición: solo parte local si es número argentino. */
export function phoneToLocalDisplay(stored: string | null | undefined): string {
  if (!stored?.trim()) return "";
  if (isNonArgentinaPhoneInput(stored)) return stored;

  const wa = normalizePhoneForWhatsApp(stored);
  if (!wa || !wa.startsWith("549")) return stored;

  const local = wa.slice(3);
  if (local.length === 10) {
    return `${local.slice(0, 2)} ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return local;
}

export function isArgentinaStoredPhone(stored: string | null | undefined): boolean {
  if (!stored?.trim()) return true;
  if (isNonArgentinaPhoneInput(stored)) return false;
  return normalizePhoneForWhatsApp(stored) !== null;
}
