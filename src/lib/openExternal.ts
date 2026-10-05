import { openUrl } from "@tauri-apps/plugin-opener";
import { normalizePhoneForWhatsApp } from "./phoneFormat";

export { normalizePhoneForWhatsApp } from "./phoneFormat";

const WHATSAPP_TEXT_MAX = 1200;

export async function openExternalUrl(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
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

/** Abre la app instalada (WhatsApp o WhatsApp Business). */
function buildWhatsAppAppUrl(phone: string | null, message?: string): string {
  const parts: string[] = [];
  if (phone) parts.push(`phone=${phone}`);
  if (message?.trim()) parts.push(`text=${encodeURIComponent(message)}`);
  const q = parts.join("&");
  return q ? `whatsapp://send?${q}` : "whatsapp://send";
}

/** Respaldo: el navegador. En Windows suele quedar detrás de la ventana de WalQo. */
function buildWhatsAppWebUrl(phone: string | null, message?: string): string {
  if (!phone) {
    const text = message?.trim() ? `?text=${encodeURIComponent(message)}` : "";
    return `https://wa.me/${text}`;
  }
  const text = message?.trim() ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${phone}${text}`;
}

async function openWhatsAppTarget(
  phone: string | null,
  message: string,
): Promise<{ copied: boolean; viaBrowser: boolean }> {
  const safeText = sanitizeWhatsAppText(message);
  const tooLong = buildWhatsAppAppUrl(phone, safeText).length > 1800;
  const text = tooLong ? undefined : safeText;
  if (tooLong) await copyToClipboard(message);

  try {
    await openUrl(buildWhatsAppAppUrl(phone, text));
    return { copied: tooLong, viaBrowser: false };
  } catch {
    await openExternalUrl(buildWhatsAppWebUrl(phone, text));
    return { copied: tooLong, viaBrowser: true };
  }
}

export async function openWhatsAppShare(
  message: string,
): Promise<{ copied: boolean; viaBrowser: boolean }> {
  return openWhatsAppTarget(null, message);
}

export async function openWhatsApp(
  phone: string,
  message: string,
): Promise<{ normalized: string; copied: boolean; viaBrowser: boolean }> {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) {
    throw new Error(
      "Teléfono inválido. Revisá el número del cliente (ej. +549 11 2345-6789).",
    );
  }
  const opened = await openWhatsAppTarget(normalized, message);
  return { normalized, ...opened };
}

export async function openEmail(to: string, subject: string, body: string): Promise<void> {
  const email = to.trim();
  if (!email.includes("@")) throw new Error("Email inválido.");
  const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await openExternalUrl(url);
}
