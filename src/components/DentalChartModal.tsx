import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";
import { showUserError } from "../lib/notice";
import type { Customer } from "../types";
import {
  ADULT_LOWER_LEFT,
  ADULT_LOWER_RIGHT,
  ADULT_UPPER_LEFT,
  ADULT_UPPER_RIGHT,
  listDentalMarks,
  nextDentalStatus,
  setDentalMark,
  type DentalStatus,
} from "../db/dentalChart";

const STATUS_LABEL: Record<DentalStatus | "sin_marcar", string> = {
  sin_marcar: "Sin marcar",
  arreglado: "Arreglado",
  a_tratar: "A tratar",
  extraido: "Extraído",
};

function toothClass(status: DentalStatus | null): string {
  if (status === "arreglado") {
    return "border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200";
  }
  if (status === "a_tratar") {
    return "border-amber-400 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200";
  }
  if (status === "extraido") {
    return "border-slate-300 bg-slate-200 text-slate-500 line-through dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400";
  }
  return "border-[var(--color-panel-border)] bg-[var(--color-input-bg)] text-ink";
}

function ToothButton({
  tooth,
  status,
  onCycle,
}: {
  tooth: number;
  status: DentalStatus | null;
  onCycle: (tooth: number) => void;
}) {
  const label = STATUS_LABEL[status ?? "sin_marcar"];
  return (
    <button
      type="button"
      className={`min-w-0 truncate rounded-md border px-0.5 py-1.5 text-center text-[11px] font-semibold leading-none ${toothClass(status)}`}
      aria-label={`Diente ${tooth}, ${label}. Un toque cambia el estado.`}
      title={`${tooth}: ${label}`}
      onClick={() => onCycle(tooth)}
    >
      {tooth}
    </button>
  );
}

function Arch({
  left,
  right,
  marks,
  onCycle,
}: {
  left: readonly number[];
  right: readonly number[];
  marks: Partial<Record<number, DentalStatus>>;
  onCycle: (tooth: number) => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <div className="grid min-w-0 grid-cols-8 gap-1">
        {left.map((tooth) => (
          <ToothButton key={tooth} tooth={tooth} status={marks[tooth] ?? null} onCycle={onCycle} />
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-8 gap-1">
        {right.map((tooth) => (
          <ToothButton key={tooth} tooth={tooth} status={marks[tooth] ?? null} onCycle={onCycle} />
        ))}
      </div>
    </div>
  );
}

export default function DentalChartModal({
  customer,
  open,
  onClose,
}: {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}) {
  const [marks, setMarks] = useState<Partial<Record<number, DentalStatus>>>({});
  const [ready, setReady] = useState(false);
  const marksRef = useRef(marks);
  const chains = useRef(new Map<number, Promise<void>>());
  const customerIdRef = useRef<number | null>(null);
  marksRef.current = marks;
  customerIdRef.current = customer?.id ?? null;

  useEffect(() => {
    if (!open || !customer) return;
    let cancelled = false;
    setReady(false);
    setMarks({});
    chains.current.clear();
    void listDentalMarks(customer.id)
      .then((rows) => {
        if (cancelled) return;
        setMarks(rows);
        setReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        showUserError(error);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, customer]);

  function cycle(tooth: number) {
    if (!customer) return;
    const next = nextDentalStatus(marksRef.current[tooth] ?? null);
    const updated = { ...marksRef.current };
    if (next) updated[tooth] = next;
    else delete updated[tooth];
    marksRef.current = updated;
    setMarks(updated);
    const previous = chains.current.get(tooth) ?? Promise.resolve();
    const customerId = customer.id;
    const job = previous
      .catch(() => undefined)
      .then(() => setDentalMark(customerId, tooth, next))
      .catch((error) => {
        showUserError(error);
        return listDentalMarks(customerId).then((rows) => {
          if (customerIdRef.current !== customerId) return;
          setMarks(rows);
        });
      });
    chains.current.set(tooth, job);
  }

  return (
    <Modal
      open={open && customer !== null}
      wide
      title={customer ? `Ficha de ${customer.name}` : "Ficha"}
      subtitle="Ficha interna. No es una historia clínica para compartir con obras sociales."
      onClose={onClose}
    >
      <div className="min-w-0 space-y-3">
        <div>
          <p className="text-sm font-semibold text-ink">Odontología</p>
          <p className="text-xs text-ink-muted">
            Odontograma de adultos, numeración FDI. Un toque cambia el estado del diente.
          </p>
        </div>
        {ready ? (
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Superior</p>
            <Arch
              left={ADULT_UPPER_RIGHT}
              right={ADULT_UPPER_LEFT}
              marks={marks}
              onCycle={cycle}
            />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Inferior</p>
            <Arch
              left={ADULT_LOWER_RIGHT}
              right={ADULT_LOWER_LEFT}
              marks={marks}
              onCycle={cycle}
            />
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Cargando ficha…</p>
        )}
        <ul className="flex min-w-0 flex-wrap gap-2 text-xs text-ink-muted">
          <li className="inline-flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm border ${toothClass(null)}`} />
            Sin marcar
          </li>
          <li className="inline-flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm border ${toothClass("arreglado")}`} />
            Arreglado
          </li>
          <li className="inline-flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm border ${toothClass("a_tratar")}`} />
            A tratar
          </li>
          <li className="inline-flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm border ${toothClass("extraido")}`} />
            Extraído
          </li>
        </ul>
      </div>
    </Modal>
  );
}
