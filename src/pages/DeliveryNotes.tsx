import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Truck, Plus, Eye } from "lucide-react";
import { PageHeader, Card, PageContent } from "../components/ui";
import { listDeliveryNotes } from "../db/deliveryNotes";
import type { DeliveryNote, DeliveryNoteStatus } from "../types";
import { formatDateShort } from "../lib/format";
import { statusBadgeClass } from "../lib/statusStyles";
import { useAppConfig } from "../context/AppConfig";
import { getDeliveryNoteLabels } from "../config/deliveryNoteLabels";

const STATUS_LABEL: Record<DeliveryNoteStatus, string> = {
  draft: "Borrador",
  issued: "Emitido",
  cancelled: "Anulado",
};

const STATUS_TONE: Record<DeliveryNoteStatus, "neutral" | "warn" | "ok" | "brand" | "danger"> = {
  draft: "neutral",
  issued: "brand",
  cancelled: "danger",
};

export default function DeliveryNotes() {
  const { rubro } = useAppConfig();
  const labels = getDeliveryNoteLabels(rubro);
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [filter, setFilter] = useState<DeliveryNoteStatus | "all">("all");

  const reload = useCallback(async () => {
    setNotes(await listDeliveryNotes());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = filter === "all" ? notes : notes.filter((n) => n.status === filter);

  return (
    <div>
      <PageHeader
        title="Remitos"
        subtitle={labels.listSubtitle}
        actions={
          <Link
            to="/remitos/nuevo"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus size={16} /> Nuevo remito
          </Link>
        }
      />
      <PageContent>
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "draft", "issued", "cancelled"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                filter === s ? "bg-brand-600 text-white" : "border border-[var(--color-panel-border)] text-ink-muted"
              }`}
            >
              {s === "all" ? "Todos" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <Card className="overflow-hidden p-0">
          {visible.length === 0 ? (
            <div className="p-10 text-center text-ink-muted">
              <Truck className="mx-auto mb-3 opacity-40" size={40} />
              <p>{labels.emptyListMessage}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">{labels.destinationColumnHeader}</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Ítems</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((n) => (
                  <tr key={n.id} className="table-row">
                    <td className="px-4 py-3 font-medium text-ink">{n.note_number}</td>
                    <td className="px-4 py-3 text-ink-muted">
                      {n.customer_name ?? "—"}
                      {n.destination ? ` → ${n.destination}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusBadgeClass(STATUS_TONE[n.status])}>
                        {STATUS_LABEL[n.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{n.item_count ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-muted">
                      {formatDateShort(n.issued_at ?? n.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/remitos/${n.id}`}
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
      </PageContent>
    </div>
  );
}
