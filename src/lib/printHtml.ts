/** Abre el diálogo de impresión (o «Guardar como PDF») con HTML formateado. */
export function printHtml(title: string, bodyHtml: string): void {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 12px;
      color: #111;
      margin: 24px;
      line-height: 1.4;
    }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .muted { color: #555; font-size: 11px; margin: 2px 0; }
    .print-header { border-bottom: 2px solid #0d9488; padding-bottom: 12px; margin-bottom: 16px; }
    .print-header__row { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
    .print-logo { max-height: 64px; max-width: 140px; object-fit: contain; }
    .print-header__text { min-width: 0; flex: 1; }
    .print-contact { margin: 4px 0 0; font-size: 11px; color: #444; line-height: 1.45; }
    .print-meta { margin-top: 4px; }
    .print-footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #ddd;
      font-size: 10px;
      color: #666;
      text-align: center;
    }
    .header { border-bottom: 2px solid #0d9488; padding-bottom: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    th { background: #f4f4f5; font-size: 11px; }
    td.num, th.num { text-align: right; }
    .totals { margin-top: 12px; text-align: right; }
    .totals .grand { font-size: 16px; font-weight: 700; }
    .notes { margin-top: 16px; padding: 10px; background: #fafafa; border: 1px solid #eee; }
    @media print {
      body { margin: 12mm; }
    }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;

  const frame = document.createElement("iframe");
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
