import { Plus, Trash2 } from "lucide-react";
import { NumericField } from "./ui";
import { formatUnitShort } from "../lib/format";
import { MAX_QTY_DISCOUNT_TIERS, type QtyDiscountTier } from "../lib/qtyDiscount";

const cellClass =
  "w-full min-w-0 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1.5 text-sm tabular-nums text-ink outline-none focus:border-brand-500";

/** Escalones «desde X → Y %». La caja los aplica sola y el cajero los puede cambiar. */
export default function QtyDiscountField({
  value,
  onChange,
  unit,
}: {
  value: QtyDiscountTier[];
  onChange: (tiers: QtyDiscountTier[]) => void;
  unit: string;
}) {
  const unitLabel = formatUnitShort(unit || "unidad");
  const update = (index: number, patch: Partial<QtyDiscountTier>) =>
    onChange(value.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const add = () => {
    const last = value[value.length - 1];
    onChange([...value, { min_qty: last ? last.min_qty + 1 : 2, pct: last ? last.pct : 10 }]);
  };

  return (
    <div className="mt-4 min-w-0">
      <p className="text-sm font-semibold text-ink">Descuento por cantidad</p>
      <p className="mt-1 text-xs text-ink-muted">
        Opcional. Si en la caja se carga esa cantidad o más, se aplica el descuento solo. El cajero lo puede
        cambiar o sacar.
      </p>
      {value.length > 0 ? (
        <div className="mt-2 grid min-w-0 gap-2">
          {value.map((t, i) => (
            <div
              key={i}
              className="grid min-w-0 grid-cols-[auto_minmax(0,6rem)_auto_minmax(0,5rem)_auto_auto] items-center gap-2 text-sm text-ink"
            >
              <span className="text-ink-muted">Desde</span>
              <NumericField
                value={t.min_qty}
                min={0}
                onChange={(v) => update(i, { min_qty: Math.max(0, v) })}
                className={cellClass}
                aria-label={`Cantidad mínima del escalón ${i + 1}`}
              />
              <span className="truncate text-ink-muted">{unitLabel} →</span>
              <NumericField
                value={t.pct}
                min={0}
                max={100}
                onChange={(v) => update(i, { pct: Math.min(100, Math.max(0, v)) })}
                className={cellClass}
                aria-label={`Descuento del escalón ${i + 1}`}
              />
              <span className="text-ink-muted">% off</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="rounded-md p-1 text-ink-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                aria-label={`Quitar escalón ${i + 1}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {value.length < MAX_QTY_DISCOUNT_TIERS ? (
        <button
          type="button"
          onClick={add}
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-[var(--color-panel-border)] px-3 py-1 text-xs font-semibold text-ink hover:bg-brand-50 dark:hover:bg-brand-900/40"
        >
          <Plus size={13} />
          {value.length === 0 ? "Agregar descuento por cantidad" : "Agregar otro escalón"}
        </button>
      ) : null}
    </div>
  );
}
