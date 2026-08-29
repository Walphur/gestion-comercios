import { useEffect, useState } from "react";
import { Calendar, Clock } from "lucide-react";

interface Props {
  /** card: bloque grande; sidebar: línea compacta; inline: chip en POS; compact: solo hora */
  variant?: "card" | "sidebar" | "inline" | "compact";
  className?: string;
}

interface ClockParts {
  iso: string;
  weekday: string;
  date: string;
  time: string;
}

function getParts(): ClockParts {
  const d = new Date();
  return {
    iso: d.toISOString(),
    weekday: d.toLocaleDateString("es-AR", { weekday: "long" }),
    date: d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

/** Fecha y hora locales. */
export default function ClockDisplay({ variant = "card", className = "" }: Props) {
  const [parts, setParts] = useState(getParts);

  useEffect(() => {
    setParts(getParts());
    const ms = variant === "card" || variant === "sidebar" ? 1000 : 30_000;
    const id = window.setInterval(() => setParts(getParts()), ms);
    return () => clearInterval(id);
  }, [variant]);

  if (variant === "compact") {
    return (
      <time dateTime={parts.iso} className={className} title={`${parts.date} ${parts.time}`}>
        {parts.time.slice(0, 5)}
      </time>
    );
  }

  if (variant === "inline") {
    return (
      <time
        dateTime={parts.iso}
        className={`inline-flex items-center gap-2 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-panel-muted)] px-3 py-1.5 text-sm tabular-nums text-ink-muted ${className}`}
        title="Fecha y hora local"
      >
        <Calendar size={14} className="shrink-0 text-brand-500" />
        <span className="capitalize">{parts.weekday.slice(0, 3)}</span>
        <span className="text-ink-muted/40">·</span>
        <span>{parts.date}</span>
        <span className="text-ink-muted/40">·</span>
        <Clock size={14} className="shrink-0 text-brand-500" />
        <span className="font-semibold text-ink">{parts.time.slice(0, 5)}</span>
      </time>
    );
  }

  if (variant === "sidebar") {
    return (
      <time
        dateTime={parts.iso}
        className={`flex min-w-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] tabular-nums text-white/70 ${className}`}
        title={`${parts.weekday} · ${parts.date} · ${parts.time}`}
      >
        <Calendar size={11} className="shrink-0 text-brand-300/80" aria-hidden />
        <span className="min-w-0 truncate capitalize">{parts.weekday.slice(0, 3)}</span>
        <span className="text-white/30">·</span>
        <Clock size={11} className="shrink-0 text-sky-300/80" aria-hidden />
        <span className="shrink-0 font-semibold text-white/90">{parts.time.slice(0, 5)}</span>
      </time>
    );
  }

  return (
    <div
      className={`rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.03] px-3 py-2.5 shadow-inner ${className}`}
    >
      <time dateTime={parts.iso} className="block min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-200">
            <Calendar size={14} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold capitalize leading-tight text-white/85">
              {parts.weekday}
            </p>
            <p className="truncate text-[10px] leading-tight text-white/50">{parts.date}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
          <Clock size={15} className="shrink-0 text-sky-300/90" aria-hidden />
          <span className="text-xl font-bold tabular-nums tracking-tight text-white">
            {parts.time}
          </span>
        </div>
      </time>
    </div>
  );
}
