import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, User, X } from "lucide-react";
import { Button } from "./ui";
import CustomerFormModal from "./CustomerFormModal";
import { getCustomer, listCustomers } from "../db/customers";
import { useAppConfig } from "../context/AppConfig";
import { getCustomerLabels } from "../config/customerLabels";
import { isArgentinaStoredPhone, phoneToLocalDisplay } from "../lib/phoneFormat";
import type { Customer } from "../types";

interface Props {
  value: number | "";
  onChange: (id: number | "") => void;
  disabled?: boolean;
  label?: string;
  optional?: boolean;
  emptyOptionLabel?: string;
  /** inline: empuja el formulario; overlay: desplegable flotante (presupuestos) */
  panelMode?: "inline" | "overlay";
  className?: string;
}

const RECENT_LIMIT = 12;

function customerMeta(c: Customer): string {
  const parts: string[] = [];
  if (c.document?.trim()) parts.push(c.document.trim());
  if (c.phone?.trim()) {
    parts.push(
      isArgentinaStoredPhone(c.phone) ? phoneToLocalDisplay(c.phone) : c.phone.trim(),
    );
  }
  return parts.join(" · ");
}

export default function CustomerPicker({
  value,
  onChange,
  disabled,
  label = "Cliente",
  optional = true,
  emptyOptionLabel = "— Sin cliente —",
  panelMode = "inline",
  className = "",
}: Props) {
  const { rubro } = useAppConfig();
  const labels = getCustomerLabels(rubro);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const loadSelected = useCallback(async (id: number) => {
    const c = await getCustomer(id);
    setSelected(c);
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
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        // Sin texto: últimos clientes (así se ven los creados al abrir el panel).
        const rows = await listCustomers(q);
        setResults(q ? rows : rows.slice(0, RECENT_LIMIT));
      } finally {
        setSearching(false);
      }
    }, q ? 220 : 0);
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

  function pickCustomer(c: Customer) {
    onChange(c.id);
    setSelected(c);
    setQuery("");
    setOpen(false);
    setEditing(false);
  }

  function clearCustomer() {
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

  const showPanel = open && editing && !disabled;
  const panelClass =
    panelMode === "overlay"
      ? "absolute left-0 right-0 top-full z-[80] mt-1 shadow-xl"
      : "";
  const meta = selected ? customerMeta(selected) : "";

  return (
    <div ref={wrapRef} className={`relative min-w-0 space-y-2 ${className}`.trim()}>
      <label className="block text-sm font-medium text-ink">{label}</label>

      {selected && !editing ? (
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
            <User size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{selected.name}</p>
            {meta ? <p className="truncate text-xs text-ink-muted">{meta}</p> : null}
          </div>
          {!disabled && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-200 dark:hover:bg-brand-900/40"
                onClick={startSearch}
              >
                Cambiar
              </button>
              {optional && (
                <button
                  type="button"
                  className="rounded-lg p-1 text-ink-muted hover:bg-[var(--color-panel-border)]"
                  onClick={clearCustomer}
                  aria-label="Quitar cliente"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className={panelMode === "overlay" ? "relative z-10" : "space-y-2"}>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
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
              placeholder={labels.searchPlaceholder}
              className="w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900"
            />
          </div>

          {showPanel && (
            <div
              className={`overflow-hidden rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] shadow-sm ${panelClass}`}
            >
              <div className="max-h-52 overflow-y-auto">
                {searching ? (
                  <p className="px-3 py-2.5 text-sm text-ink-muted">Buscando…</p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-2.5 text-sm text-ink-muted">
                    {query.trim()
                      ? "No hay coincidencias. Podés crear el cliente abajo."
                      : "Todavía no hay clientes. Creá uno abajo."}
                  </p>
                ) : (
                  <>
                    {!query.trim() && (
                      <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                        Recientes
                      </p>
                    )}
                    {results.map((c) => {
                      const rowMeta = customerMeta(c);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className="block w-full min-w-0 border-b border-[var(--color-panel-border)] px-3 py-2.5 text-left text-sm last:border-0 hover:bg-brand-50/50 dark:hover:bg-brand-900/30"
                          onClick={() => pickCustomer(c)}
                        >
                          <span className="block truncate font-medium text-ink">{c.name}</span>
                          {rowMeta ? (
                            <span className="mt-0.5 block truncate text-xs text-ink-muted">
                              {rowMeta}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-2">
                {optional && (
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-[var(--color-panel-border)] hover:text-ink"
                    onClick={clearCustomer}
                  >
                    {emptyOptionLabel}
                  </button>
                )}
                <button
                  type="button"
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:text-brand-200 dark:hover:bg-brand-900/40"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={14} /> Nuevo cliente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!disabled && !showPanel && !selected && (
        <Button
          type="button"
          variant="secondary"
          className="text-xs"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={14} /> Nuevo cliente
        </Button>
      )}

      <CustomerFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={handleCreated}
        initialName={query.trim() || undefined}
      />
    </div>
  );
}
