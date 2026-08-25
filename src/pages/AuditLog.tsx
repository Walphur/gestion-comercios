import { useEffect, useMemo, useState } from "react";
import {
  Shield,
  ShoppingCart,
  Wallet,
  CalendarClock,
  FileText,
  Truck,
  ClipboardList,
  Ban,
  Pencil,
  Percent,
} from "lucide-react";
import { PageHeader, PageContent, DataTableShell, EmptyState, Card } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { listActionLog, type ActionLogRow } from "../db/audit";
import { formatAuditAction, formatAuditReference } from "../lib/auditDisplay";
import { Navigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

function actionVisual(action: string): { icon: LucideIcon; tone: string } {
  if (action.startsWith("sale_")) {
    if (action.includes("void")) return { icon: Ban, tone: "bg-rose-500/15 text-rose-600 dark:text-rose-300" };
    if (action.includes("edit")) return { icon: Pencil, tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
    return { icon: ShoppingCart, tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
  }
  if (action.startsWith("cash_")) return { icon: Wallet, tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300" };
  if (action.startsWith("appointment_")) return { icon: CalendarClock, tone: "bg-violet-500/15 text-violet-700 dark:text-violet-300" };
  if (action.startsWith("quote_")) return { icon: FileText, tone: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" };
  if (action.startsWith("delivery_")) return { icon: Truck, tone: "bg-orange-500/15 text-orange-700 dark:text-orange-300" };
  if (action.startsWith("service_order_")) return { icon: ClipboardList, tone: "bg-teal-500/15 text-teal-700 dark:text-teal-300" };
  if (action.includes("discount")) return { icon: Percent, tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
  return { icon: Shield, tone: "bg-brand-500/15 text-brand-700 dark:text-brand-300" };
}

export default function AuditLog() {
  const { can } = useAuth();
  const [rows, setRows] = useState<ActionLogRow[]>([]);

  useEffect(() => {
    listActionLog().then(setRows).catch(console.error);
  }, []);

  const stats = useMemo(() => {
    const sales = rows.filter((r) => r.action.startsWith("sale_")).length;
    const cash = rows.filter((r) => r.action.startsWith("cash_")).length;
    const pro = rows.filter((r) =>
      /^(appointment_|quote_|delivery_|service_order_)/.test(r.action),
    ).length;
    return { sales, cash, pro, total: rows.length };
  }, [rows]);

  if (!can("view_audit")) {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Auditoría"
        subtitle="Quién hizo qué y cuándo. Solo administradores."
      />
      <PageContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Registros", value: stats.total, tone: "from-brand-500/20 to-brand-600/5" },
            { label: "Ventas", value: stats.sales, tone: "from-emerald-500/20 to-emerald-600/5" },
            { label: "Caja", value: stats.cash, tone: "from-sky-500/20 to-sky-600/5" },
            { label: "Módulos Pro", value: stats.pro, tone: "from-violet-500/20 to-violet-600/5" },
          ].map((s) => (
            <Card
              key={s.label}
              className={`bg-gradient-to-br ${s.tone} border-[var(--color-panel-border)]`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {s.label}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{s.value}</p>
            </Card>
          ))}
        </div>

        <DataTableShell>
          <div className="flex items-center gap-2 border-b border-[var(--color-panel-border)] px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/15 text-brand-700 dark:text-brand-300">
              <Shield size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Registro de acciones</p>
              <p className="text-xs text-ink-muted">Actividad crítica del equipo</p>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="cell-empty">
                      <EmptyState
                        compact
                        icon={Shield}
                        title="Sin registros"
                        description="Las acciones críticas de usuarios aparecerán aquí automáticamente."
                      />
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const visual = actionVisual(r.action);
                    const Icon = visual.icon;
                    return (
                      <tr key={r.id}>
                        <td className="cell-muted whitespace-nowrap">{r.created_at}</td>
                        <td>
                          <span className="inline-flex rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-ink">
                            {r.display_name ?? r.user_id ?? "—"}
                          </span>
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-2 font-medium text-ink">
                            <span
                              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${visual.tone}`}
                            >
                              <Icon size={14} />
                            </span>
                            {formatAuditAction(r.action)}
                          </span>
                        </td>
                        <td className="cell-muted min-w-0">
                          <span className="line-clamp-2">{formatAuditReference(r)}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DataTableShell>
      </PageContent>
    </div>
  );
}
