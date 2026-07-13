import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, numberFieldFocusProps } from "./ui";
import EditableAmountInput from "./EditableAmountInput";
import AdjustPctInput from "./AdjustPctInput";
import { useAppConfig } from "../context/AppConfig";
import type { Sale, SaleItem } from "../types";
import type { SaleUpdateInput } from "../db/sales";
import {
  clampAdjustPct,
  exactDiscountPctFromFinalPrice,
  lineSubtotal,
  roundMoney,
} from "../lib/discount";
import { formatMoney } from "../lib/format";
import { confirmAction } from "../lib/confirm";

interface EditableLine {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  lineTargetTotal: number | null;
  stock_qty: number | null;
}

function lineFinal(line: EditableLine): number {
  if (line.lineTargetTotal != null) return line.lineTargetTotal;
  return roundMoney(line.unit_price * line.qty * (1 - line.discount_pct / 100));
}

function toEditable(items: SaleItem[]): EditableLine[] {
  return items.map((it) => ({
    id: it.id,
    product_id: it.product_id,
    variant_id: it.variant_id,
    name: it.name,
    qty: it.qty,
    unit_price: it.unit_price,
    discount_pct: it.discount_pct,
    lineTargetTotal: it.line_total,
    stock_qty: it.stock_qty ?? it.qty,
  }));
}

const PAYMENT_METHODS = [
  "efectivo",
  "débito",
  "crédito",
  "transferencia",
  "qr",
  "mercadopago",
  "fiado",
];

type Props = {
  sale: Sale;
  items: SaleItem[];
  saving: boolean;
  onCancel: () => void;
  onSave: (input: SaleUpdateInput) => Promise<void>;
};

