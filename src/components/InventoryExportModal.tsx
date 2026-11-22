import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import {
  Button,
  FormActions,
  Modal,
  SegmentToggle,
} from "./ui";
import type { Product } from "../types";
import { listProducts, type ProductFilter } from "../db/products";
import {
  DEFAULT_INVENTORY_COLUMNS,
  INVENTORY_COLUMNS,
  defaultInventoryColumns,
  inventoryListCsv,
  printInventoryList,
  resolveInventoryColumns,
  type InventoryColumnId,
  type InventoryExportFormat,
} from "../lib/prints/inventoryList";
import { pickExportCsvPath, writeCsvExport } from "../lib/tauri";
import { showUserError, showUserSuccess } from "../lib/notice";

type ScopeMode = "selected" | "visible" | "filtered";

interface Props {
  open: boolean;
  onClose: () => void;
  businessName: string;
  currency: string;
  /** Productos de la pantalla (página actual / lista filtrada en Stock). */
  products: Product[];
  /** IDs marcados en la tabla (Productos). */
  selectedIds?: number[];
  /** Filtro actual para «Todos con el filtro». */
  filter?: ProductFilter;
  canViewStock: boolean;
  canViewCost: boolean;
  /** Ofrece el CSV completo de reimportación (solo Productos). */
  onFullCsvExport?: () => void | Promise<void>;
}

