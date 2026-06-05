import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  summary: string;
  badge?: string;
  onClick: () => void;
}

export default function AdminHubTile({ icon: Icon, title, summary, badge, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-4 rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4 text-left transition-all hover:border-brand-400 hover:shadow-sm dark:hover:border-brand-600"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300">
        <Icon size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{title}</p>
          {badge ? (
            <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{summary}</p>
      </div>
      <ChevronRight
        size={18}
        className="mt-1 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}
