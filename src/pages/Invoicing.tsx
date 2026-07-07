import { useEffect, useState } from "react";
import { FileText, RefreshCw, Inbox } from "lucide-react";
import { PageHeader, Button, Card, PageContent, EmptyState } from "../components/ui";
import { getConnectionStatus, type SyncStatusDto } from "../lib/tauri";
import { countSyncByStatus, listSyncQueue, type SyncQueueRow } from "../db/fiscal";
import { getSetting } from "../db/settings";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  PROCESSING: "Procesando",
  COMPLETED: "Completado",
  FAILED: "Error",
};

export default function Invoicing() {
  const [fiscalOn, setFiscalOn] = useState(false);
  const [conn, setConn] = useState<SyncStatusDto | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [queue, setQueue] = useState<SyncQueueRow[]>([]);

  async function reload() {
    const [f, c, q, cnt] = await Promise.all([
      getSetting("fiscal_enabled"),
      getConnectionStatus(),
      listSyncQueue(40),
      countSyncByStatus(),
    ]);
    setFiscalOn(f === "1");
    setConn(c);
    setQueue(q);
    setCounts(cnt);
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
        <p className="text-xs leading-relaxed text-ink-muted">
          El worker emite comprobantes en segundo plano cuando hay internet. Usá modo simulación en
          Administración → ARCA para probar sin consumir el servicio real.
        </p>
      </PageContent>
    </div>
  );
}
