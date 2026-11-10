import { useEffect, useRef, useState } from "react";
import { NotebookPen, X } from "lucide-react";
import { fieldClass } from "./ui";
import { SALE_NOTE_MAX } from "../lib/saleNote";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Se abre solo (sin tomar el foco), p. ej. con fiado o cuenta corriente. */
  autoOpen?: boolean;
  /** Enter dentro del campo (el cobro lo usa para confirmar). */
  onEnter?: () => void;
  inputClassName?: string;
  autoFocus?: boolean;
}

/** «+ Agregar detalle» que se abre en un campo de una línea: quién retiró, para qué… */
export default function SaleNoteField({
  value,
  onChange,
  autoOpen = false,
  onEnter,
  inputClassName = fieldClass,
  autoFocus = false,
}: Props) {
  const [manualOpen, setManualOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusOnOpen = useRef(false);
  const open = manualOpen || autoOpen || value.trim() !== "";

  useEffect(() => {
    if (open && focusOnOpen.current) {
      focusOnOpen.current = false;
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        className="self-start text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
        onClick={() => {
          focusOnOpen.current = true;
          setManualOpen(true);
        }}
        data-testid="sale-note-open"
      >
        + Agregar detalle
      </button>
    );
  }

  return (
    <label className="block min-w-0">
      <span className="mb-1 flex min-w-0 items-center justify-between gap-2 text-sm font-medium text-ink-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          <NotebookPen size={14} className="shrink-0" aria-hidden />
          <span className="truncate">Detalle (quién retiró, para qué…)</span>
        </span>
        {!autoOpen && value.trim() === "" ? (
          <button
            type="button"
            className="shrink-0 text-ink-muted hover:text-ink"
            aria-label="Cerrar detalle"
            onClick={() => setManualOpen(false)}
          >
            <X size={14} />
          </button>
        ) : (
          <span className="shrink-0 text-xs tabular-nums">
            {value.length}/{SALE_NOTE_MAX}
          </span>
        )}
      </span>
      <input
        ref={inputRef}
        type="text"
        autoFocus={autoFocus}
        value={value}
        maxLength={SALE_NOTE_MAX}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            if (!e.repeat) onEnter();
          }
        }}
        placeholder="Ej: Garrafa, la llevó Juan"
        className={inputClassName}
        data-testid="sale-note-input"
      />
    </label>
  );
}
