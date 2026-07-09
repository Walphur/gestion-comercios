import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, UserCog, X } from "lucide-react";
import { Button } from "./ui";
import ResourceFormModal from "./ResourceFormModal";
import { getWorkshopResource, listWorkshopResources } from "../db/workshopResources";
import { useAppConfig } from "../context/AppConfig";
import { getResourceLabels } from "../config/resourceLabels";
import type { WorkshopResource } from "../types";

interface Props {
  value: number | "";
  onChange: (id: number | "") => void;
  disabled?: boolean;
  label?: string;
  optional?: boolean;
}

const MIN_SEARCH_LEN = 1;

export default function ResourcePicker({
  value,
  onChange,
  disabled,
  label,
  optional = true,
}: Props) {
  const { rubro } = useAppConfig();
  const labels = getResourceLabels(rubro);
  const [selected, setSelected] = useState<WorkshopResource | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorkshopResource[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const loadSelected = useCallback(async (id: number) => {
    const r = await getWorkshopResource(id);
    setSelected(r);
  }, []);

  useEffect(() => {
    if (value === "") {
      setSelected(null);
      return;
    }
    void loadSelected(value);
  }, [value, loadSelected]);

  useEffect(() => {
    if (!editing || !open) return;
    const q = query.trim();
    if (q.length < MIN_SEARCH_LEN) {
      setResults([]);
      setSearching(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await listWorkshopResources(q));
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query, editing, open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        if (!value) setEditing(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [value]);

  function pickResource(r: WorkshopResource) {
    onChange(r.id);
    setSelected(r);
    setQuery("");
    setOpen(false);
    setEditing(false);
  }

  function clearResource() {
    onChange("");
    setSelected(null);
    setQuery("");
    setOpen(false);
    setEditing(false);
  }

  function startSearch() {
    setEditing(true);
    setOpen(true);
    setQuery("");
  }

  function handleCreated(id: number) {
    void loadSelected(id).then(() => onChange(id));
    setEditing(false);
    setOpen(false);
    setQuery("");
  }

  const showDropdown = open && editing && !disabled;
  const canSearch = query.trim().length >= MIN_SEARCH_LEN;

  return (
    <div ref={wrapRef} className="space-y-2">
      <label className="block text-sm font-medium text-ink">{label ?? labels.pickerLabel}</label>

      {selected && !editing ? (
        <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2.5 dark:border-brand-800 dark:bg-brand-900/20">
          <UserCog size={18} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{selected.name}</p>
            {selected.notes && (
              <p className="truncate text-xs text-ink-muted">{selected.notes}</p>
            )}
          </div>
          {!disabled && (
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:text-brand-200 dark:hover:bg-brand-900/40"
                onClick={startSearch}
              >
                Cambiar
              </button>
              {optional && (
                <button
                  type="button"
                  className="rounded-lg p-1 text-ink-muted hover:bg-[var(--color-panel-border)]"
                  onClick={clearResource}
                  aria-label="Quitar asignación"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className={showDropdown ? "relative z-30" : "relative"}>
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setEditing(true);
            }}
            onFocus={() => {
              setEditing(true);
              setOpen(true);
            }}
            placeholder={labels.pickerPlaceholder}
            className="relative z-10 w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900"
          />

          {showDropdown && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel-bg)] shadow-xl">
              <div className="max-h-48 overflow-y-auto">
                {searching ? (
                  <p className="px-3 py-2.5 text-sm text-ink-muted">Buscando…</p>
                ) : !canSearch ? (
                  <p className="px-3 py-2.5 text-sm text-ink-muted">
                    Escribí el nombre del profesional o mecánico…
                  </p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-2.5 text-sm text-ink-muted">
                    No hay coincidencias. Podés crear uno nuevo abajo.
                  </p>
                ) : (
                  results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="block w-full border-b border-[var(--color-panel-border)] px-3 py-2.5 text-left text-sm last:border-0 hover:bg-brand-50/50 dark:hover:bg-brand-900/30"
                      onClick={() => pickResource(r)}
                    >
                      <span className="font-medium text-ink">{r.name}</span>
                      {r.notes && (
                        <span className="mt-0.5 block text-xs text-ink-muted">{r.notes}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-2">
                {optional && (
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-[var(--color-panel-border)] hover:text-ink"
                    onClick={clearResource}
                  >
                    {labels.pickerEmpty}
                  </button>
                )}
                <button
                  type="button"
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:text-brand-200 dark:hover:bg-brand-900/40"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={14} /> {labels.pickerNewButton}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!disabled && !showDropdown && !selected && (
        <Button
          type="button"
          variant="secondary"
          className="text-xs"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={14} /> {labels.pickerNewButton}
        </Button>
      )}

      <ResourceFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={handleCreated}
        initialName={query.trim() || undefined}
      />
    </div>
  );
}
