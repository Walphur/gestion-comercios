import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  title: string;
  steps: string[];
  defaultOpen?: boolean;
  className?: string;
}

export default function CollapsibleGuide({ title, steps, defaultOpen = false, className = "" }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)]/40 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-ink hover:bg-brand-500/5"
      >
        <span>{title}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ol className="space-y-2 border-t border-[var(--color-panel-border)] px-4 py-3 text-sm text-ink-muted">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700 dark:text-brand-300">
                {i + 1}
              </span>
              <span className="pt-0.5 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
