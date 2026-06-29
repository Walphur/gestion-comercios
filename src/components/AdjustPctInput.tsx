import { useState, type KeyboardEvent } from "react";
import {
  adjustDisplayToInternalDiscount,
  internalDiscountToAdjustDisplay,
  MAX_ADJUST_PCT,
  MIN_ADJUST_PCT,
  roundDiscountPct,
} from "../lib/discount";

type Props = {
  internalValue: number;
  onChangeInternal: (internalPct: number) => void;
  className?: string;
};

/** Ajuste % en POS: + = recargo, − = descuento. Flechas ±1. */
export default function AdjustPctInput({ internalValue, onChangeInternal, className = "" }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = internalDiscountToAdjustDisplay(internalValue);

  function commit(raw: string) {
    const trimmed = raw.trim().replace(/^\+/, "");
    if (trimmed === "" || trimmed === "-" || trimmed === "+") return;
    const n = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(n)) return;
    onChangeInternal(adjustDisplayToInternalDiscount(n));
  }

  function bump(delta: number) {
    const next = roundDiscountPct(
      Math.min(MAX_ADJUST_PCT, Math.max(MIN_ADJUST_PCT, display + delta)),
    );
    onChangeInternal(adjustDisplayToInternalDiscount(next));
    setDraft(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      bump(1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      bump(-1);
    } else if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  }

  const shown =
    draft !== null
      ? draft
      : display === 0
        ? "0"
        : display > 0
          ? `+${display}`
          : String(display);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={shown}
      onFocus={(e) => {
        setDraft(display === 0 ? "" : String(display));
        e.target.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) commit(draft);
        setDraft(null);
      }}
      onKeyDown={handleKeyDown}
      className={className}
    />
  );
}
