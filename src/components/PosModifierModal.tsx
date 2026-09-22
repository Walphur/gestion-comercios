import { useState } from "react";
import { Modal, Button } from "./ui";
import { formatMoney } from "../lib/format";
import type { ProductModifier } from "../db/modifiers";
import type { Product } from "../types";

interface Props {
  open: boolean;
  product: Product | null;
  modifiers: ProductModifier[];
  currency: string;
  onClose: () => void;
  onConfirm: (selected: ProductModifier[]) => void;
}

export default function PosModifierModal({
  open,
  product,
  modifiers,
  currency,
  onClose,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (!product) return null;

  const picked = modifiers.filter((m) => selected.has(m.id));
  const extras = picked.reduce((acc, m) => acc + m.price_delta, 0);
  const total = product.price + extras;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Modal
      open={open}
      title={product.name}
      onClose={() => {
        setSelected(new Set());
        onClose();
      }}
    >
      <p className="mb-3 text-sm text-ink-muted">Elegí extras o variantes (opcional).</p>
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {modifiers.map((m) => {
          const on = selected.has(m.id);
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => toggle(m.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  on
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                    : "border-[var(--color-panel-border)] bg-[var(--color-input-bg)]"
                }`}
              >
                <span className="min-w-0 truncate text-sm font-medium text-ink">{m.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                  {m.price_delta === 0
                    ? "Sin cargo"
                    : m.price_delta > 0
                      ? `+${formatMoney(m.price_delta, currency)}`
                      : formatMoney(m.price_delta, currency)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink">
          Total línea: <strong className="tabular-nums">{formatMoney(total, currency)}</strong>
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setSelected(new Set());
              onClose();
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onConfirm(picked);
              setSelected(new Set());
            }}
          >
            Agregar
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onConfirm([]);
              setSelected(new Set());
            }}
          >
            Sin extras
          </Button>
        </div>
      </div>
    </Modal>
  );
}
