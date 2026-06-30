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
      className="admin-hub-tile group flex w-full items-start gap-4 p-5 text-left"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-700 ring-1 ring-brand-500/10 dark:text-brand-300">
        <Icon size={22} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-base font-semibold tracking-tight text-ink">{title}</p>
          {badge ? (
            <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">{summary}</p>
      </div>
      <ChevronRight
        size={18}
        className="mt-1 shrink-0 text-ink-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-600"
      />
    </button>
  );
}
