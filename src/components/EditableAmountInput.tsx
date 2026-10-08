import { useState, type KeyboardEvent } from "react";
import { parseAmountInput, roundMoney } from "../lib/discount";

type Props = {
  value: number;
  onCommit: (amount: number) => void;
  max?: number;
  className?: string;
  placeholder?: string;
  /** Cómo se ve el monto cuando el campo no está en edición. */
  formatDisplay?: (value: number) => string;
};

/** Monto editable: no recalcula en cada tecla; aplica al salir del campo o Enter. */
export default function EditableAmountInput({
  value,
  onCommit,
  max,
  className = "",
  placeholder,
  formatDisplay,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  function commit(raw: string) {
    const parsed = parseAmountInput(raw);
    if (parsed == null) return;
    const clamped = max != null ? Math.min(max, parsed) : parsed;
    onCommit(clamped);
  }

  function handleBlur() {
    if (draft !== null) commit(draft);
    setDraft(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  }

  const display = editing
    ? draft
    : formatDisplay
      ? formatDisplay(value)
      : value > 0
        ? String(roundMoney(value))
        : "";

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder}
      onFocus={(e) => {
        setDraft(value > 0 ? String(roundMoney(value)) : "");
        e.target.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
    />
  );
}
