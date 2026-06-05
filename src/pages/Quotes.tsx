import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Plus, Eye } from "lucide-react";
import { PageHeader, Card } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { listQuotes } from "../db/quotes";
import type { Quote, QuoteStatus } from "../types";
import { formatMoney, formatDateShort } from "../lib/format";

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Borrador",
  sent: "Enviado",
  approved: "Aprobado",
  rejected: "Rechazado",
  converted: "Convertido",
};

const STATUS_CLASS: Record<QuoteStatus, string> = {
  draft: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  sent: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  approved: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  converted: "bg-brand-500/15 text-brand-800 dark:text-brand-200",
};

export default function Quotes() {
  const { currency } = useAppConfig();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [filter, setFilter] = useState<QuoteStatus | "all">("all");

  const reload = useCallback(async () => {
    setQuotes(await listQuotes());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible =
    filter === "all" ? quotes : quotes.filter((q) => q.status === filter);

  return (
    <div>
      <PageHeader
        title="Presupuestos"
        subtitle="Cotizaciones para ventas grandes, taller, ferretería o servicios."
        actions={
          <Link
            to="/presupuestos/nuevo"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            <Plus size={16} /> Nuevo presupuesto
          </Link>
        }
      />
      <div className="p-8">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "draft", "sent", "approved", "converted", "rejected"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === s
                  ? "bg-brand-600 text-white"
                  : "border border-[var(--color-panel-border)] text-ink-muted hover:border-brand-400"
              }`}
            >
              {s === "all" ? "Todos" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <Card className="overflow-hidden p-0">
          {visible.length === 0 ? (
            <div className="p-10 text-center text-ink-muted">
              <ClipboardList className="mx-auto mb-3 opacity-40" size={40} />
              <p>No hay presupuestos{filter !== "all" ? ` en estado «${STATUS_LABEL[filter as QuoteStatus]}»` : ""}.</p>
              <Link
                to="/presupuestos/nuevo"
                className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
              >
                Crear el primero
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((q) => (
                  <tr key={q.id} className="table-row">
                    <td className="px-4 py-3 font-medium text-ink">{q.quote_number}</td>
                    <td className="px-4 py-3 text-ink-muted">{q.customer_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[q.status]}`}
                      >
                        {STATUS_LABEL[q.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">
                      {formatMoney(q.total, currency)}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{formatDateShort(q.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/presupuestos/${q.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
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
