import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from "react";
import { X } from "lucide-react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm shadow-brand-600/15",
  secondary:
    "bg-[var(--color-input-bg)] text-ink border border-[var(--color-panel-border)] hover:bg-brand-50 dark:hover:bg-brand-950/40 hover:border-brand-300",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
  ghost:
    "text-ink-muted hover:bg-brand-50 dark:hover:bg-brand-950/40 hover:text-brand-800 dark:hover:text-brand-200",
};

const SIZES: Record<Size, string> = {
  sm: "rounded-lg px-3 py-1.5 text-xs",
  md: "rounded-xl px-4 py-2 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
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
      className={`rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function PageContent({
  children,
  className = "",
  narrow = false,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
  wide?: boolean;
}) {
  const width = narrow ? "page-content--narrow" : wide ? "page-content--wide" : "";
  return <div className={`page-content wt-animate-in ${width} ${className}`.trim()}>{children}</div>;
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
    <div className="flex items-start justify-between gap-4 border-b border-[var(--color-panel-border)] bg-[var(--color-panel)] px-6 pb-4 pt-6 lg:px-8">
      <div className="min-w-0">
        <h1 className="font-display text-lg font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]">
      <div
        className={`wt-modal-panel max-h-[90vh] w-full overflow-y-auto rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] shadow-xl ${
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

type AlertVariant = "success" | "warning" | "danger" | "info";

export function Alert({
  variant = "info",
  children,
  className = "",
}: {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}) {
  return <div className={`wt-alert wt-alert--${variant} ${className}`}>{children}</div>;
}

type BadgeVariant = "success" | "warning" | "danger" | "neutral";

export function Badge({
  variant = "neutral",
  children,
  className = "",
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return <span className={`wt-badge wt-badge--${variant} ${className}`}>{children}</span>;
}

export function IconButton({
  label,
  variant = "ghost",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: "ghost" | "danger";
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`wt-icon-btn ${variant === "danger" ? "wt-icon-btn--danger" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={`wt-spinner text-brand-600 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="wt-empty">
      <p className="wt-empty-title">{title}</p>
      {description && <p className="mt-1 text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="form-section">
      {title && <h3 className="form-section-title">{title}</h3>}
      {description && <p className="text-sm text-ink-muted">{description}</p>}
      {children}
    </section>
  );
}

export function FormGrid({
  children,
  cols = 1,
  className = "",
}: {
  children: ReactNode;
  cols?: 1 | 2;
  className?: string;
}) {
  return (
    <div className={`form-grid ${cols === 2 ? "form-grid--2" : ""} ${className}`}>{children}</div>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="form-actions">{children}</div>;
}

export function DataTableShell({
  children,
  footer,
  className = "",
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`data-table-wrap overflow-hidden ${className}`}>
      {children}
      {footer}
    </div>
  );
}

export function TablePagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="table-pagination">
      <span>
        {from}–{to} de {total}
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
