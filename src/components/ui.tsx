import { forwardRef, useEffect, useRef, useState, type ReactNode, type ElementType } from "react";
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
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 active:scale-[0.98] shadow-sm shadow-brand-600/15",
  secondary:
    "bg-[var(--color-input-bg)] text-ink border border-[var(--color-panel-border)] hover:bg-brand-50 dark:hover:bg-brand-950/40 hover:border-brand-300 active:scale-[0.98]",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 active:scale-[0.98]",
  ghost:
    "text-ink-muted hover:bg-brand-50 dark:hover:bg-brand-950/40 hover:text-brand-800 dark:hover:text-brand-200 active:scale-[0.98]",
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
  loading = false,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 disabled:shadow-none ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
}

const fieldClass =
  "wt-field w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-sm text-ink shadow-sm shadow-black/[0.02] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-muted/55 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-500/25";

/** Inputs compactos en celdas de tabla. */
export const tableCellInputClass =
  "wt-field min-w-0 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2.5 py-2 text-sm text-ink tabular-nums outline-none transition-[border-color,box-shadow] duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-500/25";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    label?: string;
    hint?: string;
    error?: string;
    startAdornment?: ReactNode;
    endAdornment?: ReactNode;
  }
>(function Input({ label, hint, error, className = "", id, startAdornment, endAdornment, ...props }, ref) {
  const inputId = id ?? (label ? `field-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const hasAdornment = Boolean(startAdornment || endAdornment);
  const inputEl = (
    <input
      ref={ref}
      id={inputId}
      aria-invalid={error ? true : undefined}
      aria-describedby={
        error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
      }
      className={`${fieldClass} ${error ? "border-red-400 focus:border-red-500 focus:ring-red-200 dark:focus:ring-red-900/40" : ""} ${startAdornment ? "pl-10" : ""} ${endAdornment ? "wt-field--adorned-end" : ""} ${className}`}
      {...props}
    />
  );
  return (
    <label className="block" htmlFor={inputId}>
      {label && <span className="field-label">{label}</span>}
      {hasAdornment ? (
        <div className="relative">
          {startAdornment && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
              {startAdornment}
            </span>
          )}
          {inputEl}
          {endAdornment && (
            <span className="absolute inset-y-0 right-1.5 flex items-center">{endAdornment}</span>
          )}
        </div>
      ) : (
        inputEl
      )}
      {hint && !error && (
        <span id={`${inputId}-hint`} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${inputId}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
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
  hint,
  error,
  className = "",
  value,
  onChange,
  ...props
}: NumericFieldProps & { label?: string; hint?: string; error?: string }) {
  return (
    <label className="block">
      {label && <span className="field-label">{label}</span>}
      <NumericField className={`${error ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""} ${className}`} value={value} onChange={onChange} {...props} />
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export function Select({
  label,
  hint,
  error,
  className = "",
  children,
  id,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string; error?: string }) {
  const selectId = id ?? (label ? `field-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <label className="block" htmlFor={selectId}>
      {label && <span className="field-label">{label}</span>}
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        className={`${fieldClass} ${error ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""} ${className}`}
        {...props}
      >
        {children}
      </select>
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

type CardVariant =
  | "default"
  | "elevated"
  | "kpi"
  | "kpi-featured"
  | "flat"
  | "form"
  | "items"
  | "summary";

const CARD_VARIANTS: Record<CardVariant, string> = {
  default: "wt-card p-4",
  elevated: "wt-card wt-card--elevated p-5",
  kpi: "wt-card wt-card--kpi",
  "kpi-featured": "wt-card wt-card--kpi-featured",
  flat: "border-0 bg-transparent p-0 shadow-none",
  form: "wt-card wt-card--form",
  items: "wt-card wt-card--items",
  summary: "wt-card wt-card--summary",
};

export function Card({
  children,
  className = "",
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  variant?: CardVariant;
}) {
  return <div className={`${CARD_VARIANTS[variant]} ${className}`.trim()}>{children}</div>;
}

export function SelectableCard({
  selected = false,
  onClick,
  icon: Icon,
  title,
  subtitle,
  className = "",
}: {
  selected?: boolean;
  onClick: () => void;
  icon?: ElementType;
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`selectable-card ${selected ? "selectable-card--selected" : ""} ${className}`.trim()}
    >
      {Icon && (
        <span className="selectable-card__icon" aria-hidden>
          <Icon size={18} strokeWidth={2.25} />
        </span>
      )}
      <span className="min-w-0">
        <span className="selectable-card__title">{title}</span>
        {subtitle && <span className="selectable-card__subtitle">{subtitle}</span>}
      </span>
    </button>
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
  return <div className={`page-content wt-animate-in editor-layout ${width} ${className}`.trim()}>{children}</div>;
}

export function CardSectionTitle({
  icon: Icon,
  title,
  description,
  className = "",
}: {
  icon?: ElementType;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`card-section-head ${className}`.trim()}>
      {Icon && (
        <span className="card-section-head__icon" aria-hidden>
          <Icon size={18} strokeWidth={2} />
        </span>
      )}
      <div className="min-w-0">
        <h3 className="card-section-head__title">{title}</h3>
        {description && <p className="card-section-head__desc">{description}</p>}
      </div>
    </div>
  );
}

export function SummaryTotalCard({
  lines,
  total,
  totalLabel = "Total",
}: {
  lines?: { label: string; value: string }[];
  total: string;
  totalLabel?: string;
}) {
  return (
    <Card variant="summary" className="text-right">
      {lines?.map((line) => (
        <p key={line.label} className="summary-total-card__line">
          <span>{line.label}</span>
          <span className="tabular-nums">{line.value}</span>
        </p>
      ))}
      <p className="summary-total-card__label">{totalLabel}</p>
      <p className="summary-total-card__value tabular-nums">{total}</p>
    </Card>
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
    <div className="flex items-start justify-between gap-4 border-b border-[var(--color-panel-border)] bg-[var(--color-panel)] px-5 pb-4 pt-5 lg:px-7">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{subtitle}</p>}
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
    <div
      className="wt-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wt-modal-title"
    >
      <div
        className={`wt-modal-panel max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] shadow-2xl ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--color-panel-border)] px-6 py-5">
          <h2 id="wt-modal-title" className="font-display text-xl font-semibold tracking-tight text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={tryClose}
            className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-brand-50 hover:text-brand-800 active:scale-95 dark:hover:bg-brand-900/40"
            aria-label="Cerrar"
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
  icon: Icon,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ElementType;
  compact?: boolean;
}) {
  return (
    <div className={`wt-empty ${compact ? "wt-empty--compact" : ""}`}>
      {Icon && (
        <div className="wt-empty-icon">
          <Icon size={compact ? 24 : 28} strokeWidth={1.75} />
        </div>
      )}
      <p className="wt-empty-title">{title}</p>
      {description && <p className="mt-1.5 text-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function FormSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title?: string;
  description?: string;
  icon?: ElementType;
  children: ReactNode;
}) {
  return (
    <section className="form-section">
      {title && (
        <div className="form-section-head">
          {Icon && (
            <span className="form-section-head__icon" aria-hidden>
              <Icon size={16} strokeWidth={2} />
            </span>
          )}
          <h3 className="form-section-title">{title}</h3>
        </div>
      )}
      {description && <p className="text-sm leading-relaxed text-ink-muted">{description}</p>}
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

export function FormActions({
  children,
  sticky = false,
}: {
  children: ReactNode;
  sticky?: boolean;
}) {
  return (
    <div className={`form-actions ${sticky ? "form-actions--sticky" : ""}`.trim()}>{children}</div>
  );
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
