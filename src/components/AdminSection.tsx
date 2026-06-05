import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "./ui";

interface Props {
  title: string;
  summary: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Bloque plegable en Administración (rubros, módulos, etc.). */
export default function AdminSection({
  title,
  summary,
  badge,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-brand-50/40 dark:hover:bg-brand-900/20"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {badge ? (
              <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                {badge}
              </span>
            ) : null}
          </div>
          {!open && <p className="mt-1 text-sm text-ink-muted">{summary}</p>}
        </div>
        <ChevronDown
          size={20}
          className={`mt-0.5 shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="border-t border-[var(--color-panel-border)] px-5 py-4">{children}</div> : null}
    </Card>
  );
}
