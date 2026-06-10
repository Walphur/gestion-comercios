import { useCallback, useEffect, useState } from "react";
import { Receipt, Eye, Ban } from "lucide-react";
import { PageHeader, Card, Modal, Button } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import {
  listSales,
  getSaleItems,
  getTodaySummary,
  voidSale,
  type SalesSummary,
} from "../db/sales";
import { logAuditAction } from "../lib/tauri";
import type { Sale, SaleItem } from "../types";
import { formatMoney, formatQty } from "../lib/format";
import { confirmAction } from "../lib/confirm";

export default function Sales() {
  const { currency } = useAppConfig();
  const { user, can } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<SalesSummary>({ todayTotal: 0, todayCount: 0 });
  const [detail, setDetail] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [voiding, setVoiding] = useState(false);

  const reload = useCallback(async () => {
    const [s, sum] = await Promise.all([listSales(200), getTodaySummary()]);
    setSales(s);
    setSummary(sum);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function openDetail(sale: Sale) {
    const items = await getSaleItems(sale.id);
    setDetail({ sale, items });
  }

  async function handleVoid() {
    if (!detail || !user) return;
    if (!can("void_sale")) return;
    if (
      !(await confirmAction({
        title: "Anular venta",
        message: `¿Anular la venta #${detail.sale.id}?`,
        detail: "Se devolverá el stock de los productos.",
        variant: "danger",
        confirmLabel: "Sí, anular",
      }))
    ) {
      return;
    }
    setVoiding(true);
    try {
      await voidSale(detail.sale.id, user.id);
      void logAuditAction(user.id, "sale_voided", "sale", detail.sale.id);
      setDetail(null);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setVoiding(false);
    }
  }

  return (
    <div>
      <PageHeader title="Ventas" subtitle="Historial de ventas registradas." />
      <div className="p-8">
        <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-100">
              <Receipt className="text-brand-600" />
            </div>
            <div>
              <p className="text-sm text-ink-muted">Ventas de hoy</p>
              <p className="font-display text-2xl font-semibold text-ink">{summary.todayCount}</p>
            </div>
          </Card>
          <Card className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-100">
              <Receipt className="text-brand-600" />
            </div>
            <div>
              <p className="text-sm text-ink-muted">Total facturado hoy</p>
              <p className="font-display text-2xl font-semibold text-ink">
                {formatMoney(summary.todayTotal, currency)}
              </p>
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">N°</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Estado</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-ink-muted">
                    Todavía no hay ventas registradas.
                  </td>
                </tr>
              )}
              {sales.map((s) => {
                const voided = Boolean(s.voided);
                return (
                  <tr
                    key={s.id}
                    className={`table-row ${voided ? "bg-red-50/40 opacity-75 dark:bg-red-950/30" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-ink">#{s.id}</td>
                    <td className="px-4 py-3 text-ink-muted">{s.created_at}</td>
                    <td className="px-4 py-3 text-ink-muted">{s.seller_name ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-muted">{s.customer_name ?? "—"}</td>
                    <td className="px-4 py-3 capitalize text-ink-muted">{s.payment_method}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatMoney(s.total, currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {voided ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Anulada
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-700">OK</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openDetail(s)}
                        className="rounded-lg p-2 text-ink-muted hover:bg-brand-50 hover:text-brand-700"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <Modal
        open={detail !== null}
        title={detail ? `Venta #${detail.sale.id}` : ""}
        onClose={() => setDetail(null)}
        wide
      >
        {detail && (
          <div>
            {detail.sale.voided ? (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                Esta venta fue anulada. El stock fue devuelto.
              </p>
            ) : null}
            <div className="mb-4 flex flex-wrap gap-x-8 gap-y-1 text-sm text-ink-muted">
              <span>Fecha: {detail.sale.created_at}</span>
              {detail.sale.seller_name && <span>Vendedor: {detail.sale.seller_name}</span>}
              <span className="capitalize">Pago: {detail.sale.payment_method}</span>
              {detail.sale.customer_name && (
                <span>Cliente: {detail.sale.customer_name}</span>
              )}
              {detail.sale.paid != null && (
                <span>Pagó: {formatMoney(detail.sale.paid, currency)}</span>
              )}
              {detail.sale.change_due != null && (
                <span>Vuelto: {formatMoney(detail.sale.change_due, currency)}</span>
              )}
              {detail.sale.payment_method === "mercadopago" &&
                (detail.sale.mp_payment_id || detail.sale.mp_order_id) && (
                  <span>
                    Nº operación MP:{" "}
                    <strong className="text-ink">
                      {detail.sale.mp_payment_id ?? detail.sale.mp_order_id}
                    </strong>
                  </span>
                )}
            </div>
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {detail.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(it.qty)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatMoney(it.unit_price, currency)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                      {formatMoney(it.line_total, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-6 text-sm text-ink-muted">
                <span>Subtotal: {formatMoney(detail.sale.subtotal, currency)}</span>
                <span>Desc.: {detail.sale.discount_pct}%</span>
                <span className="font-bold text-ink">
                  Total: {formatMoney(detail.sale.total, currency)}
                </span>
              </div>
              {can("void_sale") && !detail.sale.voided && (
                <Button variant="danger" onClick={handleVoid} disabled={voiding}>
                  <Ban size={16} /> {voiding ? "Anulando…" : "Anular venta"}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
