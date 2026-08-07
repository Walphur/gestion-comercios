import { Link } from "react-router-dom";
import { AlertCircle, ChevronRight, type LucideIcon } from "lucide-react";

interface Props {
  icon?: LucideIcon;
  title: string;
  description: string;
  /** Ruta interna, ej. `/admin?section=arca` */
  to: string;
  linkLabel?: string;
  tone?: "amber" | "sky";
  className?: string;
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
}: Props) {
  const tones =
    tone === "sky"
      ? "border-sky-500/35 bg-sky-500/10 text-sky-950 dark:text-sky-100"
      : "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100";

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
      <Link
        to={to}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-current/20 bg-[var(--color-panel)]/60 px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-panel)]"
      >
        {linkLabel}
        <ChevronRight size={14} />
      </Link>
    </div>
  );
}
