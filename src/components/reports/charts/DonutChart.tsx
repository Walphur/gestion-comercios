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
  "var(--color-brand-500, #8b5cf6)",
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

/** Donut simple con tooltip (SVG). */
export default function DonutChart({ slices, currency, centerLabel = "Total" }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const total = useMemo(() => slices.reduce((s, x) => s + x.value, 0), [slices]);

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    const R = 54;
    const r = 34;
    const cx = 70;
    const cy = 70;
    let angle = -Math.PI / 2;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const sweep = (s.value / total) * Math.PI * 2;
        const a0 = angle;
        const a1 = angle + sweep;
        angle = a1;
        const large = sweep > Math.PI ? 1 : 0;
        const x0 = cx + R * Math.cos(a0);
        const y0 = cy + R * Math.sin(a0);
        const x1 = cx + R * Math.cos(a1);
        const y1 = cy + R * Math.sin(a1);
        const xi0 = cx + r * Math.cos(a1);
        const yi0 = cy + r * Math.sin(a1);
        const xi1 = cx + r * Math.cos(a0);
        const yi1 = cy + r * Math.sin(a0);
        const d = [
          `M ${x0} ${y0}`,
          `A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`,
          `L ${xi0} ${yi0}`,
          `A ${r} ${r} 0 ${large} 0 ${xi1} ${yi1}`,
          "Z",
        ].join(" ");
        return { ...s, d, pct: (s.value / total) * 100 };
      });
  }, [slices, total]);

  if (total <= 0 || arcs.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-muted">Sin datos</div>
    );
  }

  const active = arcs.find((a) => a.key === hover) ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative mx-auto shrink-0">
        <svg viewBox="0 0 140 140" className="h-36 w-36" role="img" aria-label="Distribución">
          {arcs.map((a) => (
            <path
              key={a.key}
              d={a.d}
              fill={a.color}
              opacity={hover && hover !== a.key ? 0.45 : 1}
              className="cursor-pointer transition-opacity"
              onMouseEnter={() => setHover(a.key)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
          <text x="70" y="66" textAnchor="middle" className="fill-ink-muted" style={{ fontSize: 10 }}>
            {centerLabel}
          </text>
          <text x="70" y="84" textAnchor="middle" className="fill-ink font-semibold" style={{ fontSize: 11 }}>
            {active ? `${active.pct.toFixed(0)}%` : formatMoney(total, currency)}
          </text>
        </svg>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {arcs.map((a) => (
          <li
            key={a.key}
            className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${
              hover === a.key ? "bg-[var(--color-panel-muted)]" : ""
            }`}
            onMouseEnter={() => setHover(a.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="inline-flex min-w-0 items-center gap-2 truncate text-ink">
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
