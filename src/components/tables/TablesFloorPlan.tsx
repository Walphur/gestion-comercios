import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BellRing, ChefHat, GripHorizontal, MapPin } from "lucide-react";
import { Button } from "../ui";
import {
  tableLabel,
  updateTablePositions,
  type DiningTable,
  type OpenTableOrder,
  type TableCall,
} from "../../db/tables";
import { formatMoney } from "../../lib/format";
import { showUserError } from "../../lib/notice";

type CardState = "free" | "busy" | "bill" | "locked";

const MARKER_TONE: Record<CardState, string> = {
  free: "border-[var(--color-success)]/50 bg-[var(--color-success-bg)] text-[var(--color-success)]",
  busy: "border-brand-500/55 bg-brand-500/15 text-brand-950 dark:text-brand-100",
  bill: "border-amber-500/60 bg-amber-500/20 text-amber-950 dark:text-amber-100",
  locked: "border-[var(--color-panel-border)] bg-[var(--color-input-bg)] text-ink-muted opacity-70",
};

const MARKER_W = 0.14;
const MARKER_H = 0.12;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function hasPos(t: DiningTable): boolean {
  return t.pos_x != null && t.pos_y != null && Number.isFinite(t.pos_x) && Number.isFinite(t.pos_y);
}

/** Distribuye las mesas dadas en una grilla suave dentro del plano. */
export function layoutTablesGrid(tables: DiningTable[]): { id: number; pos_x: number; pos_y: number }[] {
  if (tables.length === 0) return [];
  const cols = Math.max(2, Math.ceil(Math.sqrt(tables.length)));
  const rows = Math.ceil(tables.length / cols);
  return tables.map((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = cols === 1 ? 0.5 : 0.1 + (col / (cols - 1 || 1)) * 0.8;
    const y = rows === 1 ? 0.5 : 0.12 + (row / (rows - 1 || 1)) * 0.72;
    return { id: t.id, pos_x: clamp01(x), pos_y: clamp01(y) };
  });
}

export interface TablesFloorPlanProps {
  tables: DiningTable[];
  currency: string;
  editing: boolean;
  canEdit: boolean;
  stateOf: (t: DiningTable) => CardState;
  orderByTable: Map<number, OpenTableOrder>;
  callsByTable: Map<number, TableCall[]>;
  readyByNumber: Map<number, number>;
  onSelect: (t: DiningTable) => void;
  onPositionsSaved: () => void;
  onEditingChange: (v: boolean) => void;
}

