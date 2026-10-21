import { useEffect, useMemo, useState } from "react";
import { Search, Smartphone } from "lucide-react";
import { EmptyState, Input, Modal } from "../ui";
import type { ProductUnit } from "../../db/phoneUnits";
import type { Product } from "../../types";
import { formatMoney } from "../../lib/format";
import { UNIT_CONDITION_LABELS } from "../../lib/imei";

export function unitSummary(u: Pick<ProductUnit, "condition" | "color" | "capacity" | "battery_pct">): string {
  return [
    UNIT_CONDITION_LABELS[u.condition] ?? u.condition,
    u.capacity,
    u.color,
    u.condition !== "nuevo" && u.battery_pct != null ? `batería ${u.battery_pct}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function UnitPickerModal({
  open,
  product,
  units,
  currency,
  priceFor,
  takenIds,
  onPick,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  units: ProductUnit[];
  currency: string;
  priceFor: (unit: ProductUnit) => number;
  takenIds: Set<number>;
  onPick: (unit: ProductUnit) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return units.filter(
      (u) =>
        !takenIds.has(u.id) &&
        (!term ||
          u.identifier.toLowerCase().includes(term) ||
          (u.color ?? "").toLowerCase().includes(term) ||
          (u.capacity ?? "").toLowerCase().includes(term)),
    );
  }, [units, q, takenIds]);

  return (
    <Modal
      open={open}
      title="Elegí el equipo"
      subtitle={product ? `${product.name}: escaneá o tocá el IMEI que sale.` : undefined}
      icon={<Smartphone size={18} />}
      onClose={onClose}
    >
      <div className="min-w-0 space-y-3">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && visible.length === 1) {
              e.preventDefault();
              onPick(visible[0]);
            }
          }}
          placeholder="IMEI, últimos números, color o capacidad"
          startAdornment={<Search size={16} />}
        />
        {visible.length === 0 ? (
          <EmptyState
            compact
            icon={Smartphone}
            title="No hay equipos a la venta"
            description="Cargá los IMEI de este modelo en Celulares."
          />
        ) : (
          <ul className="max-h-[55vh] min-w-0 space-y-2 overflow-y-auto overflow-x-hidden">
            {visible.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onPick(u)}
                  className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-left hover:border-brand-400"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm font-semibold text-ink">{u.identifier}</span>
                    <span className="block truncate text-xs text-ink-muted">{unitSummary(u)}</span>
                    {u.status === "reserved" ? (
                      <span className="mt-0.5 block truncate text-xs font-medium text-amber-700 dark:text-amber-300">
                        Reservada para {u.reserved_customer_name ?? "un cliente"}
                        {u.reserved_deposit ? ` · seña ${formatMoney(u.reserved_deposit, currency)}` : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-600 dark:text-brand-300">
                    {formatMoney(priceFor(u), currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
