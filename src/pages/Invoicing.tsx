import { Fragment, useEffect, useState } from "react";
import { AlertTriangle, Copy, Check, FileText, RefreshCw, Inbox, ReceiptText } from "lucide-react";
import { PageHeader, Button, Card, PageContent, EmptyState } from "../components/ui";
import {
  getConnectionStatus,
  fiscalListarDocumentos,
  fiscalReintentarFallidos,
  type SyncStatusDto,
  type FiscalDocResumen,
} from "../lib/tauri";
import { showUserError, showUserSuccess } from "../lib/notice";
import { countSyncByStatus, listSyncQueue, type SyncQueueRow } from "../db/fiscal";
import { getSetting } from "../db/settings";
import { formatMoney } from "../lib/format";
import { useAppConfig } from "../context/AppConfig";
import { buildFiscalErrorReport, parseFiscalError } from "../lib/fiscalErrorHelp";
import { copyToClipboard } from "../lib/openExternal";
import { resolveAppVersion } from "../lib/appVersion";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  PROCESSING: "Enviando…",
  FAILED: "Error",
};

const CBTE_LABEL: Record<number, string> = {
  1: "Factura A",
  6: "Factura B",
  11: "Factura C",
};

function comprobanteLabel(doc: FiscalDocResumen): string {
  const tipo = CBTE_LABEL[doc.cbte_tipo] ?? doc.voucher_type ?? "Comprobante";
  if (doc.cbte_nro > 0) {
    return `${tipo} N° ${String(doc.cbte_nro).padStart(8, "0")}`;
  }
  return tipo;
}

function connectionSummary(conn: SyncStatusDto | null): string {
  if (!conn) return "—";
  if (conn.online) {
    return conn.pending_count > 0 ? "Conectado · enviando" : "Conectado";
  }
  return conn.pending_count > 0 ? "Sin internet · en espera" : "Sin internet";
}

function formatQueueDate(iso: string): string {
  const d = iso.replace("T", " ").slice(0, 16);
  return d;
}

function FiscalErrorCard({ saleId, raw }: { saleId: number; raw: string }) {
  const [copied, setCopied] = useState(false);
  const info = parseFiscalError(raw);

  async function copyReport() {
    const version = await resolveAppVersion().catch(() => undefined);
    await copyToClipboard(buildFiscalErrorReport({ saleId, raw, appVersion: version }));
    setCopied(true);
    showUserSuccess("Reporte copiado. Pegalo en WhatsApp o mail para soporte.");
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {info.code && (
                <span className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                  Código {info.code}
                </span>
              )}
              <p className="font-semibold text-red-800 dark:text-red-200">{info.title}</p>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-red-700 dark:text-red-300">{info.summary}</p>
            <p className="mt-2 text-xs leading-relaxed text-red-600/90 dark:text-red-300/90">
              <span className="font-semibold">Qué hacer: </span>
              {info.hint}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void copyReport()} className="shrink-0">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copiado" : "Copiar para soporte"}
        </Button>
      </div>
    </div>
  );
}