export default function TablesFloorPlan({
  tables,
  currency,
  editing,
  canEdit,
  stateOf,
  orderByTable,
  callsByTable,
  readyByNumber,
  onSelect,
  onPositionsSaved,
  onEditingChange,
}: TablesFloorPlanProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragPosRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [localPos, setLocalPos] = useState<Record<number, { x: number; y: number }>>({});
  const [saving, setSaving] = useState(false);

  const placed = tables.filter((t) => {
    const loc = localPos[t.id];
    if (loc) return true;
    return hasPos(t);
  });
  const unplaced = tables.filter((t) => !localPos[t.id] && !hasPos(t));

  const posOf = useCallback(
    (t: DiningTable): { x: number; y: number } | null => {
      const loc = localPos[t.id];
      if (loc) return loc;
      if (hasPos(t)) return { x: t.pos_x!, y: t.pos_y! };
      return null;
    },
    [localPos],
  );

  function pointFromEvent(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = canvasRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return {
      x: clamp01((clientX - r.left) / r.width - MARKER_W / 2),
      y: clamp01((clientY - r.top) / r.height - MARKER_H / 2),
    };
  }

  async function persist(updates: { id: number; pos_x: number; pos_y: number }[]) {
    if (updates.length === 0) return;
    setSaving(true);
    try {
      await updateTablePositions(updates);
      setLocalPos((prev) => {
        const next = { ...prev };
        for (const u of updates) next[u.id] = { x: u.pos_x, y: u.pos_y };
        return next;
      });
      onPositionsSaved();
    } catch (e) {
      showUserError(e, "No se pudo guardar el plano");
    } finally {
      setSaving(false);
    }
  }

  async function distribute() {
    const targets = unplaced.length > 0 ? unplaced : tables;
    await persist(layoutTablesGrid(targets));
  }

  async function clearPlan() {
    if (tables.length === 0) return;
    setSaving(true);
    try {
      await updateTablePositions(tables.map((t) => ({ id: t.id, pos_x: null, pos_y: null })));
      setLocalPos({});
      onPositionsSaved();
    } catch (e) {
      showUserError(e, "No se pudo limpiar el plano");
    } finally {
      setSaving(false);
    }
  }

  function onPointerDown(e: ReactPointerEvent, t: DiningTable) {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(t.id);
    const p = pointFromEvent(e.clientX, e.clientY);
    if (p) {
      dragPosRef.current = { id: t.id, x: p.x, y: p.y };
      setLocalPos((prev) => ({ ...prev, [t.id]: p }));
    } else {
      dragPosRef.current = { id: t.id, x: t.pos_x ?? 0.5, y: t.pos_y ?? 0.5 };
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (dragId == null || !editing) return;
    const p = pointFromEvent(e.clientX, e.clientY);
    if (!p) return;
    dragPosRef.current = { id: dragId, x: p.x, y: p.y };
    setLocalPos((prev) => ({ ...prev, [dragId]: p }));
  }

  async function onPointerUp(e: ReactPointerEvent) {
    if (dragId == null) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const dropped = dragPosRef.current;
    const id = dragId;
    setDragId(null);
    dragPosRef.current = null;
    const p =
      dropped && dropped.id === id
        ? { x: dropped.x, y: dropped.y }
        : pointFromEvent(e.clientX, e.clientY);
    if (!p) return;
    await persist([{ id, pos_x: p.x, pos_y: p.y }]);
  }

  function placeUnplaced(t: DiningTable) {
    if (!editing) {
      onSelect(t);
      return;
    }
    const p = {
      x: clamp01(0.1 + Math.random() * 0.7),
      y: clamp01(0.15 + Math.random() * 0.55),
    };
    void persist([{ id: t.id, pos_x: p.x, pos_y: p.y }]);
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-ink-muted">
          {editing
            ? "Arrastrá cada mesa a cómo está el local. Al soltar se guarda."
            : "Tocá una mesa para abrirla. Si no saben el número, mirá la ubicación."}
        </p>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => void distribute()} loading={saving}>
                  <MapPin size={14} /> Distribuir
                </Button>
                {placed.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => void clearPlan()} disabled={saving}>
                    Limpiar plano
                  </Button>
                ) : null}
                <Button size="sm" onClick={() => onEditingChange(false)} disabled={saving}>
                  Listo
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => onEditingChange(true)}>
                <GripHorizontal size={14} /> Ubicar mesas
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <div
        ref={canvasRef}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => void onPointerUp(e)}
        onPointerCancel={(e) => void onPointerUp(e)}
        onClick={(e) => {
          if (!editing || unplaced.length === 0 || dragId != null) return;
          if ((e.target as HTMLElement).closest("[data-table]")) return;
          const p = pointFromEvent(e.clientX, e.clientY);
          if (!p) return;
          const next = unplaced[0];
          void persist([{ id: next.id, pos_x: p.x, pos_y: p.y }]);
        }}
        className={`relative min-h-[min(62vh,28rem)] w-full min-w-0 overflow-hidden rounded-2xl border-2 border-dashed border-[var(--color-panel-border)] bg-[linear-gradient(135deg,var(--color-input-bg)_0%,transparent_48%),linear-gradient(var(--color-panel),var(--color-panel))] ${
          editing ? "ring-2 ring-brand-500/30" : ""
        }`}
        style={{ touchAction: editing ? "none" : "auto" }}
      >
        {/* Guías suaves del salón */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-3 rounded-xl border border-[var(--color-panel-border)]/60"
        />
        {placed.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <MapPin size={28} className="text-ink-muted opacity-50" />
            <p className="max-w-sm text-sm text-ink-muted">
              {canEdit
                ? "Todavía no hay un plano. Tocá «Ubicar mesas» y «Distribuir», o arrastrá desde «Sin ubicar»."
                : "El salón todavía no tiene plano. Pedile a quien administra que ubique las mesas."}
            </p>
          </div>
        ) : null}
        {placed.map((t) => {
          const p = posOf(t);
          if (!p) return null;
          const s = stateOf(t);
          const o = orderByTable.get(t.id);
          const calling = (callsByTable.get(t.id) ?? []).some((c) => c.kind === "waiter");
          const ready = (readyByNumber.get(t.number) ?? 0) > 0;
          return (
            <button
              key={t.id}
              type="button"
              data-table={t.number}
              onClick={() => {
                if (editing) return;
                onSelect(t);
              }}
              onPointerDown={(e) => onPointerDown(e, t)}
              className={`absolute flex min-w-0 flex-col items-stretch justify-center rounded-xl border-2 px-2 py-1.5 text-left shadow-sm transition-shadow ${MARKER_TONE[s]} ${
                editing ? "cursor-grab active:cursor-grabbing" : "hover:shadow-md"
              } ${dragId === t.id ? "z-20 scale-[1.03] shadow-lg" : "z-10"}`}
              style={{
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                width: `max(4.5rem, ${MARKER_W * 100}%)`,
                minHeight: `max(3.25rem, ${MARKER_H * 100}%)`,
                maxWidth: "9rem",
              }}
            >
              <span className="truncate text-sm font-bold leading-tight">{tableLabel(t)}</span>
              <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">
                {ready ? (
                  <span className="inline-flex items-center gap-0.5">
                    <ChefHat size={10} /> Listo
                  </span>
                ) : null}
                {calling ? (
                  <span className="inline-flex items-center gap-0.5 text-semantic-danger">
                    <BellRing size={10} /> Mozo
                  </span>
                ) : null}
                {o ? (
                  <span className="truncate tabular-nums normal-case">{formatMoney(o.total, currency)}</span>
                ) : (
                  <span className="normal-case opacity-80">{s === "locked" ? "Plan" : "Libre"}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {unplaced.length > 0 ? (
        <div className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Sin ubicar ({unplaced.length})
          </p>
          <div className="flex min-w-0 flex-wrap gap-2">
            {unplaced.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => placeUnplaced(t)}
                className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold ${MARKER_TONE[stateOf(t)]}`}
              >
                {tableLabel(t)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
