import { useMemo, useState } from "react";
import { formatMoney } from "../../../lib/format";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface Props {
  slices: DonutSlice[];
  currency: string;
  centerLabel?: string;
}

const COLORS = [
  "var(--color-brand-500, #2563eb)",
  "#10b981",
  "#f59e0b",
  "#3b82f6",
  "#ef4444",
  "#14b8a6",
  "#a855f7",
  "#64748b",
];

export function donutColor(i: number): string {
  return COLORS[i % COLORS.length];
}

type Arc = DonutSlice & { d: string | null; full: boolean; pct: number };

/** Donut simple con tooltip (SVG). Soporta 1 sola rebanada al 100%. */
export default function DonutChart({ slices, currency, centerLabel = "Total" }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const total = useMemo(() => slices.reduce((s, x) => s + x.value, 0), [slices]);

  const arcs = useMemo(() => {
    if (total <= 0) return [] as Arc[];
    const R = 54;
    const r = 34;
    const cx = 70;
    const cy = 70;
    const positive = slices.filter((s) => s.value > 0);
    if (positive.length === 0) return [] as Arc[];

    // Un solo valor = anillo completo (un arco de 360° en SVG no se dibuja).
    if (positive.length === 1) {
      const s = positive[0];
      return [{ ...s, d: null, full: true, pct: 100 }];
    }

    let angle = -Math.PI / 2;
    return positive.map((s) => {
      const sweep = (s.value / total) * Math.PI * 2;
      const a0 = angle;
      const a1 = angle + sweep;
      angle = a1;
      // Evitar arco casi completo con extremos que coinciden.
      const safeSweep = Math.min(sweep, Math.PI * 2 - 1e-4);
      const large = safeSweep > Math.PI ? 1 : 0;
      const x0 = cx + R * Math.cos(a0);
      const y0 = cy + R * Math.sin(a0);
      const x1 = cx + R * Math.cos(a0 + safeSweep);
      const y1 = cy + R * Math.sin(a0 + safeSweep);
      const xi0 = cx + r * Math.cos(a0 + safeSweep);
      const yi0 = cy + r * Math.sin(a0 + safeSweep);
      const xi1 = cx + r * Math.cos(a0);
      const yi1 = cy + r * Math.sin(a0);
      const d = [
        `M ${x0} ${y0}`,
        `A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`,
        `L ${xi0} ${yi0}`,
        `A ${r} ${r} 0 ${large} 0 ${xi1} ${yi1}`,
        "Z",
      ].join(" ");
      return { ...s, d, full: false, pct: (s.value / total) * 100 };
    });
  }, [slices, total]);

  if (total <= 0 || arcs.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-ink-muted md:h-56">Sin datos</div>
    );
  }

  const active = arcs.find((a) => a.key === hover) ?? null;
  const ringMid = (54 + 34) / 2;
  const ringWidth = 54 - 34;

  return (
    <div className="report-donut flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="relative mx-auto shrink-0 sm:mx-0">
        <svg
          viewBox="0 0 140 140"
          className="report-donut__svg h-44 w-44 md:h-52 md:w-52"
          role="img"
          aria-label="Distribución"
        >
          {arcs.map((a) =>
            a.full ? (
              <circle
                key={a.key}
                cx={70}
                cy={70}
                r={ringMid}
                fill="none"
                strokeWidth={ringWidth}
                className="cursor-pointer"
                style={{
                  stroke: a.color,
                  opacity: hover && hover !== a.key ? 0.45 : 1,
                }}
                onMouseEnter={() => setHover(a.key)}
                onMouseLeave={() => setHover(null)}
              />
            ) : (
              <path
                key={a.key}
                d={a.d!}
                className="cursor-pointer transition-opacity"
                style={{
                  fill: a.color,
                  opacity: hover && hover !== a.key ? 0.45 : 1,
                }}
                onMouseEnter={() => setHover(a.key)}
                onMouseLeave={() => setHover(null)}
              />
            ),
          )}
          <text x="70" y="64" textAnchor="middle" className="fill-ink-muted" style={{ fontSize: 11 }}>
            {centerLabel}
          </text>
          <text x="70" y="82" textAnchor="middle" className="fill-ink font-semibold" style={{ fontSize: 12 }}>
            {active ? `${active.pct.toFixed(0)}%` : formatMoney(total, currency)}
          </text>
        </svg>
      </div>
      <ul className="min-w-0 w-full flex-1 space-y-1.5 text-[13px] sm:w-auto">
        {arcs.map((a) => (
          <li
            key={a.key}
            className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-1 ${
              hover === a.key ? "bg-[var(--color-panel-muted)]" : ""
            }`}
            onMouseEnter={() => setHover(a.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-ink">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
              <span className="truncate">{a.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-ink-muted">
              {a.pct.toFixed(0)}% · {formatMoney(a.value, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
