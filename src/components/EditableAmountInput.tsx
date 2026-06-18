import { useState, type KeyboardEvent } from "react";
import { parseAmountInput, roundMoney } from "../lib/discount";

type Props = {
  value: number;
  onCommit: (amount: number) => void;
  max?: number;
  className?: string;
  placeholder?: string;
};

/** Monto editable: no recalcula en cada tecla; aplica al salir del campo o Enter. */
export default function EditableAmountInput({
  value,
  onCommit,
  max,
  className = "",
  placeholder,
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
    : value > 0
      ? String(roundMoney(value))
      : "";

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder}
      onFocus={() => setDraft(value > 0 ? String(roundMoney(value)) : "")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
    />
  );
}