export default function InventoryExportModal({
  open,
  onClose,
  businessName,
  currency,
  products,
  selectedIds = [],
  filter,
  canViewStock,
  canViewCost,
  onFullCsvExport,
}: Props) {
  const available = useMemo(
    () =>
      INVENTORY_COLUMNS.filter((c) => {
        if (c.needsStock && !canViewStock) return false;
        if (c.needsCost && !canViewCost) return false;
        return true;
      }),
    [canViewStock, canViewCost],
  );

  const [format, setFormat] = useState<InventoryExportFormat>("pdf");
  const [columns, setColumns] = useState<InventoryColumnId[]>(() =>
    defaultInventoryColumns({ canViewStock, canViewCost }),
  );
  const [scope, setScope] = useState<ScopeMode>("visible");
  const [busy, setBusy] = useState(false);

  const selectedCount = selectedIds.length;
  const hasFilterExport = Boolean(filter);
  const visibleCount = products.length;

  useEffect(() => {
    if (!open) return;
    setColumns(defaultInventoryColumns({ canViewStock, canViewCost }));
    setFormat("pdf");
    setScope(selectedCount > 0 ? "selected" : "visible");
  }, [open, canViewStock, canViewCost, selectedCount]);

  function toggleColumn(id: InventoryColumnId) {
    if (id === "name") return;
    setColumns((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function selectAllColumns() {
    setColumns(available.map((c) => c.id));
  }

  function selectEssentialColumns() {
    setColumns(
      defaultInventoryColumns({ canViewStock, canViewCost }).length
        ? defaultInventoryColumns({ canViewStock, canViewCost })
        : [...DEFAULT_INVENTORY_COLUMNS],
    );
  }

  async function resolveProducts(): Promise<{ list: Product[]; scopeLabel: string }> {
    if (scope === "selected") {
      const set = new Set(selectedIds);
      const list = products.filter((p) => set.has(p.id));
      // Si la selección cruza páginas, pedimos por ids del filtro + filtro en memoria.
      if (list.length < selectedCount && filter) {
        const all = await listProducts({ ...filter, page: undefined, pageSize: undefined, limit: 5000 });
        return {
          list: all.filter((p) => set.has(p.id)),
          scopeLabel: `${selectedCount.toLocaleString("es-AR")} seleccionados`,
        };
      }
      return {
        list,
        scopeLabel: `${list.length.toLocaleString("es-AR")} seleccionados`,
      };
    }
    if (scope === "filtered" && filter) {
      const list = await listProducts({
        ...filter,
        page: undefined,
        pageSize: undefined,
        limit: 5000,
      });
      return {
        list,
        scopeLabel: `${list.length.toLocaleString("es-AR")} con el filtro actual`,
      };
    }
    return {
      list: products,
      scopeLabel: `${visibleCount.toLocaleString("es-AR")} de la lista actual`,
    };
  }

  async function handleExport() {
    const resolvedCols = resolveInventoryColumns(columns, { canViewStock, canViewCost });
    if (resolvedCols.length === 0) {
      showUserError("Elegí al menos una columna.", "Exportar");
      return;
    }
    setBusy(true);
    try {
      const { list, scopeLabel } = await resolveProducts();
      if (list.length === 0) {
        showUserError("No hay productos para exportar con ese alcance.", "Exportar");
        return;
      }
      const colIds = resolvedCols.map((c) => c.id);
      const opts = {
        businessName,
        currency,
        products: list,
        columns: colIds,
        scopeLabel,
      };
      if (format === "pdf") {
        printInventoryList(opts);
        onClose();
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await pickExportCsvPath(`inventario_${stamp}.csv`);
      if (!path) return;
      await writeCsvExport(path, inventoryListCsv(opts));
      showUserSuccess(
        `Listo: ${list.length.toLocaleString("es-AR")} producto${list.length === 1 ? "" : "s"}.\n\n${path}\n\nTip: abrilo con Excel (separador ;).`,
        "Exportación lista",
      );
      onClose();
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  const scopeHint =
    scope === "selected"
      ? `${selectedCount.toLocaleString("es-AR")} marcados`
      : scope === "filtered"
        ? "Todos los que cumplen el filtro (hasta 5.000)"
        : `${visibleCount.toLocaleString("es-AR")} en pantalla`;

  return (
    <Modal
      open={open}
      title="Exportar listado"
      subtitle="Elegí formato, columnas y qué productos incluir. Ideal para controlar el inventario."
      onClose={onClose}
      wide
      footer={
        <FormActions>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          {onFullCsvExport ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => onFullCsvExport()}
              title="Todas las columnas del catálogo, para volver a importar"
            >
              CSV completo
            </Button>
          ) : null}
          <Button onClick={() => handleExport()} disabled={busy}>
            {format === "pdf" ? (
              <>
                <Printer size={16} /> Imprimir / PDF
              </>
            ) : (
              <>
                <FileSpreadsheet size={16} /> Exportar Excel
              </>
            )}
          </Button>
        </FormActions>
      }
    >
      <div className="min-w-0 space-y-5">
        <section className="min-w-0 space-y-2">
          <h3 className="font-display text-sm font-semibold text-ink">Formato</h3>
          <SegmentToggle
            value={format === "pdf"}
            onChange={(pdf) => setFormat(pdf ? "pdf" : "excel")}
            onLabel="PDF"
            offLabel="Excel"
            onActiveLabel="PDF"
            offActiveLabel="Excel"
          />
          <p className="text-xs text-ink-muted">
            {format === "pdf"
              ? "Se abre la vista de impresión: podés guardar como PDF."
              : "Archivo CSV con ; para abrirlo en Excel."}
          </p>
        </section>

        <section className="min-w-0 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-ink">Columnas</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                onClick={selectEssentialColumns}
              >
                Esenciales
              </button>
              <button
                type="button"
                className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                onClick={selectAllColumns}
              >
                Todas
              </button>
            </div>
          </div>
          <div
            className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2"
            role="group"
            aria-label="Columnas a exportar"
          >
            {available.map((c) => {
              const checked = columns.includes(c.id) || c.id === "name";
              const locked = c.id === "name";
              return (
                <label
                  key={c.id}
                  className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-sm ${
                    locked ? "bg-[var(--color-input-bg)]" : "hover:bg-brand-50/60 dark:hover:bg-brand-900/20"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="rounded border-brand-300"
                    checked={checked}
                    disabled={locked}
                    onChange={() => toggleColumn(c.id)}
                  />
                  <span className="min-w-0 truncate text-ink">{c.label}</span>
                </label>
              );
            })}
          </div>
          {!canViewStock ? (
            <p className="text-xs text-ink-muted">
              Las columnas de stock no aparecen: tu usuario no puede ver cantidades.
            </p>
          ) : null}
        </section>

        <section className="min-w-0 space-y-2">
          <h3 className="font-display text-sm font-semibold text-ink">Qué productos</h3>
          <div className="flex min-w-0 flex-col gap-2" role="radiogroup" aria-label="Alcance">
            <ScopeOption
              id="visible"
              label="Lista actual"
              hint={`${visibleCount.toLocaleString("es-AR")} en pantalla`}
              checked={scope === "visible"}
              onSelect={() => setScope("visible")}
            />
            {selectedCount > 0 ? (
              <ScopeOption
                id="selected"
                label="Solo marcados"
                hint={`${selectedCount.toLocaleString("es-AR")} seleccionados`}
                checked={scope === "selected"}
                onSelect={() => setScope("selected")}
              />
            ) : null}
            {hasFilterExport ? (
              <ScopeOption
                id="filtered"
                label="Usar filtro actual"
                hint="Todos los que cumplen búsqueda y filtros"
                checked={scope === "filtered"}
                onSelect={() => setScope("filtered")}
              />
            ) : null}
          </div>
          <p className="text-xs text-ink-muted">Se exportarán: {scopeHint}.</p>
        </section>
      </div>
    </Modal>
  );
}

function ScopeOption({
  id,
  label,
  hint,
  checked,
  onSelect,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      htmlFor={`inv-export-scope-${id}`}
      className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${
        checked
          ? "border-brand-400 bg-brand-50/70 dark:border-brand-500 dark:bg-brand-900/25"
          : "border-[var(--color-panel-border)] hover:bg-[var(--color-input-bg)]"
      }`}
    >
      <input
        id={`inv-export-scope-${id}`}
        type="radio"
        name="inv-export-scope"
        className="mt-1"
        checked={checked}
        onChange={onSelect}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-muted">{hint}</span>
      </span>
    </label>
  );
}
