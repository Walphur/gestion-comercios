import { useCallback, useEffect, useState } from "react";
import { Copy, Delete } from "lucide-react";
import { Button, Modal } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Op = "+" | "−" | "×" | "÷";

const OPS: Op[] = ["+", "−", "×", "÷"];

function compute(a: number, b: number, op: Op): number | null {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? null : a / b;
  }
}

function formatDisplay(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  const rounded = Math.round(n * 100) / 100;
  return String(rounded).replace(".", ",");
}

/** Calculadora simple integrada (mostrador). */
export default function CalculatorModal({ open, onClose }: Props) {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true);

  const reset = useCallback(() => {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setFresh(true);
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  function inputDigit(d: string) {
    if (d === ",") {
      if (display.includes(",")) return;
      setDisplay(display === "0" || fresh ? "0," : `${display},`);
      setFresh(false);
      return;
    }
    if (fresh) {
      setDisplay(d);
      setFresh(false);
    } else {
      setDisplay(display === "0" ? d : display + d);
    }
  }

  function parseDisplay(): number {
    return Number(display.replace(",", ".")) || 0;
  }

  function applyOp(nextOp: Op) {
    const cur = parseDisplay();
    if (acc == null) {
      setAcc(cur);
    } else if (op && !fresh) {
      const res = compute(acc, cur, op);
      if (res == null) {
        setDisplay("Error");
        setAcc(null);
        setOp(null);
        setFresh(true);
        return;
      }
      setAcc(res);
      setDisplay(formatDisplay(res));
    } else {
      setAcc(cur);
    }
    setOp(nextOp);
    setFresh(true);
  }

  function equals() {
    if (acc == null || !op) return;
    const cur = parseDisplay();
    const res = compute(acc, cur, op);
    if (res == null) {
      setDisplay("Error");
      setAcc(null);
      setOp(null);
      setFresh(true);
      return;
    }
    setDisplay(formatDisplay(res));
    setAcc(null);
    setOp(null);
    setFresh(true);
  }

  function backspace() {
    if (fresh) return;
    const next = display.length <= 1 ? "0" : display.slice(0, -1);
    setDisplay(next);
    if (next === "0") setFresh(true);
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(display.replace(",", "."));
    } catch {
      /* ignore */
    }
  }

  function onKey(k: string) {
    if (k === "C") {
      reset();
      return;
    }
    if (k === "backspace") {
      backspace();
      return;
    }
    if (k === "=") {
      equals();
      return;
    }
    if (OPS.includes(k as Op)) {
      applyOp(k as Op);
      return;
    }
    inputDigit(k);
  }

  const expression =
    acc != null && op
      ? fresh
        ? `${formatDisplay(acc)} ${op}`
        : `${formatDisplay(acc)} ${op} ${display}`
      : null;

  const keys: Array<{ id: string; label: React.ReactNode; className?: string; kind: "num" | "op" | "fn" }> = [
    { id: "C", label: "C", kind: "fn" },
    { id: "÷", label: "÷", kind: "op" },
    { id: "×", label: "×", kind: "op" },
    { id: "backspace", label: <Delete size={20} strokeWidth={2} />, kind: "fn" },
    { id: "7", label: "7", kind: "num" },
    { id: "8", label: "8", kind: "num" },
    { id: "9", label: "9", kind: "num" },
    { id: "−", label: "−", kind: "op" },
    { id: "4", label: "4", kind: "num" },
    { id: "5", label: "5", kind: "num" },
    { id: "6", label: "6", kind: "num" },
    { id: "+", label: "+", kind: "op" },
    { id: "1", label: "1", kind: "num" },
    { id: "2", label: "2", kind: "num" },
    { id: "3", label: "3", kind: "num" },
    { id: "=", label: "=", kind: "op", className: "row-span-2" },
    { id: "0", label: "0", kind: "num", className: "col-span-2" },
    { id: ",", label: ",", kind: "num" },
  ];

  return (
    <Modal open={open} title="Calculadora" onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-4 py-3 text-right min-h-[5.5rem] flex flex-col justify-end">
          {expression ? (
            <p className="text-sm font-medium tabular-nums text-ink-muted truncate mb-1">
              {expression}
            </p>
          ) : (
            <p className="text-sm text-ink-muted/50 mb-1">Listo para calcular</p>
          )}
          <p className="text-3xl font-bold tabular-nums tracking-tight text-ink">{display}</p>
          {op && fresh && (
            <p className="mt-1 text-xs font-semibold text-brand-600 dark:text-brand-300">
              Operación: {op}
            </p>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2 auto-rows-fr">
          {keys.map(({ id, label, className = "", kind }) => {
            const isActiveOp = OPS.includes(id as Op) && op === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onKey(id)}
                aria-label={id === "backspace" ? "Borrar" : String(label)}
                className={`rounded-xl py-3 text-lg font-semibold transition min-h-[3rem] flex items-center justify-center ${className} ${
                  isActiveOp
                    ? "bg-brand-500 text-white shadow-md ring-2 ring-brand-400/50"
                    : kind === "op"
                      ? "bg-brand-500/15 text-brand-700 dark:text-brand-200 hover:bg-brand-500/25"
                      : kind === "fn"
                        ? "bg-[var(--color-panel-muted)] text-ink-muted hover:bg-[var(--color-panel-border)]"
                        : "bg-[var(--color-panel-muted)] text-ink hover:bg-[var(--color-panel-border)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <Button type="button" variant="secondary" className="w-full" onClick={() => void copyResult()}>
          <Copy size={16} /> Copiar resultado
        </Button>
      </div>
    </Modal>
  );
}
