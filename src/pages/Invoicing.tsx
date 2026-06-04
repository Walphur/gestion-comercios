import { useEffect, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { PageHeader, Button, Card } from "../components/ui";
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

  return (
    <div>
      <PageHeader
        title="Facturación (ARCA)"
        subtitle="Cola fiscal offline — integración AFIP en preparación"
        actions={
          <Button variant="secondary" onClick={reload}>
            <RefreshCw size={16} /> Actualizar
          </Button>
        }
      />

      <div className="grid gap-5 p-8 lg:grid-cols-3">
        <Card>
          <p className="text-sm text-ink-muted">Facturación en cola</p>
          <p className="mt-1 font-display text-xl font-semibold text-ink">
            {fiscalOn ? "Activada" : "Desactivada"}
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            Activá en Administración → Facturación electrónica.
          </p>
        </Card>
        <Card>
          <p className="text-sm text-ink-muted">Conexión</p>
          <p className="mt-1 font-display text-lg font-semibold text-ink">
            {conn?.mode_label ?? "—"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-ink-muted">En cola</p>
          <p className="mt-1 font-display text-2xl font-semibold text-brand-700">
            {(counts.PENDING ?? 0) + (counts.PROCESSING ?? 0)}
          </p>
        </Card>
      </div>

      <div className="px-8 pb-8">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-brand-100 px-4 py-3">
            <FileText size={18} className="text-brand-600" />
            <h2 className="font-display text-sm font-semibold text-ink">Cola de sincronización</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Venta</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Intentos</th>
                <th className="px-4 py-2">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={row.id} className="border-t border-brand-50">
                  <td className="px-4 py-2">{row.id}</td>
                  <td className="px-4 py-2">{row.entity_id}</td>
                  <td className="px-4 py-2">
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
                  <td className="px-4 py-2">{row.attempts}</td>
                  <td className="px-4 py-2 text-ink-muted">{row.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {queue.length === 0 && (
            <p className="p-8 text-center text-ink-muted">
              No hay comprobantes en cola. Al finalizar ventas con facturación activa, aparecerán
              aquí (simulación hasta conectar ARCA).
            </p>
          )}
        </Card>
        <p className="mt-4 text-xs text-ink-muted">
          La emisión real ante AFIP/ARCA se conectará en una etapa posterior; hoy el worker procesa
          la cola en segundo plano sin bloquear la caja.
        </p>
      </div>
    </div>
  );
}
