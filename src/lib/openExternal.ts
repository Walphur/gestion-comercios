import { openUrl } from "@tauri-apps/plugin-opener";

const WHATSAPP_TEXT_MAX = 1200;

export async function openExternalUrl(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Formato WhatsApp Argentina: 549 + área + número (13 dígitos).
 * Ej: 11 2345-6789 → 5491123456789
 * Ej: +54 11 2345-6789 (sin el 9) → 5491123456789
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

/** Quita emojis y acorta el texto para que wa.me no falle con URLs largas. */
export function sanitizeWhatsAppText(message: string): string {
  const plain = message
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (plain.length <= WHATSAPP_TEXT_MAX) return plain;
  return `${plain.slice(0, WHATSAPP_TEXT_MAX - 3)}...`;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function buildWhatsAppUrl(phone: string, message?: string): string {
  const base = `https://api.whatsapp.com/send?phone=${phone}`;
  if (!message?.trim()) return base;
  return `${base}&text=${encodeURIComponent(message)}`;
}

export async function openWhatsApp(
  phone: string,
  message: string,
): Promise<{ normalized: string; copied: boolean }> {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) {
    throw new Error(
      "Teléfono inválido. Usá formato argentino: 11 2345-6789 o +54 9 11 2345-6789",
    );
  }

  const safeText = sanitizeWhatsAppText(message);
  let url = buildWhatsAppUrl(normalized, safeText);

  if (url.length > 2000) {
    await copyToClipboard(message);
    url = buildWhatsAppUrl(normalized);
    await openExternalUrl(url);
    return { normalized, copied: true };
  }

  try {
    await openExternalUrl(url);
    return { normalized, copied: false };
  } catch {
    await copyToClipboard(message);
    await openExternalUrl(buildWhatsAppUrl(normalized));
    return { normalized, copied: true };
  }
}

export async function openEmail(to: string, subject: string, body: string): Promise<void> {
  const email = to.trim();
  if (!email.includes("@")) throw new Error("Email inválido.");
  const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await openExternalUrl(url);
}
