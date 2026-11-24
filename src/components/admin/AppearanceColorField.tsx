import { useEffect, useId, useState } from "react";
import { RotateCcw } from "lucide-react";
import { hexToRgb, normalizeHex, rgbToHex } from "../../config/branding";
import { IconButton } from "../ui";

interface Props {
  label: string;
  hint?: string;
  value: string;
  onChange: (hex: string) => void;
  onReset: () => void;
}

/**
 * Control de color: swatch nativo (diálogo del SO, sin clip), HEX pegable, RGB y reset.
 * Un cambio acá no toca las otras propiedades.
 */
export default function AppearanceColorField({
  label,
  hint,
  value,
  onChange,
  onReset,
}: Props) {
  const id = useId();
  const rgb = hexToRgb(value) ?? { r: 0, g: 0, b: 0 };
  const [hexDraft, setHexDraft] = useState(value);
  const [rDraft, setRDraft] = useState(String(rgb.r));
  const [gDraft, setGDraft] = useState(String(rgb.g));
  const [bDraft, setBDraft] = useState(String(rgb.b));
  const [hexError, setHexError] = useState<string | null>(null);

  useEffect(() => {
    setHexDraft(value);
    const next = hexToRgb(value);
    if (next) {
      setRDraft(String(next.r));
      setGDraft(String(next.g));
      setBDraft(String(next.b));
    }
    setHexError(null);
  }, [value]);

  function commitHex(raw: string) {
    const n = normalizeHex(raw);
    if (!n) {
      setHexError("Usá un HEX de 6 dígitos (ej. #2563eb)");
      return;
    }
    setHexError(null);
    setHexDraft(n);
    onChange(n);
  }

  function commitRgb(rStr: string, gStr: string, bStr: string) {
    const r = Number.parseInt(rStr, 10);
    const g = Number.parseInt(gStr, 10);
    const b = Number.parseInt(bStr, 10);
    if ([r, g, b].some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      setHexError("RGB debe ser 0–255");
      return;
    }
    setHexError(null);
    onChange(rgbToHex(r, g, b));
  }

  return (
    <div className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)]/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <label htmlFor={`${id}-hex`} className="text-sm font-semibold text-ink">
            {label}
          </label>
          {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
        </div>
        <IconButton label={`Restablecer ${label}`} onClick={() => onReset()}>
          <RotateCcw size={16} />
        </IconButton>
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3">
        {/* Swatch: input nativo absoluto dentro del área — el picker del SO no se clippea en el panel */}
        <label
          className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-[var(--color-panel-border)] shadow-sm ring-offset-2 focus-within:ring-2 focus-within:ring-brand-500/40"
          style={{ backgroundColor: value }}
          title="Elegir color"
        >
          <input
            type="color"
            value={normalizeHex(value) ?? "#000000"}
            onChange={(e) => {
              const n = normalizeHex(e.target.value);
              if (n) onChange(n);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`Selector visual de ${label}`}
          />
        </label>

        <div className="min-w-0 flex-1 basis-[10rem]">
          <span className="mb-1 block text-[11px] font-medium text-ink-muted">HEX</span>
          <input
            id={`${id}-hex`}
            className="wt-field w-full min-w-0 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2.5 py-2 font-mono text-sm tabular-nums text-ink"
            value={hexDraft}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setHexDraft(e.target.value);
              setHexError(null);
            }}
            onBlur={() => commitHex(hexDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitHex(hexDraft);
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              const n = normalizeHex(text);
              if (n) {
                e.preventDefault();
                commitHex(n);
              }
            }}
          />
        </div>

        <div className="flex min-w-0 flex-[1.2] basis-[12rem] gap-1.5">
          {(
            [
              ["R", rDraft, setRDraft],
              ["G", gDraft, setGDraft],
              ["B", bDraft, setBDraft],
            ] as const
          ).map(([ch, draft, setDraft]) => (
            <label key={ch} className="min-w-0 flex-1">
              <span className="mb-1 block text-[11px] font-medium text-ink-muted">{ch}</span>
              <input
                type="number"
                min={0}
                max={255}
                inputMode="numeric"
                className="wt-field w-full min-w-0 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-1.5 py-2 text-center font-mono text-sm tabular-nums text-ink"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitRgb(rDraft, gDraft, bDraft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitRgb(rDraft, gDraft, bDraft);
                  }
                }}
                aria-label={`${label} canal ${ch}`}
              />
            </label>
          ))}
        </div>
      </div>

      {hexError && (
        <p className="field-error mt-2" role="alert">
          {hexError}
        </p>
      )}
    </div>
  );
}
