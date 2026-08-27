import { useCallback, useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { Button, Modal } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
}

function compute(a: number, b: number, op: string): number | null {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? null : a / b;
    default:
      return b;
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
  const [op, setOp] = useState<string | null>(null);
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
    if (d === "." || d === ",") {
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

  function applyOp(nextOp: string) {
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
    if (k === "⌫") {
      if (fresh) return;
      setDisplay(display.length <= 1 ? "0" : display.slice(0, -1));
      return;
    }
    if (k === "=") {
      equals();
      return;
    }
    if (["+", "−", "×", "÷"].includes(k)) {
      applyOp(k);
      return;
    }
    inputDigit(k);
  }

  const rows: Array<{ k: string; className?: string }> = [
    { k: "C" },
    { k: "÷" },
    { k: "×" },
    { k: "⌫" },
    { k: "7" },
    { k: "8" },
    { k: "9" },
    { k: "−" },
    { k: "4" },
    { k: "5" },
    { k: "6" },
    { k: "+" },
    { k: "1" },
    { k: "2" },
    { k: "3" },
    { k: "=", className: "row-span-2" },
    { k: "0", className: "col-span-2" },
    { k: "," },
  ];

  return (
    <Modal open={open} title="Calculadora" onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-4 py-3 text-right">
          <p className="text-3xl font-bold tabular-nums tracking-tight text-ink">{display}</p>
        </div>
        <div className="grid grid-cols-4 gap-2 auto-rows-fr">
          {rows.map(({ k, className = "" }) => {
            const isOp = ["+", "−", "×", "÷", "="].includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => onKey(k === "," ? "," : k)}
                className={`rounded-xl py-3 text-lg font-semibold transition ${className} ${
                  isOp
                    ? "bg-brand-500/15 text-brand-700 dark:text-brand-200"
                    : k === "C" || k === "⌫"
                      ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                      : "bg-[var(--color-panel-muted)] text-ink hover:bg-[var(--color-panel-border)]"
                }`}
              >
                {k}
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
