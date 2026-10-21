import { useEffect, useState } from "react";
import { LayoutGrid, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button, Modal, tableCellInputClass } from "../ui";
import TablesTrialNotice from "./TablesTrialNotice";
import { saveDiningTables, type DiningTable, type DiningTableDraft } from "../../db/tables";
import { FREE_MAX_TABLES } from "../../config/pricing";

interface Props {
  open: boolean;
  tables: DiningTable[];
  unlimited: boolean;
  onClose: () => void;
  onSaved: () => void;
  onRenewQr?: () => void;
}

const ZONES = ["Salón", "Vereda", "Patio", "Barra", "Terraza"];

type Row = DiningTableDraft & { key: string };

let keySeq = 0;
const rowKey = () => `r${++keySeq}`;

export default function TablesConfigModal({ open, tables, unlimited, onClose, onSaved, onRenewQr }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setRows(
      tables.map((t) => ({ key: rowKey(), id: t.id, number: t.number, name: t.name ?? "", zone: t.zone ?? "" })),
    );
  }, [open, tables]);

  const max = unlimited ? 200 : FREE_MAX_TABLES;
  const canAdd = rows.length < max;

  function add(count: number) {
    setRows((prev) => {
      const next = [...prev];
      const zone = prev[prev.length - 1]?.zone ?? "";
      for (let i = 0; i < count && next.length < max; i++) {
        const n = Math.max(0, ...next.map((r) => r.number)) + 1;
        next.push({ key: rowKey(), number: n, name: "", zone });
      }
      return next;
    });
  }

  function patch(key: string, p: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await saveDiningTables(rows.map(({ key: _k, ...r }) => r));
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Mesas del salón"
      subtitle="El número es el que va en el QR. El nombre y la zona son opcionales."
      icon={<LayoutGrid size={18} />}
      size="form"
      onClose={onClose}
      footer={
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => add(1)} disabled={!canAdd}>
              <Plus size={14} /> Agregar mesa
            </Button>
            {unlimited ? (
              <Button variant="secondary" size="sm" onClick={() => add(5)} disabled={!canAdd}>
                <Plus size={14} /> Agregar 5
              </Button>
            ) : null}
            {onRenewQr && tables.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={onRenewQr}>
                <RefreshCw size={14} /> Renovar QR
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} loading={busy}>
              Guardar
            </Button>
          </div>
        </div>
      }
    >
      {!unlimited ? <TablesTrialNotice className="mb-3" /> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">Todavía no hay mesas. Tocá «Agregar mesa».</p>
      ) : (
        <div className="min-w-0 space-y-2">
          <div className="grid min-w-0 grid-cols-[minmax(0,4.5rem)_minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <span>N.º</span>
            <span>Nombre</span>
            <span>Zona</span>
            <span />
          </div>
          {rows.map((r) => (
            <div
              key={r.key}
              className="grid min-w-0 grid-cols-[minmax(0,4.5rem)_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2"
            >
              <input
                type="number"
                min={1}
                max={9999}
                value={r.number || ""}
                onChange={(e) => patch(r.key, { number: Math.round(Number(e.target.value) || 0) })}
                className={`${tableCellInputClass} w-full`}
                aria-label="Número de mesa"
              />
              <input
                value={r.name}
                maxLength={40}
                placeholder={`Mesa ${r.number || ""}`}
                onChange={(e) => patch(r.key, { name: e.target.value })}
                className={`${tableCellInputClass} w-full`}
                aria-label="Nombre"
              />
              <input
                value={r.zone}
                maxLength={30}
                list="table-zones"
                placeholder="Salón"
                onChange={(e) => patch(r.key, { zone: e.target.value })}
                className={`${tableCellInputClass} w-full`}
                aria-label="Zona"
              />
              <button
                type="button"
                className="wt-icon-btn wt-icon-btn--danger h-8 w-8"
                aria-label={`Quitar mesa ${r.number}`}
                onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <datalist id="table-zones">
            {ZONES.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </div>
      )}
      {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}
    </Modal>
  );
}
