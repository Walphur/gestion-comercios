import { useId, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
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

type Coord = EvolutionPoint & { x: number; ySales: number; yCol: number };

function niceMax(n: number): number {
  if (n <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(n));
  const m = n / pow;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return nice * pow;
}

function formatAxisDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso.slice(5);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const month = months[Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${month}`;
}

function formatAxisMoney(n: number, currency: string): string {
  if (n >= 1_000_000) return `${currency === "ARS" ? "$" : ""}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${currency === "ARS" ? "$" : ""}${Math.round(n / 1000)}k`;
  return formatMoney(n, currency);
}

/** Catmull-Rom → cubic Bezier path (suave; 1–2 puntos = línea simple). */
function smoothPath(coords: Coord[], key: "ySales" | "yCol"): string {
  const n = coords.length;
  if (n === 0) return "";
  if (n === 1) {
    const c = coords[0];
    return `M${c.x.toFixed(1)},${c[key].toFixed(1)}`;
  }
  if (n === 2) {
    const a = coords[0];
    const b = coords[1];
    return `M${a.x.toFixed(1)},${a[key].toFixed(1)} L${b.x.toFixed(1)},${b[key].toFixed(1)}`;
  }

  let d = `M${coords[0].x.toFixed(1)},${coords[0][key].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = coords[i === 0 ? 0 : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1[key] + (p2[key] - p0[key]) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2[key] - (p3[key] - p1[key]) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2[key].toFixed(1)}`;
  }
  return d;
}

function areaFromLine(line: string, coords: Coord[], baselineY: number): string {
  if (!line || coords.length === 0) return "";
  const last = coords[coords.length - 1];
  const first = coords[0];
  return `${line} L${last.x.toFixed(1)},${baselineY.toFixed(1)} L${first.x.toFixed(1)},${baselineY.toFixed(1)} Z`;
}

/** Línea de ventas vs cobrado (SVG, sin dependencia externa). */
export default function EvolutionChart({ points, currency, changePct }: Props) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const ordered = useMemo(
    () => [...points].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
    [points],
  );

  const W = 720;
  const H = 248;
  const pad = { t: 14, r: 14, b: 30, l: 44 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const baselineY = pad.t + innerH;

  const maxY = useMemo(() => {
    let m = 0;
    for (const p of ordered) m = Math.max(m, p.sales, p.collected);
    return niceMax(m);
  }, [ordered]);

  const yTicks = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map((t) => ({ t, value: maxY * t })), [maxY]);

  const coords = useMemo((): Coord[] => {
    if (ordered.length === 0) return [];
    const n = ordered.length;
    return ordered.map((p, i) => {
      const x = pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const ySales = pad.t + innerH - (p.sales / maxY) * innerH;
      const yCol = pad.t + innerH - (p.collected / maxY) * innerH;
      return { ...p, x, ySales, yCol };
    });
  }, [ordered, maxY, innerW, innerH, pad.l, pad.t]);

  const salesPath = useMemo(() => smoothPath(coords, "ySales"), [coords]);
  const colPath = useMemo(() => smoothPath(coords, "yCol"), [coords]);
  const salesArea = useMemo(() => areaFromLine(salesPath, coords, baselineY), [salesPath, coords, baselineY]);
  const colArea = useMemo(() => areaFromLine(colPath, coords, baselineY), [colPath, coords, baselineY]);

  const labelStep = useMemo(() => {
    const n = coords.length;
    if (n <= 8) return 1;
    if (n <= 16) return 2;
    return Math.ceil(n / 7);
  }, [coords.length]);

  if (ordered.length === 0) {
    return (
      <div className="report-chart-empty flex h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-panel-border)] px-4 text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
          <TrendingUp size={18} />
        </span>
        <p className="text-sm font-medium text-ink">Sin datos para graficar</p>
        <p className="max-w-xs text-xs text-ink-muted">
          Cuando haya ventas en el período, vas a ver la evolución día a día.
        </p>
      </div>
    );
  }

  const tip = hover != null ? coords[hover] : null;
  const tipLeftPct = tip ? Math.min(88, Math.max(12, (tip.x / W) * 100)) : 50;

  return (
    <div className="relative min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label="Evolución de ventas y cobrado"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`sales-fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`col-fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map(({ t, value }) => {
          const y = pad.t + innerH * (1 - t);
          return (
            <g key={t}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-[var(--color-panel-border)]"
                strokeWidth={1}
                strokeDasharray={t === 0 ? undefined : "3 5"}
                opacity={t === 0 ? 0.9 : 0.7}
              />
              <text
                x={pad.l - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-ink-muted"
                style={{ fontSize: 9.5 }}
              >
                {formatAxisMoney(value, currency)}
              </text>
            </g>
          );
        })}

        <path d={salesArea} fill={`url(#sales-fill-${gid})`} />
        <path d={colArea} fill={`url(#col-fill-${gid})`} />
        <path
          d={salesPath}
          fill="none"
          stroke="var(--color-brand-500)"
          strokeWidth={2.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={colPath}
          fill="none"
          stroke="#10b981"
          strokeWidth={2.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {coords.map((c, i) => {
          const showLabel = i === 0 || i === coords.length - 1 || i % labelStep === 0;
          const band = Math.max(innerW / Math.max(coords.length, 1), 14);
          return (
            <g key={c.day}>
              <circle
                cx={c.x}
                cy={c.ySales}
                r={hover === i ? 5 : coords.length <= 3 ? 4 : 3}
                fill="var(--color-brand-500)"
                stroke="var(--color-panel)"
                strokeWidth={1.5}
              />
              <circle
                cx={c.x}
                cy={c.yCol}
                r={hover === i ? 5 : coords.length <= 3 ? 4 : 3}
                fill="#10b981"
                stroke="var(--color-panel)"
                strokeWidth={1.5}
              />
              <rect
                x={c.x - band / 2}
                y={pad.t}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              {showLabel ? (
                <text
                  x={c.x}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-ink-muted"
                  style={{ fontSize: 10 }}
                >
                  {formatAxisDay(c.day)}
                </text>
              ) : null}
            </g>
          );
        })}

        {tip ? (
          <line
            x1={tip.x}
            x2={tip.x}
            y1={pad.t}
            y2={baselineY}
            stroke="var(--color-brand-400)"
            strokeWidth={1}
            strokeDasharray="3 4"
            opacity={0.55}
          />
        ) : null}
      </svg>

      {tip ? (
        <div
          className="pointer-events-none absolute top-9 z-10 min-w-[10.5rem] -translate-x-1/2 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-3 py-2 text-xs shadow-lg"
          style={{ left: `${tipLeftPct}%` }}
          role="tooltip"
        >
          <p className="font-semibold text-ink">{formatAxisDay(tip.day)}</p>
          <p className="mt-1 flex items-center justify-between gap-3 text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Ventas
            </span>
            <span className="font-medium tabular-nums text-ink">{formatMoney(tip.sales, currency)}</span>
          </p>
          <p className="mt-0.5 flex items-center justify-between gap-3 text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Cobrado
            </span>
            <span className="font-medium tabular-nums text-ink">{formatMoney(tip.collected, currency)}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
