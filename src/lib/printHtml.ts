/** Abre el diálogo de impresión (o «Guardar como PDF») con HTML formateado. */
export function printHtml(title: string, bodyHtml: string, extraCss = ""): void {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: #0f172a;
      margin: 0;
      padding: 28px 32px;
      line-height: 1.45;
      background: #fff;
    }
    h1 { font-size: 20px; margin: 0 0 2px; letter-spacing: -0.02em; font-weight: 700; color: #0f172a; }
    .muted { color: #64748b; font-size: 11px; margin: 2px 0; }
    .print-header {
      border-bottom: none;
      padding-bottom: 0;
      margin-bottom: 20px;
      background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
      border-radius: 12px;
      padding: 16px 18px 14px;
      border: 1px solid #e2e8f0;
    }
    .print-header__row { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
    .print-logo { max-height: 72px; max-width: 150px; object-fit: contain; }
    .print-header__text { min-width: 0; flex: 1; }
    .print-contact { margin: 6px 0 0; font-size: 11px; color: #475569; line-height: 1.5; }
    .print-meta {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 2px solid #0d9488;
    }
    .print-meta p { font-weight: 600; color: #0f766e; font-size: 12px; }
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
    .header { border-bottom: 2px solid #0d9488; padding-bottom: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 14px 0; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; }
    th, td { border: none; border-bottom: 1px solid #e2e8f0; padding: 9px 12px; text-align: left; }
    th { background: #0f766e; color: #fff; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals {
      margin-top: 16px;
      text-align: right;
      padding: 14px 16px;
      background: linear-gradient(135deg, #ecfdf5, #f0fdfa);
      border: 1px solid #99f6e4;
      border-radius: 12px;
    }
    .totals p { margin: 4px 0; color: #334155; }
    .totals .grand { font-size: 18px; font-weight: 800; color: #0f766e; letter-spacing: -0.02em; }
    .notes { margin-top: 16px; padding: 12px 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; color: #78350f; }
    .doc-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0f766e;
      background: #ccfbf1;
      padding: 3px 8px;
      border-radius: 999px;
      margin-bottom: 8px;
    }
    @media print {
      body { margin: 0; padding: 12mm; }
      .print-header { break-inside: avoid; }
    }
    ${extraCss}
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
