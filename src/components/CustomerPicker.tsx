import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, User, X } from "lucide-react";
import { Button } from "./ui";
import CustomerFormModal, { formatCustomerOption } from "./CustomerFormModal";
import { getCustomer, listCustomers } from "../db/customers";
import { useAppConfig } from "../context/AppConfig";
import { getCustomerLabels } from "../config/customerLabels";
import type { Customer } from "../types";

interface Props {
  value: number | "";
  onChange: (id: number | "") => void;
  disabled?: boolean;
  label?: string;
  optional?: boolean;
  emptyOptionLabel?: string;
}

const MIN_SEARCH_LEN = 1;

export default function CustomerPicker({
  value,
  onChange,
  disabled,
  label = "Cliente",
  optional = true,
  emptyOptionLabel = "— Sin cliente —",
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
    if (q.length < MIN_SEARCH_LEN) {
      setResults([]);
      setSearching(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await listCustomers(q));
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

  const showDropdown = open && editing && !disabled;
  const canSearch = query.trim().length >= MIN_SEARCH_LEN;

  return (
    <div ref={wrapRef} className="space-y-2">
      <label className="block text-sm font-medium text-ink">{label}</label>

      {selected && !editing ? (
        <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2.5 dark:border-brand-800 dark:bg-brand-900/20">
          <User size={18} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{selected.name}</p>
            <p className="truncate text-xs text-ink-muted">{formatCustomerOption(selected)}</p>
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
            placeholder={labels.searchPlaceholder}
            className="relative z-10 w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900"
          />

          {showDropdown && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel-bg)] shadow-xl">
              <div className="max-h-48 overflow-y-auto">
                {searching ? (
                  <p className="px-3 py-2.5 text-sm text-ink-muted">Buscando…</p>
                ) : !canSearch ? (
                  <p className="px-3 py-2.5 text-sm text-ink-muted">
                    Escribí nombre, apellido, DNI o teléfono…
                  </p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-2.5 text-sm text-ink-muted">
                    No hay coincidencias. Podés crear el cliente abajo.
                  </p>
                ) : (
                  results.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="block w-full border-b border-[var(--color-panel-border)] px-3 py-2.5 text-left text-sm last:border-0 hover:bg-brand-50/50 dark:hover:bg-brand-900/30"
                      onClick={() => pickCustomer(c)}
                    >
                      <span className="font-medium text-ink">{c.name}</span>
                      {(c.document || c.phone) && (
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {[c.document, c.phone].filter(Boolean).join(" · ")}
                        </span>
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

      {!disabled && !showDropdown && !selected && (
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
