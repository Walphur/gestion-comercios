import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wrench, Plus, Eye } from "lucide-react";
import { PageHeader, Card } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { listServiceOrders } from "../db/serviceOrders";
import type { ServiceOrder, ServiceOrderStatus } from "../types";
import { formatMoney } from "../lib/format";
import { statusBadgeClass } from "../lib/statusStyles";
import {
  getServiceOrderLabels,
  getServiceOrderStatusLabels,
} from "../config/serviceOrderLabels";

const STATUS_TONE: Record<ServiceOrderStatus, "neutral" | "warn" | "ok" | "brand" | "danger"> = {
  pending: "neutral",
  in_progress: "warn",
  waiting_parts: "warn",
  ready: "ok",
  delivered: "brand",
  cancelled: "danger",
};

export default function ServiceOrders() {
  const { currency, rubro } = useAppConfig();
  const labels = getServiceOrderLabels(rubro);
  const statusLabel = getServiceOrderStatusLabels(rubro);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [filter, setFilter] = useState<ServiceOrderStatus | "all" | "active">("active");

  const reload = useCallback(async () => {
    setOrders(await listServiceOrders());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = orders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "active") return !["delivered", "cancelled"].includes(o.status);
    return o.status === filter;
  });

  return (
    <div>
      <PageHeader
        title="Órdenes de servicio"
        subtitle={labels.listSubtitle}
        actions={
          <Link
            to="/ordenes/nuevo"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus size={16} /> Nueva orden
          </Link>
        }
      />
      <div className="p-8">
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["active", "Activas"],
              ["all", "Todas"],
              ["pending", statusLabel.pending],
              ["in_progress", statusLabel.in_progress],
              ["ready", statusLabel.ready],
              ["delivered", statusLabel.delivered],
            ] as const
          ).map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                filter === s ? "bg-brand-600 text-white" : "border border-[var(--color-panel-border)] text-ink-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Card className="overflow-hidden p-0">
          {visible.length === 0 ? (
            <div className="p-10 text-center text-ink-muted">
              <Wrench className="mx-auto mb-3 opacity-40" size={40} />
              <p>Sin órdenes de servicio.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">{labels.workColumnHeader}</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr key={o.id} className="table-row">
                    <td className="px-4 py-3 font-medium text-ink">{o.order_number}</td>
                    <td className="px-4 py-3">
                      <span className="text-ink">{o.title}</span>
                      {o.subject_notes && (
                        <span className="block text-xs text-ink-muted">{o.subject_notes}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{o.customer_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={statusBadgeClass(STATUS_TONE[o.status])}>
                        {statusLabel[o.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatMoney(o.total, currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/ordenes/${o.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-300"
                      >
                        <Eye size={14} /> Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
