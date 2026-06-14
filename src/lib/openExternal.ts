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

function buildWhatsAppUrl(phone: string, message?: string): string {
  const base = `https://api.whatsapp.com/send?phone=${phone}`;
  if (!message?.trim()) return base;
  return `${base}&text=${encodeURIComponent(message)}`;
}

export async function openWhatsAppShare(message: string): Promise<{ copied: boolean }> {
  const safeText = sanitizeWhatsAppText(message);
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(safeText)}`;

  if (url.length > 2000) {
    await copyToClipboard(message);
    await openExternalUrl("https://api.whatsapp.com/send");
    return { copied: true };
  }

  try {
    await openExternalUrl(url);
    return { copied: false };
  } catch {
    await copyToClipboard(message);
    await openExternalUrl("https://api.whatsapp.com/send");
    return { copied: true };
  }
}

export async function openWhatsApp(
  phone: string,
  message: string,
): Promise<{ normalized: string; copied: boolean }> {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) {
    throw new Error(
      "Teléfono inválido. Revisá el número del cliente (ej. +549 11 2345-6789).",
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
