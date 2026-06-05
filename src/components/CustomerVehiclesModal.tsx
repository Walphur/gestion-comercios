import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Car, ChevronRight } from "lucide-react";
import { Modal, Button } from "./ui";
import { listVehicles, getVehicleHistory, type VehicleHistory } from "../db/vehicles";
import type { Customer, Vehicle } from "../types";
import { formatVehicleLabel } from "../lib/vehicleFormat";
import { formatDateShort, formatMoney, formatTime } from "../lib/format";
import { useAppConfig } from "../context/AppConfig";

const APPT_STATUS: Record<string, string> = {
  scheduled: "Programado",
  confirmed: "Confirmado",
  in_progress: "En curso",
  completed: "Finalizado",
  cancelled: "Cancelado",
  no_show: "No asistió",
};

const QUOTE_STATUS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviado",
  approved: "Aprobado",
  rejected: "Rechazado",
  converted: "Convertido",
};

const ORDER_STATUS: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En reparación",
  waiting_parts: "Espera repuestos",
  ready: "Lista",
  delivered: "Entregada",
  cancelled: "Cancelada",
};

interface Props {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}

export default function CustomerVehiclesModal({ customer, open, onClose }: Props) {
  const { currency } = useAppConfig();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [history, setHistory] = useState<VehicleHistory | null>(null);

  const reload = useCallback(async () => {
    if (!customer) return;
    const list = await listVehicles(customer.id);
    setVehicles(list);
    setSelectedId(list[0]?.id ?? null);
  }, [customer]);

  useEffect(() => {
    if (open && customer) void reload();
  }, [open, customer, reload]);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setHistory(null);
    }
  }, [open]);

  useEffect(() => {
    if (selectedId == null) {
      setHistory(null);
      return;
    }
    void getVehicleHistory(selectedId).then(setHistory);
  }, [selectedId]);

  const selected = vehicles.find((v) => v.id === selectedId) ?? null;

  return (
    <Modal
      open={open}
      title={customer ? `Vehículos de ${customer.name}` : "Vehículos"}
      onClose={onClose}
    >
      {!customer ? null : vehicles.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">
          Este cliente no tiene vehículos cargados. Podés agregar uno desde un turno u orden de
          servicio.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-1">
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedId(v.id)}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === v.id
                    ? "border-brand-500 bg-brand-50/50 dark:bg-brand-900/20"
                    : "border-[var(--color-panel-border)] hover:border-brand-400"
                }`}
              >
                <Car size={14} className="shrink-0 text-brand-600" />
                <span className="min-w-0 truncate font-medium text-ink">{formatVehicleLabel(v)}</span>
              </button>
            ))}
          </div>

          <div className="sm:col-span-2">
            {selected && (
              <div className="mb-3 rounded-lg border border-[var(--color-panel-border)] p-3 text-xs text-ink-muted">
                {selected.odometer_km != null && (
                  <span className="mr-3">Km: {selected.odometer_km.toLocaleString("es-AR")}</span>
                )}
                {selected.notes && <span>{selected.notes}</span>}
              </div>
            )}

            {!history ? (
              <p className="text-sm text-ink-muted">Seleccioná un vehículo.</p>
            ) : (
              <div className="max-h-80 space-y-4 overflow-y-auto pr-1">
                <HistorySection title="Turnos">
                  {history.appointments.length === 0 ? (
                    <p className="text-xs text-ink-muted">Sin turnos.</p>
                  ) : (
                    history.appointments.map((a) => (
                      <Link
                        key={a.id}
                        to={`/turnos/${a.id}`}
                        onClick={onClose}
                        className="mb-1 flex items-center justify-between rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-sm hover:border-brand-400"
                      >
                        <span>
                          <span className="font-medium text-ink">{a.title}</span>
                          <span className="ml-2 text-xs text-ink-muted">
                            {formatDateShort(a.starts_at)} {formatTime(a.starts_at)} ·{" "}
                            {APPT_STATUS[a.status] ?? a.status}
                          </span>
                        </span>
                        <ChevronRight size={14} className="text-ink-muted" />
                      </Link>
                    ))
                  )}
                </HistorySection>

                <HistorySection title="Presupuestos">
                  {history.quotes.length === 0 ? (
                    <p className="text-xs text-ink-muted">Sin presupuestos.</p>
                  ) : (
                    history.quotes.map((q) => (
                      <Link
                        key={q.id}
                        to={`/presupuestos/${q.id}`}
                        onClick={onClose}
                        className="mb-1 flex items-center justify-between rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-sm hover:border-brand-400"
                      >
                        <span>
                          <span className="font-medium text-ink">{q.quote_number}</span>
                          <span className="ml-2 text-xs text-ink-muted">
                            {QUOTE_STATUS[q.status] ?? q.status} · {formatMoney(q.total, currency)}
                          </span>
                        </span>
                        <ChevronRight size={14} className="text-ink-muted" />
                      </Link>
                    ))
                  )}
                </HistorySection>

                <HistorySection title="Órdenes de servicio">
                  {history.orders.length === 0 ? (
                    <p className="text-xs text-ink-muted">Sin órdenes.</p>
                  ) : (
                    history.orders.map((o) => (
                      <Link
                        key={o.id}
                        to={`/ordenes/${o.id}`}
                        onClick={onClose}
                        className="mb-1 flex items-center justify-between rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-sm hover:border-brand-400"
                      >
                        <span>
                          <span className="font-medium text-ink">
                            {o.order_number} · {o.title}
                          </span>
                          <span className="ml-2 text-xs text-ink-muted">
                            {ORDER_STATUS[o.status] ?? o.status} · {formatMoney(o.total, currency)}
                          </span>
                        </span>
                        <ChevronRight size={14} className="text-ink-muted" />
                      </Link>
                    ))
                  )}
                </HistorySection>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}

function HistorySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h4>
      {children}
    </div>
  );
}
