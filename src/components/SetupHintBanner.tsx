import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";

interface Props {
  icon?: LucideIcon;
  title: string;
  description: string;
  /** Ruta interna, ej. `/admin?section=arca` */
  to: string;
  linkLabel?: string;
  tone?: "amber" | "sky";
  className?: string;
  /** Si true, se puede plegar; recuerda el estado en localStorage. */
  collapsible?: boolean;
  storageKey?: string;
}

/** Aviso con acceso directo a la configuración (WSP, ARCA, backups…). */
export default function SetupHintBanner({
  icon: Icon = AlertCircle,
  title,
  description,
  to,
  linkLabel = "Ir a configurar",
  tone = "amber",
  className = "",
  collapsible = false,
  storageKey,
}: Props) {
  const storeKey = storageKey ? `walqo-hint-collapsed:${storageKey}` : null;
  const [collapsed, setCollapsed] = useState(() => {
    if (!collapsible || !storeKey) return false;
    try {
      return localStorage.getItem(storeKey) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!collapsible || !storeKey) return;
    try {
      localStorage.setItem(storeKey, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed, collapsible, storeKey]);

  const tones =
    tone === "sky"
      ? "border-sky-500/35 bg-sky-500/10 text-sky-950 dark:text-sky-100"
      : "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100";

  if (collapsible && collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold ${tones} ${className}`}
      >
        <span className="inline-flex min-w-0 items-center gap-2 truncate">
          <Icon size={14} className="shrink-0 opacity-80" />
          <span className="truncate">{title}</span>
        </span>
        <ChevronDown size={14} className="shrink-0 opacity-70" />
      </button>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${tones} ${className}`}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon size={18} className="mt-0.5 shrink-0 opacity-80" />
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed opacity-90">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {collapsible && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded-lg px-2 py-1.5 text-xs font-medium opacity-80 hover:opacity-100"
          >
            Ocultar
          </button>
        )}
        <Link
          to={to}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-current/20 bg-[var(--color-panel)]/60 px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-panel)]"
        >
          {linkLabel}
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
