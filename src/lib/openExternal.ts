import { openUrl } from "@tauri-apps/plugin-opener";

export async function openExternalUrl(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Normaliza teléfono argentino para wa.me (ej. 11 2345-6789 → 5491123456789). */
export function normalizePhoneForWhatsApp(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("54") && digits.length >= 12) return digits;
  if (digits.length === 10 && digits.startsWith("11")) return `549${digits}`;
  if (digits.length === 11 && digits.startsWith("15")) return `54911${digits.slice(3)}`;
  if (digits.length === 10) return `549${digits}`;
  return digits.length >= 8 ? `54${digits}` : null;
}

export async function openWhatsApp(phone: string, message: string): Promise<void> {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) throw new Error("Teléfono inválido para WhatsApp.");
  const url = `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
  await openExternalUrl(url);
}

export async function openEmail(to: string, subject: string, body: string): Promise<void> {
  const email = to.trim();
  if (!email.includes("@")) throw new Error("Email inválido.");
  const url = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await openExternalUrl(url);
}
