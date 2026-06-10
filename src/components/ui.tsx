import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from "react";
import { X } from "lucide-react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20",
  secondary:
    "bg-[var(--color-input-bg)] text-ink border border-[var(--color-panel-border)] hover:bg-brand-50 dark:hover:bg-brand-900/30 hover:border-brand-300",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-ink-muted hover:bg-brand-50 dark:hover:bg-brand-900/40 hover:text-brand-800 dark:hover:text-brand-200",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const fieldClass =
  "w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:focus:ring-brand-800";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string }
>(function Input({ label, className = "", ...props }, ref) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-ink-muted">{label}</span>
      )}
      <input ref={ref} className={`${fieldClass} ${className}`} {...props} />
    </label>
  );
});

const DECIMAL_INPUT_RE = /^-?\d*(?:[.,]\d*)?$/;

function formatNumericDisplay(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(value);
}

function parseNumericText(text: string): number {
  const normalized = text.trim().replace(",", ".");
  if (normalized === "" || normalized === "-" || normalized === ".") return 0;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

type NumericFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number;
  onChange: (value: number) => void;
};

/** Input numérico sin etiqueta (tablas, celdas compactas). */
export function NumericField({
  className = "",
  value,
  onChange,
  step: _step,
  min,
  max,
  ...props
}: NumericFieldProps) {
  const [text, setText] = useState(() => formatNumericDisplay(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setText(formatNumericDisplay(value));
    }
  }, [value]);

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      className={`${fieldClass} ${className}`}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        props.onFocus?.(e);
      }}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "" || DECIMAL_INPUT_RE.test(next)) {
          setText(next);
        }
      }}
      onBlur={(e) => {
        focused.current = false;
        let parsed = parseNumericText(text);
        if (min != null && parsed < Number(min)) parsed = Number(min);
        if (max != null && parsed > Number(max)) parsed = Number(max);
        onChange(parsed);
        setText(formatNumericDisplay(parsed));
        props.onBlur?.(e);
      }}
    />
  );
}

/** Campo numérico que permite borrar con Delete/Backspace (no usa type=number). */
export function NumericInput({
  label,
  className = "",
  value,
  onChange,
  ...props
}: NumericFieldProps & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-ink-muted">{label}</span>
      )}
      <NumericField className={className} value={value} onChange={onChange} {...props} />
    </label>
  );
}

export function Select({
  label,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-ink-muted">{label}</span>
      )}
      <select className={`${fieldClass} ${className}`} {...props}>
        {children}
      </select>
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-5 shadow-sm shadow-brand-900/5 ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--color-panel-border)] bg-[var(--color-panel)] px-8 py-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
          checked ? "translate-x-[1.35rem]" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/** Botón Activo / Inactivo con contraste claro en tema oscuro. */
export function SegmentToggle({
  value,
  onChange,
  onLabel = "Activo",
  offLabel = "Inactivo",
  onActiveLabel,
  offActiveLabel,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  onLabel?: string;
  offLabel?: string;
  onActiveLabel?: string;
  offActiveLabel?: string;
}) {
  const onText = onActiveLabel ?? onLabel;
  const offText = offActiveLabel ?? offLabel;
  return (
    <div className="inline-flex rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-1">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`rounded-lg px-5 py-2 text-sm font-semibold transition-all ${
          value ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted hover:text-ink"
        }`}
      >
        {onText}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`rounded-lg px-5 py-2 text-sm font-semibold transition-all ${
          !value
            ? "bg-slate-600 text-white shadow-sm dark:bg-slate-500"
            : "text-ink-muted hover:text-ink"
        }`}
      >
        {offText}
      </button>
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  onRequestClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Si devuelve false, no cierra (p. ej. confirmación). */
  onRequestClose?: () => boolean | void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        const ok = onRequestClose?.();
        if (ok !== false) onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, onRequestClose]);

  if (!open) return null;
  function tryClose() {
    const ok = onRequestClose?.();
    if (ok !== false) onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/50 p-4 backdrop-blur-[2px]">
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] shadow-2xl shadow-brand-950/20 ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-panel-border)] px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <button
            onClick={tryClose}
            className="rounded-lg p-1.5 text-ink-muted hover:bg-brand-50 hover:text-brand-800 dark:hover:bg-brand-900/40"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
