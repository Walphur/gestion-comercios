import { useCallback, useEffect, useState } from "react";
import { Receipt, Eye } from "lucide-react";
import { PageHeader, Card, Modal } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { listSales, getSaleItems, getTodaySummary, type SalesSummary } from "../db/sales";
import type { Sale, SaleItem } from "../types";
import { formatMoney, formatQty } from "../lib/format";

export default function Sales() {
  const { currency } = useAppConfig();
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<SalesSummary>({ todayTotal: 0, todayCount: 0 });
  const [detail, setDetail] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);

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

  return (
    <div>
      <PageHeader title="Ventas" subtitle="Historial de ventas registradas." />
      <div className="p-8">
        <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
              <Receipt className="text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Ventas de hoy</p>
              <p className="text-2xl font-semibold text-slate-900">{summary.todayCount}</p>
            </div>
          </Card>
          <Card className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
              <Receipt className="text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total facturado hoy</p>
              <p className="text-2xl font-semibold text-slate-900">
                {formatMoney(summary.todayTotal, currency)}
              </p>
            </div>
          </Card>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">N°</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    Todavía no hay ventas registradas.
                  </td>
                </tr>
              )}
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">#{s.id}</td>
                  <td className="px-4 py-3 text-slate-500">{s.created_at}</td>
                  <td className="px-4 py-3 capitalize text-slate-500">{s.payment_method}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMoney(s.total, currency)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openDetail(s)}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={detail !== null}
        title={detail ? `Venta #${detail.sale.id}` : ""}
        onClose={() => setDetail(null)}
        wide
      >
        {detail && (
          <div>
            <div className="mb-4 flex flex-wrap gap-x-8 gap-y-1 text-sm text-slate-600">
              <span>Fecha: {detail.sale.created_at}</span>
              <span className="capitalize">Pago: {detail.sale.payment_method}</span>
              {detail.sale.paid != null && <span>Pagó: {formatMoney(detail.sale.paid, currency)}</span>}
              {detail.sale.change_due != null && (
                <span>Vuelto: {formatMoney(detail.sale.change_due, currency)}</span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 text-right">{formatQty(it.qty)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(it.unit_price, currency)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatMoney(it.line_total, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex justify-end gap-8 text-sm">
              <span className="text-slate-500">
                Subtotal: {formatMoney(detail.sale.subtotal, currency)}
              </span>
              <span className="text-slate-500">Desc.: {detail.sale.discount_pct}%</span>
              <span className="text-base font-bold text-slate-900">
                Total: {formatMoney(detail.sale.total, currency)}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
