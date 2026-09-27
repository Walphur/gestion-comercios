import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open, product?.id]);

  if (!product) return null;

  const sides = modifiers.filter((m) => m.linked_product_id);
  const extras = modifiers.filter((m) => !m.linked_product_id);
  const picked = modifiers.filter((m) => selected.has(m.id));
  const extraTotal = picked.reduce((acc, m) => acc + m.price_delta, 0);
  const total = product.price + extraTotal;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function close() {
    setSelected(new Set());
    onClose();
  }

  function OptionButton({ m }: { m: ProductModifier }) {
    const on = selected.has(m.id);
    return (
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
            ? "Incluida"
            : m.price_delta > 0
              ? `+${formatMoney(m.price_delta, currency)}`
              : formatMoney(m.price_delta, currency)}
        </span>
      </button>
    );
  }

  return (
    <Modal open={open} title={product.name} onClose={close}>
      {sides.length > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-sm font-semibold text-ink">Guarnición</p>
          <p className="mb-2 text-xs text-ink-muted">
            Elegí una, la otra o las dos. Cada una descuenta su stock.
          </p>
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {sides.map((m) => (
              <li key={m.id}>
                <OptionButton m={m} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {extras.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-sm font-semibold text-ink">Extras</p>
          <ul className="max-h-40 space-y-2 overflow-y-auto">
            {extras.map((m) => (
              <li key={m.id}>
                <OptionButton m={m} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {sides.length === 0 && extras.length === 0 ? (
        <p className="mb-3 text-sm text-ink-muted">Sin opciones.</p>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink">
          Total línea: <strong className="tabular-nums">{formatMoney(total, currency)}</strong>
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          {sides.length === 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                onConfirm([]);
                setSelected(new Set());
              }}
            >
              Sin extras
            </Button>
          )}
          <Button
            onClick={() => {
              onConfirm(picked);
              setSelected(new Set());
            }}
          >
            Agregar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
