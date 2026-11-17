import { useEffect, useState } from "react";
import { ChefHat, Plus, Trash2 } from "lucide-react";
import { Button, Input, Modal, Switch } from "../ui";
import {
  listKitchenStations,
  reorderKitchenStations,
  saveKitchenStation,
  type KitchenStation,
} from "../../db/kitchen";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

type Row = { key: string; id?: number; name: string; active: boolean };

let keySeq = 0;
const rowKey = () => `ks${++keySeq}`;

export default function KitchenStationsModal({ open, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    void listKitchenStations({ includeInactive: true })
      .then((list) =>
        setRows(
          list.map((s: KitchenStation) => ({
            key: rowKey(),
            id: s.id,
            name: s.name,
            active: s.active === 1,
          })),
        ),
      )
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [open]);

  function add() {
    setRows((prev) => [...prev, { key: rowKey(), name: "", active: true }]);
  }

  function patch(key: string, p: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const cleaned = rows.map((r) => ({ ...r, name: r.name.trim() })).filter((r) => r.name || r.id);
      if (cleaned.length === 0) throw new Error("Dejá al menos una estación.");
      const ids: number[] = [];
      for (const r of cleaned) {
        if (!r.name) throw new Error("Todas las estaciones necesitan nombre.");
        const id = await saveKitchenStation({
          id: r.id,
          name: r.name,
          active: r.active,
        });
        ids.push(id);
      }
      await reorderKitchenStations(ids);
      onSaved?.();
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
      title="Estaciones de cocina"
      subtitle="Cada producto puede ir a Cocina, Barra, Horno u otra estación. Al enviar la comanda se arman tickets por estación."
      icon={<ChefHat size={18} />}
      size="form"
      onClose={onClose}
      footer={
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" size="sm" onClick={add}>
            <Plus size={14} /> Agregar estación
          </Button>
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
      <div className="min-w-0 space-y-3">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <ul className="min-w-0 space-y-2">
          {rows.map((r) => (
            <li
              key={r.key}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-2"
            >
              <Input
                label={r.id ? undefined : "Nombre"}
                value={r.name}
                onChange={(e) => patch(r.key, { name: e.target.value })}
                placeholder="Ej. Barra"
              />
              <div className="flex flex-col items-center gap-0.5 pb-1">
                <span className="text-[10px] text-ink-muted">{r.active ? "Activa" : "Off"}</span>
                <Switch checked={r.active} onChange={(v) => patch(r.key, { active: v })} />
              </div>
              {!r.id ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-0.5"
                  aria-label="Quitar"
                  onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                >
                  <Trash2 size={14} />
                </Button>
              ) : (
                <span className="mb-0.5 w-8" />
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-muted">
          Las estaciones apagadas no reciben platos nuevos. Los tickets viejos siguen visibles.
        </p>
      </div>
    </Modal>
  );
}