export default function Invoicing() {
  const { currency } = useAppConfig();
  const [fiscalOn, setFiscalOn] = useState(false);
  const [conn, setConn] = useState<SyncStatusDto | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [queue, setQueue] = useState<SyncQueueRow[]>([]);
  const [docs, setDocs] = useState<FiscalDocResumen[]>([]);

  async function reload() {
    const [f, c, q, cnt, d] = await Promise.all([
      getSetting("fiscal_enabled"),
      getConnectionStatus(),
      listSyncQueue(40),
      countSyncByStatus(),
      fiscalListarDocumentos(200).catch(() => [] as FiscalDocResumen[]),
    ]);
    setFiscalOn(f === "1");
    setConn(c);
    setQueue(q.filter((row) => row.status !== "COMPLETED"));
    setCounts(cnt);
    setDocs(d);
  }

  useEffect(() => {
    reload();
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, []);

  const queueCount = (counts.PENDING ?? 0) + (counts.PROCESSING ?? 0);
  const failedCount = counts.FAILED ?? 0;

  async function retryFailed() {
    try {
      const n = await fiscalReintentarFallidos();
      showUserSuccess(
        n > 0
          ? `Se volvieron a intentar ${n} factura(s). En unos segundos deberían emitirse si todo está bien.`
          : "No hay facturas con error para reintentar.",
      );
      await reload();
    } catch (e) {
      showUserError(e);
    }
  }

  return (
    <div>
      <PageHeader
        title="Facturación electrónica"
        subtitle="Estado de tus comprobantes y facturas pendientes"
        actions={
          <div className="flex items-center gap-2">
            {failedCount > 0 && (
              <Button variant="secondary" size="sm" onClick={retryFailed}>
                <RefreshCw size={16} /> Reintentar con error ({failedCount})
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={reload}>
              <RefreshCw size={16} /> Actualizar
            </Button>
          </div>
        }
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card variant="kpi">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Facturación</p>
            <p className="kpi-value mt-1">{fiscalOn ? "Activada" : "Desactivada"}</p>
            {!fiscalOn && (
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                Activá en Administración → Facturación electrónica.
              </p>
            )}
          </Card>
          <Card variant="kpi">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Internet</p>
            <p className="kpi-value mt-1 text-xl">{connectionSummary(conn)}</p>
          </Card>
          <Card variant={queueCount > 0 || failedCount > 0 ? "kpi-featured" : "kpi"}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Pendientes</p>
            <p className="kpi-value mt-1 text-brand-700 dark:text-brand-300">{queueCount + failedCount}</p>
          </Card>
        </div>

        {failedCount > 0 && (
          <Card variant="elevated" className="border-amber-300/60 bg-amber-50/50 px-5 py-4 dark:border-amber-800/50 dark:bg-amber-950/20">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Hay {failedCount} factura{failedCount === 1 ? "" : "s"} que no se pudo emitir.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800/90 dark:text-amber-300/90">
              Revisá el error abajo, corregí lo que indique y tocá «Reintentar con error». Si no sabés cómo
              resolverlo, usá «Copiar para soporte» y enviáselo a quien te ayuda con ARCA.
            </p>
          </Card>
        )}

        <Card variant="elevated" className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-[var(--color-panel-border)] px-5 py-4">
            <FileText size={18} className="text-brand-600" />
            <h2 className="panel-section-title">Por emitir</h2>
          </div>
          {queue.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nada pendiente"
              description="Cuando vendas con facturación activada, las facturas aparecen acá hasta que se emitan."
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Venta</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td>
                        <span className="font-medium">Venta #{row.entity_id}</span>
                      </td>
                      <td>
                        <span
                          className={
                            row.status === "FAILED"
                              ? "inline-flex items-center gap-1 font-semibold text-red-600"
                              : row.status === "PROCESSING"
                                ? "text-brand-700"
                                : "text-ink-muted"
                          }
                        >
                          {row.status === "FAILED" && <AlertTriangle size={14} />}
                          {STATUS_LABEL[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="cell-muted">{formatQueueDate(row.created_at)}</td>
                    </tr>
                    {row.status === "FAILED" && row.last_error && (
                      <tr>
                        <td colSpan={3} className="!py-3 !px-4">
                          <FiscalErrorCard saleId={row.entity_id} raw={row.last_error} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card variant="elevated" className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-[var(--color-panel-border)] px-5 py-4">
            <ReceiptText size={18} className="text-brand-600" />
            <h2 className="panel-section-title">Facturas emitidas</h2>
            {docs.length > 0 && (
              <span className="ml-auto text-xs text-ink-muted">{docs.length}</span>
            )}
          </div>
          {docs.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Todavía no hay facturas"
              description="Las facturas aprobadas van a aparecer acá con su número y total."
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Comprobante</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.sale_id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{comprobanteLabel(doc)}</span>
                        {doc.simulated && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            Prueba
                          </span>
                        )}
                      </div>
                      {doc.cae && (
                        <span className="text-xs text-ink-muted" title={`CAE: ${doc.cae}`}>
                          CAE …{doc.cae.slice(-8)}
                        </span>
                      )}
                    </td>
                    <td>{doc.customer_name ?? "Consumidor final"}</td>
                    <td className="tabular-nums">{formatMoney(doc.total, currency)}</td>
                    <td>
                      <span
                        className={
                          doc.resultado === "A"
                            ? "font-medium text-emerald-600"
                            : doc.resultado === "R"
                              ? "font-semibold text-red-600"
                              : "text-ink-muted"
                        }
                      >
                        {doc.resultado === "A"
                          ? "Aprobada"
                          : doc.resultado === "R"
                            ? "Rechazada"
                            : doc.resultado || "—"}
                      </span>
                    </td>
                    <td className="cell-muted">{formatQueueDate(doc.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </PageContent>
    </div>
  );
}
