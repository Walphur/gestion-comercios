import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Wrench, Plus, Eye, LayoutGrid, List } from "lucide-react";
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
import { rubroUsesWorkshopFlow } from "../config/workshop";
import { formatVehicleLabel } from "../lib/vehicleFormat";

const STATUS_TONE: Record<ServiceOrderStatus, "neutral" | "warn" | "ok" | "brand" | "danger"> = {
  pending: "neutral",
  in_progress: "warn",
  waiting_parts: "warn",
  ready: "ok",
  delivered: "brand",
  cancelled: "danger",
};

const KANBAN_COLUMNS: ServiceOrderStatus[] = [
  "pending",
  "in_progress",
  "waiting_parts",
  "ready",
];

function orderVehicleLabel(o: ServiceOrder): string | null {
  if (o.vehicle_plate) {
    return formatVehicleLabel({
      plate: o.vehicle_plate,
      brand: o.vehicle_brand,
      model: o.vehicle_model,
    });
  }
  return o.subject_notes;
}

export default function ServiceOrders() {
  const { currency, rubro } = useAppConfig();
  const labels = getServiceOrderLabels(rubro);
  const statusLabel = getServiceOrderStatusLabels(rubro);
  const workshopFlow = rubroUsesWorkshopFlow(rubro);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [filter, setFilter] = useState<ServiceOrderStatus | "all" | "active">("active");
  const [view, setView] = useState<"list" | "kanban">(workshopFlow ? "kanban" : "list");

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

  const kanbanOrders = useMemo(
    () => orders.filter((o) => !["delivered", "cancelled"].includes(o.status)),
    [orders],
  );

  return (
    <div>
      <PageHeader
        title="Órdenes de servicio"
        subtitle={labels.listSubtitle}
        actions={
          <div className="flex items-center gap-2">
            {workshopFlow && (
              <div className="flex rounded-lg border border-[var(--color-panel-border)] p-0.5">
                <button
                  type="button"
                  onClick={() => setView("kanban")}
                  className={`rounded-md px-2 py-1.5 ${view === "kanban" ? "bg-brand-600 text-white" : "text-ink-muted"}`}
                  title="Tablero"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`rounded-md px-2 py-1.5 ${view === "list" ? "bg-brand-600 text-white" : "text-ink-muted"}`}
                  title="Lista"
                >
                  <List size={16} />
                </button>
              </div>
            )}
            <Link
              to="/ordenes/nuevo"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus size={16} /> Nueva orden
            </Link>
          </div>
        }
      />
      <div className="p-8">
        {view === "list" && (
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
                  filter === s
                    ? "bg-brand-600 text-white"
                    : "border border-[var(--color-panel-border)] text-ink-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {view === "kanban" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            {KANBAN_COLUMNS.map((status) => {
              const column = kanbanOrders.filter((o) => o.status === status);
              return (
                <div key={status} className="min-w-0">
                  <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {statusLabel[status]}
                    <span className="rounded-full bg-[var(--color-panel-border)] px-2 py-0.5 text-[10px]">
                      {column.length}
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {column.length === 0 ? (
                      <Card className="py-6 text-center text-xs text-ink-muted">Vacío</Card>
                    ) : (
                      column.map((o) => {
                        const vehicle = orderVehicleLabel(o);
                        return (
                          <Link key={o.id} to={`/ordenes/${o.id}`} className="block">
                            <Card className="transition-colors hover:border-brand-400">
                              <p className="text-xs font-semibold text-brand-600 dark:text-brand-300">
                                {o.order_number}
                              </p>
                              <p className="mt-1 font-medium text-ink">{o.title}</p>
                              {vehicle && <p className="mt-1 text-xs text-ink-muted">{vehicle}</p>}
                              <p className="mt-2 text-xs text-ink-muted">
                                {o.customer_name ?? "Sin cliente"}
                              </p>
                              <p className="mt-1 text-sm font-semibold tabular-nums text-ink">
                                {formatMoney(o.total, currency)}
                              </p>
                            </Card>
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
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
                  {visible.map((o) => {
                    const vehicle = orderVehicleLabel(o);
                    return (
                      <tr key={o.id} className="table-row">
                        <td className="px-4 py-3 font-medium text-ink">{o.order_number}</td>
                        <td className="px-4 py-3">
                          <span className="text-ink">{o.title}</span>
                          {vehicle && <span className="block text-xs text-ink-muted">{vehicle}</span>}
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
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
