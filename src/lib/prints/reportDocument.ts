import { escapeHtml, printHtml } from "../printHtml";

export interface PrintableTable {
  heading?: string;
  columns: { label: string; num?: boolean }[];
  rows: string[][];
}

export interface PrintableReport {
  title: string;
  /** Período, alcance, cajero… */
  subtitle: string;
  summary: { label: string; value: string; grand?: boolean }[];
  tables?: PrintableTable[];
  notes?: string[];
}

function tableHtml(t: PrintableTable): string {
  const head = t.columns
    .map((c) => `<th${c.num ? ' class="num"' : ""}>${escapeHtml(c.label)}</th>`)
    .join("");
  const body = t.rows.length
    ? t.rows
        .map(
          (r) =>
            `<tr>${r
              .map((cell, i) => `<td${t.columns[i]?.num ? ' class="num"' : ""}>${escapeHtml(cell)}</td>`)
              .join("")}</tr>`,
        )
        .join("")
    : `<tr><td colspan="${t.columns.length}">Sin datos</td></tr>`;
  return `${t.heading ? `<h2 class="report-h2">${escapeHtml(t.heading)}</h2>` : ""}
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Imprime (o guarda en PDF) el reporte que se está viendo. */
export function printReport(businessName: string, report: PrintableReport): void {
  const summary = report.summary.length
    ? `<div class="totals">${report.summary
        .map((s) => `<p${s.grand ? ' class="grand"' : ""}>${escapeHtml(s.label)}: ${escapeHtml(s.value)}</p>`)
        .join("")}</div>`
    : "";
  const tables = (report.tables ?? []).map(tableHtml).join("");
  const notes = report.notes?.length
    ? `<div class="notes">${report.notes.map((n) => `<p>${escapeHtml(n)}</p>`).join("")}</div>`
    : "";

  const body = `
    <div class="print-header">
      <span class="doc-badge">Reporte</span>
      <h1>${escapeHtml(report.title)}</h1>
      <p class="muted">${escapeHtml(businessName)} · ${escapeHtml(report.subtitle)}</p>
    </div>
    ${summary}
    ${tables}
    ${notes}
  `;
  printHtml(
    `${report.title} — ${businessName}`,
    body,
    `.report-h2 { font-size: 13px; margin: 18px 0 0; } .notes p { margin: 2px 0; }`,
  );
}
