/** Selector visual de nivel de combustible (barra / tanque). */

export const FUEL_LEVELS = ["Vacío", "1/4", "1/2", "3/4", "Lleno"] as const;

const LEVEL_FRACTION: Record<string, number> = {
  Vacío: 0,
  "1/4": 0.25,
  "1/2": 0.5,
  "3/4": 0.75,
  Lleno: 1,
};

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export default function FuelLevelPicker({ value, onChange, disabled }: Props) {
  const frac = LEVEL_FRACTION[value] ?? null;

  return (
    <div className="min-w-0 space-y-2">
      <label className="block text-sm font-medium text-ink">Combustible</label>

      <div
        className={`relative overflow-hidden rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-3 ${
          disabled ? "opacity-60" : ""
        }`}
      >
        <div className="mb-2 flex items-end gap-3">
          {/* Silueta simple de tanque */}
          <div
            className="relative h-14 w-9 shrink-0 rounded-md border-2 border-ink-muted/70 bg-black/10 dark:bg-white/5"
            aria-hidden
          >
            <div className="absolute -top-1.5 left-1/2 h-1.5 w-4 -translate-x-1/2 rounded-t bg-ink-muted/70" />
            <div className="absolute inset-x-0.5 bottom-0.5 top-0.5 overflow-hidden rounded-sm">
              <div
                className="absolute inset-x-0 bottom-0 bg-emerald-500/80 transition-[height] duration-200"
                style={{ height: `${(frac ?? 0) * 100}%` }}
              />
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="relative h-4 overflow-hidden rounded-full bg-black/15 dark:bg-white/10">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-[width] duration-200"
                style={{ width: `${(frac ?? 0) * 100}%` }}
              />
              {/* marcas */}
              {[0.25, 0.5, 0.75].map((m) => (
                <span
                  key={m}
                  className="absolute inset-y-0 w-px bg-white/40"
                  style={{ left: `${m * 100}%` }}
                />
              ))}
            </div>
            <p className="text-xs text-ink-muted">
              {value ? `Nivel: ${value}` : "Tocá un nivel o la barra"}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap gap-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("")}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              !value
                ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100"
                : "border-[var(--color-panel-border)] text-ink-muted hover:text-ink"
            }`}
          >
            Sin indicar
          </button>
          {FUEL_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              disabled={disabled}
              onClick={() => onChange(level)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                value === level
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-100"
                  : "border-[var(--color-panel-border)] text-ink-muted hover:text-ink"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