export default function SaleEditPanel({ sale, items, saving, onCancel, onSave }: Props) {
  const { currency } = useAppConfig();
  const [lines, setLines] = useState<EditableLine[]>(() => toEditable(items));
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(sale.discount_pct);
  const [globalTargetTotal, setGlobalTargetTotal] = useState<number | null>(sale.total);
  const [paymentMethod, setPaymentMethod] = useState(sale.payment_method);
  const [paid, setPaid] = useState<number | "">(sale.paid ?? "");

  const subtotal = useMemo(
    () => roundMoney(lines.reduce((acc, line) => acc + lineFinal(line), 0)),
    [lines],
  );

  const total =
    globalTargetTotal != null
      ? roundMoney(globalTargetTotal)
      : roundMoney(subtotal * (1 - globalDiscount / 100));

  const saleGlobalDiscount =
    globalTargetTotal != null
      ? exactDiscountPctFromFinalPrice(subtotal, globalTargetTotal)
      : globalDiscount;

  function updateLine(id: number, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function setLineQty(id: number, qty: number) {
    updateLine(id, { qty: Math.max(0, qty), lineTargetTotal: null });
  }

  function setLineDiscount(id: number, pct: number) {
    updateLine(id, { discount_pct: clampAdjustPct(pct), lineTargetTotal: null });
  }

  function setLineFinalPrice(id: number, finalPrice: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const list = lineSubtotal(l.unit_price, l.qty);
        const target = roundMoney(Math.max(0, finalPrice));
        return {
          ...l,
          lineTargetTotal: target,
          discount_pct: exactDiscountPctFromFinalPrice(list, target),
        };
      }),
    );
  }

  function setGlobalDiscountPct(pct: number) {
    setGlobalTargetTotal(null);
    setGlobalDiscount(clampAdjustPct(pct));
  }

  function setGlobalDiscountFromTotal(desiredTotal: number) {
    const target = roundMoney(Math.max(0, desiredTotal));
    setGlobalTargetTotal(target);
    setGlobalDiscount(exactDiscountPctFromFinalPrice(subtotal, target));
  }

  async function removeLine(id: number) {
    const line = lines.find((l) => l.id === id);
    if (!line) return;
    const ok = await confirmAction({
      title: "Quitar producto",
      message: `¿Quitar «${line.name}» de la venta?`,
      variant: "danger",
      confirmLabel: "Sí, quitar",
    });
    if (!ok) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
    setRemovedIds((prev) => [...prev, id]);
  }

  async function handleSave() {
    if (lines.length === 0) {
      alert("La venta debe tener al menos un producto.");
      return;
    }
    const paidAmount =
      paymentMethod === "efectivo"
        ? typeof paid === "number"
          ? paid
          : total
        : paymentMethod === "fiado"
          ? null
          : total;
    const changeDue =
      paidAmount != null && paidAmount >= total ? paidAmount - total : null;

    await onSave({
      subtotal,
      discount_pct: saleGlobalDiscount,
      total,
      payment_method: paymentMethod,
      paid: paidAmount,
      change_due: changeDue,
      removed_item_ids: removedIds,
      items: lines.map((l) => ({
        id: l.id,
        product_id: l.product_id,
        variant_id: l.variant_id,
        name: l.name,
        qty: l.qty,
        unit_price: l.unit_price,
        discount_pct: l.discount_pct,
        line_total: lineFinal(l),
        stock_qty: l.stock_qty ?? l.qty,
      })),
    });
  }

  return (
    <div>
      <p className="mb-4 text-sm text-ink-muted">
        Corregí cantidades, precios o el total. El stock se ajusta automáticamente al guardar.
      </p>

      <div className="space-y-3">
        {lines.map((line) => {
          const listPrice = lineSubtotal(line.unit_price, line.qty);
          const finalPrice = lineFinal(line);

          return (
            <div
              key={line.id}
              className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-ink">{line.name}</p>
                <button
                  type="button"
                  onClick={() => void removeLine(line.id)}
                  className="text-ink-muted hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <label className="flex flex-col gap-1">
                  <span className="text-ink-muted">Cant.</span>
                  <input
                    type="number"
                    min={0}
                    value={line.qty}
                    onChange={(e) => setLineQty(line.id, Number(e.target.value))}
                    className="wt-field--number rounded border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-2 py-1 tabular-nums"
                    {...numberFieldFocusProps()}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-ink-muted">Lista</span>
                  <span className="px-2 py-1 tabular-nums">{formatMoney(listPrice, currency)}</span>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-ink-muted">Ajuste %</span>
                  <AdjustPctInput
                    internalValue={line.discount_pct}
                    onChangeInternal={(pct) => setLineDiscount(line.id, pct)}
                    className="rounded border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-2 py-1 tabular-nums"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-ink-muted">A cobrar</span>
                  <EditableAmountInput
                    value={finalPrice}
                    onCommit={(amount) => setLineFinalPrice(line.id, amount)}
                    className="rounded border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-2 py-1 tabular-nums"
                  />
                </label>
              </div>
              <p className="mt-1 text-right text-sm font-semibold tabular-nums">
                {formatMoney(finalPrice, currency)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 space-y-3 rounded-xl border border-[var(--color-panel-border)] p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">Subtotal</span>
          <span className="font-medium tabular-nums">{formatMoney(subtotal, currency)}</span>
        </div>
        <div className="grid grid-cols-[1fr_7rem] items-center gap-3">
          <span className="text-sm text-ink-muted">Ajuste %</span>
          <AdjustPctInput
            internalValue={saleGlobalDiscount}
            onChangeInternal={setGlobalDiscountPct}
            className="rounded border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1 text-right text-sm tabular-nums"
          />
        </div>
        <div className="grid grid-cols-[1fr_7rem] items-center gap-3">
          <span className="text-sm font-medium text-ink">Total a cobrar</span>
          <EditableAmountInput
            value={total}
            onCommit={setGlobalDiscountFromTotal}
            className="rounded border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1 text-right text-sm font-bold tabular-nums"
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-sm text-ink-muted">Medio de pago</span>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        {paymentMethod === "efectivo" && (
          <label className="block">
            <span className="mb-1 block text-sm text-ink-muted">Paga con</span>
            <input
              type="number"
              min={0}
              value={paid}
              onChange={(e) =>
                setPaid(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="wt-field--number w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm tabular-nums"
              {...numberFieldFocusProps()}
            />
          </label>
        )}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
