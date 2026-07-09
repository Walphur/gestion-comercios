import type { PrintBranding } from "../../config/printBranding";
import { escapeHtml } from "../printHtml";

function formatInstagram(handle: string): string {
  const clean = handle.trim().replace(/^@/, "");
  if (!clean) return "";
  return `@${clean}`;
}

function buildContactLines(branding: PrintBranding): string[] {
  const lines: string[] = [];
  if (branding.phone) lines.push(`Tel: ${branding.phone}`);
  if (branding.whatsapp && branding.whatsapp !== branding.phone) {
    lines.push(`WhatsApp: ${branding.whatsapp}`);
  }
  if (branding.address) lines.push(branding.address);
  const ig = formatInstagram(branding.instagram);
  if (ig) lines.push(`Instagram ${ig}`);
  if (branding.email) lines.push(branding.email);
  if (branding.website) lines.push(branding.website);
  return lines;
}

export function buildPrintHeader(
  branding: PrintBranding,
  metaLines: string[],
): string {
  const contact = buildContactLines(branding);
  const logo =
    branding.logoDataUrl && branding.showLogo
      ? `<img class="print-logo" src="${branding.logoDataUrl}" alt="" />`
      : "";

  return `
    <div class="print-header">
      <div class="print-header__row">
        ${logo}
        <div class="print-header__text">
          <h1>${escapeHtml(branding.businessName)}</h1>
          ${
            contact.length > 0
              ? `<p class="print-contact">${contact.map((l) => escapeHtml(l)).join(" · ")}</p>`
              : ""
          }
        </div>
      </div>
      <div class="print-meta">
        ${metaLines.map((line) => `<p class="muted">${escapeHtml(line)}</p>`).join("")}
      </div>
    </div>
  `;
}

export function buildPrintFooter(branding: PrintBranding): string {
  if (!branding.footer.trim()) return "";
  return `<div class="print-footer">${escapeHtml(branding.footer)}</div>`;
}
