import { useId, useMemo, useState } from "react";
import { formatMoney } from "../../../lib/format";

export interface EvolutionPoint {
  day: string;
  sales: number;
  collected: number;
}

interface Props {
  points: EvolutionPoint[];
  currency: string;
  changePct?: number | null;
}

function niceMax(n: number): number {
  if (n <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(n));
  const m = n / pow;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return nice * pow;
}

/** Línea de ventas vs cobrado (SVG, sin dependencia externa). */
export default function EvolutionChart({ points, currency, changePct }: Props) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const ordered = useMemo(
    () => [...points].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
    [points],
  );

  const W = 640;
  const H = 220;
  const pad = { t: 16, r: 12, b: 28, l: 8 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const maxY = useMemo(() => {
    let m = 0;
    for (const p of ordered) m = Math.max(m, p.sales, p.collected);
    return niceMax(m);
  }, [ordered]);

  const coords = useMemo(() => {
    if (ordered.length === 0) return [];
    const n = ordered.length;
    return ordered.map((p, i) => {
      const x = pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const ySales = pad.t + innerH - (p.sales / maxY) * innerH;
      const yCol = pad.t + innerH - (p.collected / maxY) * innerH;
      return { ...p, x, ySales, yCol };
    });
  }, [ordered, maxY, innerW, innerH, pad.l, pad.t]);

  function pathOf(key: "ySales" | "yCol"): string {
    if (coords.length === 0) return "";
    return coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c[key].toFixed(1)}`).join(" ");
  }

  function areaOf(key: "ySales" | "yCol"): string {
    if (coords.length === 0) return "";
    const line = pathOf(key);
    const last = coords[coords.length - 1];
    const first = coords[0];
    return `${line} L${last.x.toFixed(1)},${(pad.t + innerH).toFixed(1)} L${first.x.toFixed(1)},${(
      pad.t + innerH
    ).toFixed(1)} Z`;
  }

  if (ordered.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-[var(--color-panel-border)] text-sm text-ink-muted">
        Sin datos en el período para graficar.
      </div>
    );
  }

  const tip = hover != null ? coords[hover] : null;

  return (
    <div className="relative min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-500" /> Ventas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Cobrado
          </span>
        </div>
        {changePct != null && Number.isFinite(changePct) ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
              changePct >= 0
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
            }`}
          >
            {changePct >= 0 ? "+" : ""}
            {changePct.toFixed(1)}% vs período anterior
          </span>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Evolución de ventas y cobrado"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`sales-fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500, #8b5cf6)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-brand-500, #8b5cf6)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`col-fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.t + innerH * (1 - t);
          return (
            <line
              key={t}
              x1={pad.l}
              x2={W - pad.r}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-[var(--color-panel-border)]"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          );
        })}

        <path d={areaOf("ySales")} fill={`url(#sales-fill-${gid})`} />
        <path d={areaOf("yCol")} fill={`url(#col-fill-${gid})`} />
        <path
          d={pathOf("ySales")}
          fill="none"
          stroke="var(--color-brand-500, #8b5cf6)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={pathOf("yCol")}
          fill="none"
          stroke="#10b981"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {coords.map((c, i) => (
          <g key={c.day}>
            <circle
              cx={c.x}
              cy={c.ySales}
              r={hover === i ? 4.5 : 3}
              fill="var(--color-brand-500, #8b5cf6)"
              className="transition-[r]"
            />
            <circle cx={c.x} cy={c.yCol} r={hover === i ? 4.5 : 3} fill="#10b981" className="transition-[r]" />
            <rect
              x={c.x - innerW / Math.max(coords.length, 1) / 2}
              y={pad.t}
              width={Math.max(innerW / Math.max(coords.length, 1), 12)}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
            {(coords.length <= 10 || i === 0 || i === coords.length - 1 || i % Math.ceil(coords.length / 6) === 0) && (
              <text
                x={c.x}
                y={H - 8}
                textAnchor="middle"
                className="fill-ink-muted"
                style={{ fontSize: 10 }}
              >
                {c.day.slice(5)}
              </text>
            )}
          </g>
        ))}
      </svg>

      {tip ? (
        <div
          className="pointer-events-none absolute left-1/2 top-10 z-10 min-w-[10rem] -translate-x-1/2 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-3 py-2 text-xs shadow-lg"
          role="tooltip"
        >
          <p className="font-semibold text-ink">{tip.day}</p>
          <p className="mt-1 text-ink-muted">
            Ventas: <span className="font-medium tabular-nums text-ink">{formatMoney(tip.sales, currency)}</span>
          </p>
          <p className="text-ink-muted">
            Cobrado:{" "}
            <span className="font-medium tabular-nums text-ink">{formatMoney(tip.collected, currency)}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
