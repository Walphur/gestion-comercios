/** Abre el diálogo de impresión (o «Guardar como PDF») con HTML formateado. */
export function printHtml(title: string, bodyHtml: string, extraCss = ""): void {
  const printedAt = new Date();
  const dateLabel = printedAt.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeLabel = printedAt.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const css = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const brand =
    css?.getPropertyValue("--color-brand-600").trim() ||
    css?.getPropertyValue("--user-brand-primary").trim() ||
    "#2563eb";
  const brandDark = css?.getPropertyValue("--color-brand-700").trim() || brand;
  const brandSoft = css?.getPropertyValue("--color-brand-100").trim() || "#dbeafe";
  const brandBorder = css?.getPropertyValue("--color-brand-200").trim() || "#bfdbfe";
  const brandTint = css?.getPropertyValue("--color-brand-50").trim() || "#eff6ff";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title || "Documento")}</title>
  <style>
    @page { margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: #0f172a;
      margin: 0;
      padding: 20px 24px 28px;
      line-height: 1.45;
      background: #fff;
    }
    .print-when {
      margin: 0 0 14px;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.02em;
      color: #64748b;
      text-align: right;
    }
    .print-chrome-hint {
      display: none;
    }
    @media screen {
      .print-chrome-hint {
        display: block;
        margin: 0 0 12px;
        padding: 8px 10px;
        border-radius: 8px;
        background: ${brandTint};
        border: 1px solid ${brandBorder};
        color: ${brandDark};
        font-size: 11px;
        text-align: center;
      }
    }
    h1 {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 18px;
      margin: 0 0 2px;
      letter-spacing: -0.02em;
      font-weight: 700;
      color: #0f172a;
    }
    .muted { color: #64748b; font-size: 11px; margin: 2px 0; }
    .print-header {
      border-bottom: none;
      margin-bottom: 20px;
      background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
      border-radius: 12px;
      padding: 16px 18px 14px;
      border: 1px solid #e2e8f0;
    }
    .print-header__row { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
    .print-logo { max-height: 64px; max-width: 160px; object-fit: contain; }
    .print-header__text { min-width: 0; flex: 1; }
    .print-contact { margin: 6px 0 0; font-size: 11px; color: #475569; line-height: 1.5; }
    .print-meta {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 2px solid ${brand};
    }
    .print-meta p { font-weight: 600; color: ${brandDark}; font-size: 12px; }
    .print-footer {
      margin-top: 24px;
      padding: 12px 14px;
      border-top: none;
      border-radius: 8px;
      background: #f1f5f9;
      font-size: 10px;
      color: #475569;
      text-align: center;
    }
    .header { border-bottom: 2px solid ${brand}; padding-bottom: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 14px 0; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; }
    th, td { border: none; border-bottom: 1px solid #e2e8f0; padding: 9px 12px; text-align: left; }
    th { background: ${brandDark}; color: #fff; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals {
      margin-top: 16px;
      text-align: right;
      padding: 14px 16px;
      background: linear-gradient(135deg, ${brandTint}, #fff);
      border: 1px solid ${brandBorder};
      border-radius: 12px;
    }
    .totals p { margin: 4px 0; color: #334155; }
    .totals .grand { font-size: 18px; font-weight: 800; color: ${brandDark}; letter-spacing: -0.02em; }
    .notes { margin-top: 16px; padding: 12px 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; color: #78350f; }
    .doc-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${brandDark};
      background: ${brandSoft};
      padding: 3px 8px;
      border-radius: 999px;
      margin-bottom: 8px;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .print-header { break-inside: avoid; }
      .print-chrome-hint { display: none !important; }
    }
    ${extraCss}
  </style>
</head>
<body>
  <p class="print-chrome-hint">
    Tip: en el diálogo de impresión, desactivá «Encabezados y pies de página» para ocultar la URL de Tauri y el encabezado del sistema.
  </p>
  <p class="print-when">${escapeHtml(dateLabel)} · ${escapeHtml(timeLabel)}</p>
  ${bodyHtml}
</body>
</html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("title", title || "Documento");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "none";
  document.body.appendChild(frame);

  const doc = frame.contentDocument ?? frame.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(frame);
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => document.body.removeChild(frame), 1000);
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { escapeHtml };
