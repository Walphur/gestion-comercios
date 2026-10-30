import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, MessageCircle, Printer } from "lucide-react";
import { Button, Modal, Spinner } from "../ui";
import MoneyInflowCard from "./MoneyInflowCard";
import {
  buildDailySummaryMessage,
  inflowPrintTable,
  loadDailySummary,
  shareDailySummary,
  type DailySummary,
} from "../../lib/dailySummary";
import { copyToClipboard } from "../../lib/openExternal";
import { printReport } from "../../lib/prints/reportDocument";
import { formatMoney } from "../../lib/format";
import { showUserError, showUserSuccess } from "../../lib/notice";

interface Props {
  open: boolean;
  onClose: () => void;
  businessName: string;
  currency: string;
  showProfit: boolean;
  /** WhatsApp del comercio; sin número se elige el chat en WhatsApp. */
  bizWhatsApp: string | null;
}

/** Resumen de hoy en pantalla, para mirarlo y después mandarlo, copiarlo o imprimirlo. */
export default function DailySummaryModal({ open, onClose, businessName, currency, showProfit, bizWhatsApp }: Props) {
  const [data, setData] = useState<DailySummary | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setData(null);
      return;
    }
    loadDailySummary(showProfit).then(setData).catch(showUserError);
  }, [open, showProfit]);

  const money = (n: number) => formatMoney(n, currency);
  const message = data ? buildDailySummaryMessage(businessName, currency, data) : "";

  async function send() {
    if (!data) return;
    setSending(true);
    try {
      const { copied } = await shareDailySummary(message);
      if (copied) showUserSuccess("El resumen se copió. Elegí el chat en WhatsApp y pegalo.");
    } catch (e) {
      showUserError(e);
    } finally {
      setSending(false);
    }
  }

  async function copy() {
    try {
      await copyToClipboard(message);
      showUserSuccess("Resumen copiado. Pegalo donde quieras.");
    } catch (e) {
      showUserError(e);
    }
  }

  function print() {
    if (!data) return;
    printReport(businessName, {
      title: "Resumen del día",
      subtitle: data.dateLabel,
      summary: [
        { label: "Ventas", value: String(data.count) },
        { label: "Ticket promedio", value: money(data.avgTicket) },
        { label: "Gastos del día", value: money(data.expenses.total) },
        ...(data.profit ? [{ label: "Ganancia estimada (sin gastos)", value: money(data.profit.profit) }] : []),
        { label: "Total vendido", value: money(data.total), grand: true },
      ],
      tables: [inflowPrintTable(data.inflow, currency)],
    });
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
      open={open}
      onClose={onClose}
      wide
      title="Resumen de hoy"
      subtitle={data ? data.dateLabel : undefined}
      icon={<MessageCircle size={18} />}
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

          <MoneyInflowCard inflow={data.inflow} currency={currency} bare />

          <ul className="report-result">
            <li className="report-result__row is-minus">
              <span>Gastos del día{data.expenses.count > 0 ? ` (${data.expenses.count})` : ""}</span>
              <span>− {money(data.expenses.total)}</span>
            </li>
            {data.profit && (
              <li className="report-result__row">
                <span>Ganancia estimada de las ventas (sin gastos)</span>
                <span>{money(data.profit.profit)}</span>
              </li>
            )}
          </ul>

          {!bizWhatsApp && (
            <p className="text-xs text-ink-muted">
              No cargaste el WhatsApp del comercio: al enviar, elegís el chat en WhatsApp.{" "}
              <Link
                to="/admin?section=appearance"
                onClick={onClose}
                className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
              >
                Configurarlo
              </Link>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
