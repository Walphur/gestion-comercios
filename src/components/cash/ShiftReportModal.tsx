import { useEffect, useState } from "react";
import { ClipboardList, Copy, MessageCircle, Printer } from "lucide-react";
import { Button, Modal, Spinner } from "../ui";
import MoneyInflowCard from "../reports/MoneyInflowCard";
import { useAppConfig } from "../../context/AppConfig";
import {
  buildShiftMessage,
  differenceLabel,
  loadShiftReport,
  shiftPrintReport,
  shiftTimeLabel,
  type ShiftReport,
} from "../../lib/shiftReport";
import { shareDailySummary } from "../../lib/dailySummary";
import { copyToClipboard } from "../../lib/openExternal";
import { printReport } from "../../lib/prints/reportDocument";
import { formatMoney } from "../../lib/format";
import { showUserError, showUserSuccess } from "../../lib/notice";

interface Props {
  sessionId: number | null;
  onClose: () => void;
  /** Lo que debería haber y la diferencia: solo quien ve reportes (arqueo ciego). */
  showArqueo: boolean;
}

/** Detalle de un turno: lo vendido, dónde entró la plata, el efectivo del cajón y el arqueo. */
export default function ShiftReportModal({ sessionId, onClose, showArqueo }: Props) {
  const { businessName, currency } = useAppConfig();
  const [data, setData] = useState<ShiftReport | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setData(null);
    if (sessionId == null) return;
    loadShiftReport(sessionId).then(setData).catch(showUserError);
  }, [sessionId]);

  const money = (n: number) => formatMoney(n, currency);
  const message = data ? buildShiftMessage(businessName, currency, data, showArqueo) : "";
  const declared = data?.session.declared_cash ?? null;
  const diff =
    data && declared != null ? (data.session.cash_difference ?? declared - data.cash.expected) : null;

  async function send() {
    if (!data) return;
    setSending(true);
    try {
      const { copied } = await shareDailySummary(message);
      if (copied) showUserSuccess("El cierre se copió. Elegí el chat en WhatsApp y pegalo.");
    } catch (e) {
      showUserError(e);
    } finally {
      setSending(false);
    }
  }

  async function copy() {
    try {
      await copyToClipboard(message);
      showUserSuccess("Cierre copiado. Pegalo donde quieras.");
    } catch (e) {
      showUserError(e);
    }
  }

  function print() {
    if (!data) return;
    printReport(businessName, shiftPrintReport(currency, data, showArqueo));
  }

  const kpis = data
    ? [
        { label: "Total vendido", value: money(data.total) },
        { label: "Ventas", value: String(data.count) },
        { label: "Ticket promedio", value: money(data.avgTicket) },
      ]
    : [];

  return (
    <Modal
      open={sessionId != null}
      onClose={onClose}
      wide
      title={data ? `Turno #${data.session.id}` : "Detalle del turno"}
      subtitle={
        data
          ? `${shiftTimeLabel(data.session)}${data.session.user_name ? ` · Abrió ${data.session.user_name}` : ""}${
              data.session.status === "open" ? " · Abierto" : ""
            }`
          : undefined
      }
      icon={<ClipboardList size={18} />}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="secondary" size="sm" disabled={!data} onClick={print}>
            <Printer size={14} /> Imprimir
          </Button>
          <Button variant="secondary" size="sm" disabled={!data} onClick={() => copy()}>
            <Copy size={14} /> Copiar
          </Button>
          <Button size="sm" disabled={!data || sending} loading={sending} onClick={() => send()}>
            <MessageCircle size={14} /> Enviar por WhatsApp
          </Button>
        </div>
      }
    >
      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="min-w-0 space-y-4">
          <div className="grid min-w-0 grid-cols-3 gap-2">
            {kpis.map((k) => (
              <div
                key={k.label}
                className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel-muted)] px-3 py-2"
              >
                <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{k.label}</p>
                <p className="truncate text-lg font-bold tabular-nums text-ink" title={k.value}>
                  {k.value}
                </p>
              </div>
            ))}
          </div>

          {data.voidedCount > 0 && (
            <p className="text-xs text-ink-muted">
              Anuladas en el turno: {data.voidedCount} ({money(data.voidedTotal)}). No suman en el total.
            </p>
          )}

          <MoneyInflowCard inflow={data.inflow} currency={currency} bare />

          <section className="min-w-0">
            <h4 className="mb-2 text-sm font-semibold text-ink">Efectivo del cajón</h4>
            <ul className="report-result">
              {data.cash.opening > 0 && (
                <li className="report-result__row">
                  <span>Apertura</span>
                  <span>{money(data.cash.opening)}</span>
                </li>
              )}
              <li className="report-result__row">
                <span>Ventas en efectivo</span>
                <span>{money(data.cash.cashSales)}</span>
              </li>
              {data.cash.otherIncome > 0 && (
                <li className="report-result__row">
                  <span>Ingresos</span>
                  <span>{money(data.cash.otherIncome)}</span>
                </li>
              )}
              {data.cash.expense > 0 && (
                <li className="report-result__row is-minus">
                  <span>Egresos</span>
                  <span>− {money(data.cash.expense)}</span>
                </li>
              )}
              {showArqueo && (
                <li className="report-result__row">
                  <span>Debería haber</span>
                  <span>{money(data.cash.expected)}</span>
                </li>
              )}
              {declared != null && (
                <li className="report-result__row">
                  <span>Contado al cerrar</span>
                  <span>{money(declared)}</span>
                </li>
              )}
              {showArqueo && diff != null && (
                <li className={`report-result__row is-total${diff < -0.009 ? " is-loss" : ""}`}>
                  <span>Diferencia</span>
                  <span>{differenceLabel(diff, currency)}</span>
                </li>
              )}
            </ul>
            {data.inflow.onAccount > 0 && (
              <p className="mt-2 text-xs text-ink-muted">
                Quedó a cuenta (fiado): <strong className="text-ink">{money(data.inflow.onAccount)}</strong> en{" "}
                {data.inflow.onAccountCount} {data.inflow.onAccountCount === 1 ? "venta" : "ventas"}. No entró plata.
              </p>
            )}
            {data.debtCash > 0 && (
              <p className="mt-2 text-xs text-ink-muted">
                En el horario del turno se cobraron <strong className="text-ink">{money(data.debtCash)}</strong> de
                fiado en efectivo. No están en «Debería haber»: si los guardaste en el cajón, explican la diferencia.
              </p>
            )}
          </section>

          {data.movements.length > 0 && (
            <section className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold text-ink">Ingresos y egresos</h4>
              <ul className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
                {data.movements.map((m) => (
                  <li key={m.id} className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] gap-2">
                    <span className="tabular-nums text-ink-muted">{m.created_at.slice(11, 16)}</span>
                    <span className="min-w-0 truncate text-ink-muted">{m.concept}</span>
                    <span
                      className={`font-medium tabular-nums ${
                        m.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {m.type === "income" ? "+" : "−"} {money(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.items.length > 0 && (
            <section className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold text-ink">Lo que se vendió</h4>
              <ul className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
                {data.items.map((i) => (
                  <li key={i.name} className="grid min-w-0 grid-cols-[minmax(0,1fr)_4rem_auto] gap-2">
                    <span className="min-w-0 truncate text-ink">{i.name}</span>
                    <span className="text-right tabular-nums text-ink-muted">
                      ×{Math.round(i.qty * 1000) / 1000}
                    </span>
                    <span className="text-right font-medium tabular-nums text-ink">{money(i.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
