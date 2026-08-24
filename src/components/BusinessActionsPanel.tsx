import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, ListChecks } from "lucide-react";
import { Card } from "./ui";
import type { BusinessAction, BusinessActionUrgency } from "../db/intelligence/actionTypes";

const URGENCY_LABEL: Record<BusinessActionUrgency, string> = {
  now: "Ahora",
  today: "Hoy",
  this_week: "Esta semana",
};

const URGENCY_CLASS: Record<BusinessActionUrgency, string> = {
  now: "bg-red-500/15 text-red-700 dark:text-red-300",
  today: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  this_week: "bg-sky-500/12 text-sky-800 dark:text-sky-200",
};

export function BusinessActionsPanel({
  actions,
  now_count,
  total_candidates,
}: {
  actions: BusinessAction[];
  now_count: number;
  total_candidates: number;
}) {
  const routineOnly = actions.every((a) => a.kind === "routine_check");

  return (
    <Card className="min-w-0 border-brand-500/35 bg-gradient-to-br from-brand-500/[0.06] to-transparent">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ListChecks size={20} className="shrink-0 text-brand-600 dark:text-brand-400" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-ink">¿Qué hacer hoy?</h2>
            <p className="text-xs text-ink-muted">
              Acciones priorizadas según tus datos locales
              {total_candidates > actions.length ? ` · ${total_candidates} detectadas, top ${actions.length}` : ""}
            </p>
          </div>
        </div>
        {now_count > 0 && (
          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
            {now_count} urgente{now_count === 1 ? "" : "s"}
          </span>
        )}
        {routineOnly && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 size={12} />
            Sin urgencias críticas
          </span>
        )}
      </div>

      <ol className="space-y-2">
        {actions.map((action, index) => (
          <li
            key={action.id}
            className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-3 py-2.5"
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700 dark:text-brand-300">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">{action.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${URGENCY_CLASS[action.urgency]}`}
                >
                  {URGENCY_LABEL[action.urgency]}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-ink-muted">{action.reason}</p>
              <Link
                to={action.link}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
              >
                {action.link_label} <ArrowUpRight size={12} />
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
