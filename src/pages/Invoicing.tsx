import { useEffect, useState } from "react";
import { FileText, RefreshCw, Inbox, ReceiptText } from "lucide-react";
import { PageHeader, Button, Card, PageContent, EmptyState } from "../components/ui";
import {
  getConnectionStatus,
  fiscalListarDocumentos,
  type SyncStatusDto,
  type FiscalDocResumen,
} from "../lib/tauri";
import { countSyncByStatus, listSyncQueue, type SyncQueueRow } from "../db/fiscal";
import { getSetting } from "../db/settings";
import { formatMoney } from "../lib/format";
import { useAppConfig } from "../context/AppConfig";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  PROCESSING: "Procesando",
  COMPLETED: "Completado",
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
    setQueue(q);
    setCounts(cnt);
    setDocs(d);
  }

  useEffect(() => {
    reload();
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, []);

  const queueCount = (counts.PENDING ?? 0) + (counts.PROCESSING ?? 0);

  return (
    <div>
      <PageHeader
        title="Facturación (ARCA)"
        subtitle="Cola fiscal offline — emisión WSFEv1 vía ARCA"
        actions={
          <Button variant="secondary" size="sm" onClick={reload}>
            <RefreshCw size={16} /> Actualizar
          </Button>
        }
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card variant="kpi">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Facturación en cola</p>
            <p className="kpi-value mt-1">{fiscalOn ? "Activada" : "Desactivada"}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Activá en Administración → Facturación electrónica.
            </p>
          </Card>
          <Card variant="kpi">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Conexión</p>
            <p className="kpi-value mt-1 text-xl">{conn?.mode_label ?? "—"}</p>
          </Card>
          <Card variant={queueCount > 0 ? "kpi-featured" : "kpi"}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">En cola</p>
            <p className="kpi-value mt-1 text-brand-700 dark:text-brand-300">{queueCount}</p>
          </Card>
        </div>

        <Card variant="elevated" className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-[var(--color-panel-border)] px-5 py-4">
            <FileText size={18} className="text-brand-600" />
            <h2 className="panel-section-title">Cola de sincronización</h2>
          </div>
          {queue.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Cola vacía"
              description="Al finalizar ventas con facturación activa, los comprobantes aparecerán aquí hasta que el worker los emita en ARCA."
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Venta</th>
                  <th>Estado</th>
                  <th>Intentos</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.entity_id}</td>
                    <td>
                      <span
                        className={
                          row.status === "FAILED"
                            ? "text-red-600"
                            : row.status === "COMPLETED"
                              ? "text-emerald-600"
                              : "text-brand-700"
                        }
                      >
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    </td>
                    <td>{row.attempts}</td>
                    <td className="cell-muted">{row.created_at}</td>
                  </tr>
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
              <span className="ml-auto text-xs text-ink-muted">{docs.length} comprobantes</span>
            )}
          </div>
          {docs.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Todavía no hay facturas"
              description="Cuando emitas comprobantes en ARCA (o en modo simulación) van a aparecer acá con su CAE."
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Comprobante</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>CAE</th>
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
                            Simulada
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-ink-muted">Venta #{doc.sale_id}</span>
                    </td>
                    <td>{doc.customer_name ?? "Consumidor final"}</td>
                    <td className="tabular-nums">{formatMoney(doc.total, currency)}</td>
                    <td className="tabular-nums cell-muted">{doc.cae || "—"}</td>
                    <td>
                      <span
                        className={
                          doc.resultado === "A"
                            ? "text-emerald-600"
                            : doc.resultado === "R"
                              ? "text-red-600"
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
                    <td className="cell-muted">{doc.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <p className="text-xs leading-relaxed text-ink-muted">
          El worker emite comprobantes en segundo plano cuando hay internet. Usá modo simulación en
          Administración → ARCA para probar sin consumir el servicio real.
        </p>
      </PageContent>
    </div>
  );
}
