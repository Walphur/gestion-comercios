import { Link } from "react-router-dom";
import {
  Banknote,
  CircleHelp,
  HandCoins,
  Landmark,
  Smartphone,
  Vault,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Card, EmptyState } from "../ui";
import type { MoneyInflow } from "../../db/moneyInflow";
import type { TreasuryAccountKind } from "../../db/treasury";
import { formatMoney } from "../../lib/format";

const KIND_ICONS: Record<TreasuryAccountKind, LucideIcon> = {
  cajon: Wallet,
  guardado: Vault,
  banco: Landmark,
  mercadopago: Smartphone,
  otra: Banknote,
};

/** Cuánto entró en efectivo, en el banco, en Mercado Pago y en otras cuentas, con el detalle por medio. */
export default function MoneyInflowCard({
  inflow,
  currency,
  notes = [],
  bare = false,
}: {
  inflow: MoneyInflow;
  currency: string;
  notes?: string[];
  /** Sin la tarjeta de afuera (dentro de un modal). */
  bare?: boolean;
}) {
  const money = (n: number) => formatMoney(n, currency);
  const missingAccount = inflow.places.some((p) => p.kind == null);

  const body = (
    <>
      <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="report-section-title flex items-center gap-2">
            <HandCoins size={16} className="text-brand-600" /> ¿Dónde entró la plata?
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Ventas cobradas y cobros de fiado, según a qué cuenta va cada medio de pago en Tesorería.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Total que entró</p>
          <p className="text-xl font-bold tabular-nums text-ink">{money(inflow.totalIn)}</p>
        </div>
      </div>

      {inflow.places.length === 0 ? (
        <EmptyState
          compact
          icon={HandCoins}
          title="Todavía no entró plata"
          description="Cuando cobres ventas o fiado, vas a ver cuánto entró en efectivo, en el banco y en Mercado Pago."
        />
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {inflow.places.map((p) => {
            const Icon = p.kind ? KIND_ICONS[p.kind] : CircleHelp;
            return (
              <div
                key={p.key}
                className="min-w-0 rounded-xl border border-brand-500/15 bg-brand-500/5 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-ink">
                    <Icon size={15} className="shrink-0 text-brand-500" />
                    <span className="truncate" title={p.label}>
                      {p.label}
                    </span>
                  </span>
                  <span className="shrink-0 text-base font-bold tabular-nums text-ink">{money(p.total)}</span>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                  {p.lines.map((l) => (
                    <li key={l.key} className="flex min-w-0 justify-between gap-2">
                      <span className="min-w-0 truncate" title={l.label}>
                        {l.label} <span className="opacity-70">({l.count})</span>
                      </span>
                      <span className="shrink-0 tabular-nums">{money(l.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex min-w-0 flex-wrap gap-x-6 gap-y-1.5 border-t border-[var(--color-panel-border)] pt-3 text-sm text-ink-muted">
        <span>
          Ventas cobradas:{" "}
          <strong className="tabular-nums text-ink">{money(inflow.salesCollected)}</strong>
        </span>
        <span>
          Cobros de fiado:{" "}
          <strong className="tabular-nums text-ink">{money(inflow.debtPayments)}</strong>
          {inflow.debtPaymentsCount > 0 ? ` (${inflow.debtPaymentsCount})` : ""}
        </span>
        {inflow.onAccount > 0 && (
          <span className="text-amber-700 dark:text-amber-300">
            Quedó a cuenta (fiado, no entró):{" "}
            <strong className="tabular-nums">{money(inflow.onAccount)}</strong> ({inflow.onAccountCount})
          </span>
        )}
      </div>

      {(missingAccount || notes.length > 0) && (
        <div className="mt-2 space-y-1 text-xs text-ink-muted">
          {missingAccount && (
            <p>
              Hay medios sin cuenta asignada. Elegí a cuál va cada uno en{" "}
              <Link
                to="/tesoreria?tab=cuentas"
                className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
              >
                Tesorería
              </Link>
              .
            </p>
          )}
          {notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
    </>
  );

  if (bare) return <div className="min-w-0">{body}</div>;
  return (
    <Card variant="elevated" className="min-w-0 border-brand-500/15">
      {body}
    </Card>
  );
}
