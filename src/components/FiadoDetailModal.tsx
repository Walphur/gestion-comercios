import { useEffect, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { Button, Input, Modal, Select } from "./ui";
import { useAppConfig } from "../context/AppConfig";
import { listCustomers } from "../db/customers";
import { loadPrintBranding } from "../config/printBranding";
import { arcaObtenerConfig } from "../lib/arca";
import {
  fiadoReportCsv,
  loadFiadoReport,
  previousMonthPeriod,
  thisMonthPeriod,
  type FiadoPeriod,
  type FiadoReport,
} from "../lib/fiadoReport";
import { printFiadoDetail } from "../lib/prints/fiadoDetail";
import { formatDateShort, formatMoney, todayYmd } from "../lib/format";
import { pickExportCsvPath, writeCsvExport } from "../lib/tauri";
import { showUserError, showUserSuccess } from "../lib/notice";
import type { Customer } from "../types";

type PeriodMode = "prev" | "this" | "custom";

interface Props {
  open: boolean;
  onClose: () => void;
  organizations: string[];
}

function periodFor(mode: PeriodMode, custom: FiadoPeriod): FiadoPeriod {
  if (mode === "this") return thisMonthPeriod();
  if (mode === "prev") return previousMonthPeriod();
  return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
}

/** Detalle de fiado por período para imprimir o pasar a Excel (organismo, empleador). */
export default function FiadoDetailModal({ open, onClose, organizations }: Props) {
  const { currency, businessName } = useAppConfig();
  const [mode, setMode] = useState<PeriodMode>("prev");
  const [custom, setCustom] = useState<FiadoPeriod>(() => thisMonthPeriod());
  const [organization, setOrganization] = useState("");
  const [customerId, setCustomerId] = useState<number | "">("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [report, setReport] = useState<FiadoReport | null>(null);
  const [loading, setLoading] = useState(false);

  const period = periodFor(mode, custom);
  const { from, to } = period;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listCustomers("", organization)
      .then((list) => {
        if (cancelled) return;
        setCustomers([...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" })));
        setCustomerId((cur) => (cur !== "" && !list.some((c) => c.id === cur) ? "" : cur));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, organization]);

  useEffect(() => {
    if (!open) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadFiadoReport({ from, to }, { organization, customerId: customerId === "" ? null : customerId })
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e) => {
        if (!cancelled) showUserError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, from, to, organization, customerId]);

  async function handlePrint() {
    if (!report) return;
    try {
      const [branding, arca] = await Promise.all([
        loadPrintBranding(businessName),
        arcaObtenerConfig().catch(() => null),
      ]);
      printFiadoDetail({ branding, businessCuit: arca?.cuit?.trim() || null, currency, report });
    } catch (e) {
      showUserError(e);
    }
  }

  async function handleExport() {
    if (!report) return;
    try {
      const path = await pickExportCsvPath(`detalle_fiado_${report.period.from}_${report.period.to}.csv`);
      if (!path) return;
      await writeCsvExport(path, fiadoReportCsv(report, businessName));
      const n = report.customers.length;
      showUserSuccess(
        `Listo: ${n.toLocaleString("es-AR")} ${n === 1 ? "cliente" : "clientes"} con su detalle.\n\n${path}\n\nTip: abrilo con Excel (separador ;).`,
        "Exportación lista",
      );
    } catch (e) {
      showUserError(e);
    }
  }

  const t = report?.totals;
  const empty = !loading && report != null && report.customers.length === 0;

  return (
    <Modal
      open={open}
      title="Detalle de fiado"
      subtitle="Lo que cada cliente compró y pagó en el período, para imprimir o pasar a Excel."
      onClose={onClose}
      wide
      footer={
        <div className="flex min-w-0 flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="secondary" onClick={() => handleExport()} disabled={!report || loading || empty}>
            <FileSpreadsheet size={16} /> Exportar Excel
          </Button>
          <Button onClick={() => handlePrint()} disabled={!report || loading || empty}>
            <Printer size={16} /> Imprimir / PDF
          </Button>
        </div>
      }
    >
      <div className="min-w-0 space-y-4">
        <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Período">
          {(
            [
              ["prev", "Mes anterior"],
              ["this", "Este mes"],
              ["custom", "Elegir fechas"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={mode === id ? "primary" : "secondary"}
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
            >
              {label}
            </Button>
          ))}
          <span className="self-center text-sm text-ink-muted" data-testid="fiado-period">
            {formatDateShort(period.from)} al {formatDateShort(period.to)}
          </span>
        </div>

        {mode === "custom" && (
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Input
              label="Desde"
              type="date"
              value={custom.from}
              max={todayYmd()}
              onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })}
            />
            <Input
              label="Hasta"
              type="date"
              value={custom.to}
              onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })}
            />
          </div>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {organizations.length > 0 && (
            <Select label="Organismo" value={organization} onChange={(e) => setOrganization(e.target.value)}>
              <option value="">Todos</option>
              {organizations.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          )}
          <Select
            label="Cliente"
            value={customerId === "" ? "" : String(customerId)}
            onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Todos los clientes</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.document?.trim() ? ` · ${c.document.trim()}` : ""}
              </option>
            ))}
          </Select>
        </div>

        {t && (
          <div
            className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))]"
            data-testid="fiado-totals"
          >
            {[
              ["Saldo al inicio", t.opening + t.loaded],
              ["Comprado", t.bought],
              ["Pagado", t.paid],
              ["Saldo al final", t.closing],
            ].map(([label, value]) => (
              <div
                key={label as string}
                className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3"
              >
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
                <p className="truncate text-lg font-bold tabular-nums text-ink">{formatMoney(value as number, currency)}</p>
              </div>
            ))}
          </div>
        )}

        {loading && !report ? <p className="text-sm text-ink-muted">Armando el detalle…</p> : null}
        {empty ? (
          <p className="rounded-lg border border-[var(--color-panel-border)] px-3 py-4 text-center text-sm text-ink-muted">
            No hay clientes con fiado en ese período.
          </p>
        ) : null}

        {report && report.customers.length > 0 && (
          <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--color-panel-border)]">
            <div className="hidden gap-2 border-b border-[var(--color-panel-border)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted sm:grid sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
              <span>Cliente</span>
              <span className="text-right">Al inicio</span>
              <span className="text-right">Comprado</span>
              <span className="text-right">Pagado</span>
              <span className="text-right">Al final</span>
            </div>
            <ul className="divide-y divide-[var(--color-panel-border)]">
              {report.customers.map((c) => {
                const who = [
                  c.document ? `DNI ${c.document}` : "Sin DNI",
                  c.address || "Sin domicilio",
                  c.organization,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li
                    key={c.id}
                    data-testid="fiado-customer"
                    className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-1 px-3 py-2.5 text-sm sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] sm:items-center"
                  >
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <p className="truncate font-medium text-ink">{c.name}</p>
                      <p className="truncate text-xs text-ink-muted" title={who}>
                        {who}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {c.moves.length} {c.moves.length === 1 ? "movimiento" : "movimientos"}
                      </p>
                    </div>
                    <p className="min-w-0 truncate text-right tabular-nums text-ink-muted">
                      <span className="sm:hidden">Inicio </span>
                      {formatMoney(c.totals.opening + c.totals.loaded, currency)}
                    </p>
                    <p className="min-w-0 truncate text-right tabular-nums text-amber-700 dark:text-amber-400">
                      <span className="sm:hidden">Compró </span>
                      {formatMoney(c.totals.bought, currency)}
                    </p>
                    <p className="min-w-0 truncate text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      <span className="sm:hidden">Pagó </span>
                      {formatMoney(c.totals.paid, currency)}
                    </p>
                    <p className="min-w-0 truncate text-right font-semibold tabular-nums text-ink" data-testid="fiado-closing">
                      <span className="sm:hidden">Final </span>
                      {formatMoney(c.totals.closing, currency)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <p className="text-xs text-ink-muted">
          Sale de la cuenta corriente de cada cliente (lo mismo que su historial). Incluye a los que compraron o pagaron
          en el período y a los que ya debían al empezar. Los cobros anulados figuran tachados y no restan.
        </p>
      </div>
    </Modal>
  );
}
