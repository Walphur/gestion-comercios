/** Botones de escritura rápida: al tocar, completan el campo. */

interface Chip {
  label: string;
  value: string;
}

interface Props {
  chips: Chip[];
  disabled?: boolean;
  /** Si true, reemplaza el valor. Si false, lo agrega si está vacío o concatena. */
  replace?: boolean;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}

export default function QuickWriteChips({
  chips,
  disabled,
  replace = true,
  value,
  onChange,
  className = "",
}: Props) {
  if (!chips.length) return null;

  function apply(chip: Chip) {
    if (disabled) return;
    if (replace || !value.trim()) {
      onChange(chip.value);
      return;
    }
    if (value.includes(chip.value)) return;
    onChange(`${value.trim()}\n${chip.value}`);
  }

  return (
    <div className={`flex min-w-0 flex-wrap gap-1.5 ${className}`.trim()}>
      {chips.map((chip) => {
        const active = value.trim() === chip.value || value.includes(chip.value);
        return (
          <button
            key={chip.label}
            type="button"
            disabled={disabled}
            onClick={() => apply(chip)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              active
                ? "border-brand-500 bg-brand-50 text-brand-800 dark:border-brand-400 dark:bg-brand-900/40 dark:text-brand-100"
                : "border-[var(--color-panel-border)] bg-[var(--color-input-bg)] text-ink-muted hover:border-brand-300 hover:text-ink"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

export const QUOTE_NOTES_CHIPS: Chip[] = [
  {
    label: "Precios sujetos a variación",
    value: "Precios sujetos a variación sin aviso previo.",
  },
  {
    label: "Plazo de entrega",
    value: "Plazo de entrega a confirmar según stock y agenda.",
  },
  {
    label: "Válido 7 días",
    value: "Presupuesto válido por 7 días corridos.",
  },
];

export const APPOINTMENT_TITLE_CHIPS: Chip[] = [
  { label: "Consulta", value: "Consulta" },
  { label: "Atención", value: "Atención" },
  { label: "Control", value: "Control" },
  { label: "Service", value: "Service" },
];

export const APPOINTMENT_TITLE_CHIPS_TALLER: Chip[] = [
  { label: "Diagnóstico", value: "Diagnóstico" },
  { label: "Reparación", value: "Reparación" },
  { label: "Service", value: "Service" },
  { label: "Alineación", value: "Alineación" },
];

export const SERVICE_ORDER_TITLE_CHIPS: Chip[] = [
  { label: "Reparación", value: "Reparación" },
  { label: "Instalación", value: "Instalación" },
  { label: "Servicio", value: "Servicio" },
  { label: "Service", value: "Service" },
];

export const SERVICE_ORDER_TITLE_CHIPS_TALLER: Chip[] = [
  { label: "Reparación", value: "Reparación" },
  { label: "Service", value: "Service" },
  { label: "Frenos", value: "Frenos" },
  { label: "Tren delantero", value: "Tren delantero" },
];
