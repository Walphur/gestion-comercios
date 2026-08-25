import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Receipt, Eye, Ban, Pencil, ShoppingCart } from "lucide-react";
import { PageHeader, Card, Modal, Button, PageContent, DataTableShell, TablePagination, IconButton, Badge, Alert, EmptyState } from "../components/ui";
import { usePagination } from "../hooks/usePagination";
import { formatPaymentMethod } from "../lib/paymentLabels";
import { showUserError } from "../lib/notice";
import SaleEditPanel from "../components/SaleEditPanel";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import {
  listSales,
  getSaleItems,
  getTodaySummary,
  voidSale,
  updateSale,
  type SalesSummary,
  type SaleUpdateInput,
} from "../db/sales";
import { logAuditAction } from "../lib/tauri";
import type { Sale, SaleItem } from "../types";
import { formatMoney, formatQty } from "../lib/format";
import { confirmAction } from "../lib/confirm";
import { notifyIntelligenceDataChanged } from "../lib/intelligenceRefresh";

function paymentTone(method: string): string {
  const m = method.toLowerCase();
  if (m.includes("efectivo")) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (m.includes("débito") || m.includes("debito")) return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  if (m.includes("crédito") || m.includes("credito")) return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
  if (m.includes("transfer")) return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  if (m.includes("qr") || m.includes("mercado")) return "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300";
  if (m.includes("fiado")) return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  return "bg-slate-500/15 text-ink-muted";
}

export default function Sales() {
  const { currency } = useAppConfig();
  const { user, can } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<SalesSummary>({ todayTotal: 0, todayCount: 0 });
  const [detail, setDetail] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [saving, setSaving] = useState(false);
  const pagination = usePagination(sales);

  const reload = useCallback(async () => {
    const [s, sum] = await Promise.all([listSales(200), getTodaySummary()]);
    setSales(s);
    setSummary(sum);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const stats = useMemo(() => {
    const active = sales.filter((s) => !s.voided);
    const voided = sales.length - active.length;
    const avg = summary.todayCount > 0 ? summary.todayTotal / summary.todayCount : 0;
    return { active: active.length, voided, avg };
  }, [sales, summary]);

  async function openDetail(sale: Sale) {
    const items = await getSaleItems(sale.id);
    setEditing(false);
    setDetail({ sale, items });
  }

  async function openEdit(sale: Sale) {
    if (!canEdit || sale.voided) return;
    const items = await getSaleItems(sale.id);
    setEditing(true);
    setDetail({ sale, items });
  }

  function closeDetail() {
    setDetail(null);
    setEditing(false);
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
      notifyIntelligenceDataChanged("void");
      void logAuditAction(user.id, "sale_voided", "sale", detail.sale.id);
      closeDetail();
      reload();
    } catch (e) {
      showUserError(e);
    } finally {
      setVoiding(false);
    }
  }

  async function handleSaveEdit(input: SaleUpdateInput) {
    if (!detail || !user) return;
    setSaving(true);
    try {
      await updateSale(detail.sale.id, user.id, input);
      void logAuditAction(user.id, "sale_edited", "sale", detail.sale.id, `total=${input.total}`);
      closeDetail();
      reload();
    } catch (e) {
      showUserError(e);
    } finally {
      setSaving(false);
    }
  }

  const canEdit = can("void_sale");

  return (
    <div>
      <PageHeader title="Ventas" subtitle="Historial de ventas registradas." />
      <PageContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="border-brand-400/25 bg-gradient-to-br from-brand-500/15 to-brand-600/5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Hoy</p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums text-ink">
              <Receipt size={18} className="text-brand-600 dark:text-brand-300" />
              {summary.todayCount}
            </p>
            <p className="text-xs text-ink-muted">ventas</p>
          </Card>
          <Card className="border-emerald-400/25 bg-gradient-to-br from-emerald-500/15 to-emerald-600/5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Facturado hoy</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
              {formatMoney(summary.todayTotal, currency)}
            </p>
          </Card>
          <Card className="border-sky-400/25 bg-gradient-to-br from-sky-500/15 to-sky-600/5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Ticket prom. hoy</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
              {formatMoney(stats.avg, currency)}
            </p>
          </Card>
          <Card className="border-violet-400/25 bg-gradient-to-br from-violet-500/15 to-violet-600/5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">En listado</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{stats.active}</p>
            <p className="text-xs text-ink-muted">
              {stats.voided > 0 ? `${stats.voided} anulada${stats.voided === 1 ? "" : "s"}` : "sin anuladas"}
            </p>
          </Card>
        </div>

        <DataTableShell
          footer={
            <TablePagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              pageSize={pagination.pageSize}
              onPage={pagination.goTo}
            />
          }
        >
          <div className="flex items-center gap-2 border-b border-[var(--color-panel-border)] px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/15 text-brand-700 dark:text-brand-300">
              <ShoppingCart size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Registro de ventas</p>
              <p className="text-xs text-ink-muted">Últimas operaciones del comercio</p>
            </div>
          </div>
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>N°</th>
                <th>Fecha</th>
                <th>Vendedor</th>
                <th>Cliente</th>
                <th>Pago</th>
                <th className="text-right">Total</th>
                <th className="text-right">Estado</th>
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && (
                <tr>
                  <td colSpan={8} className="cell-empty">
                    <EmptyState
                      compact
                      icon={Receipt}
                      title="Todavía no hay ventas"
                      description="Las ventas que registres en el punto de venta aparecerán en este listado."
                      action={
                        <Link to="/pos">
                          <Button size="sm">Ir al punto de venta</Button>
                        </Link>
                      }
                    />
                  </td>
                </tr>
              )}
              {pagination.slice.map((s) => {
                const voided = Boolean(s.voided);
                return (
                  <tr key={s.id} className={voided ? "opacity-70" : undefined}>
                    <td className="font-medium">#{s.id}</td>
                    <td className="cell-muted whitespace-nowrap">{s.created_at}</td>
                    <td className="cell-muted">{s.seller_name ?? "—"}</td>
                    <td className="cell-muted min-w-0">
                      <span className="line-clamp-1">{s.customer_name ?? "—"}</span>
                    </td>
                    <td>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${paymentTone(s.payment_method)}`}
                      >
                        {formatPaymentMethod(s.payment_method)}
                      </span>
                    </td>
                    <td className="text-right font-semibold tabular-nums">
                      {formatMoney(s.total, currency)}
                    </td>
                    <td className="text-right">
                      {voided ? (
                        <Badge variant="danger">Anulada</Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </td>
                    <td className="col-actions">
                      <div className="flex justify-end gap-0.5">
                        <IconButton label="Ver detalle" onClick={() => openDetail(s)}>
                          <Eye size={16} />
                        </IconButton>
                        {canEdit && !voided && (
                          <IconButton label="Editar venta" onClick={() => void openEdit(s)}>
                            <Pencil size={16} />
                          </IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTableShell>
      </PageContent>

      <Modal
        open={detail !== null}
        title={detail ? (editing ? `Editar venta #${detail.sale.id}` : `Venta #${detail.sale.id}`) : ""}
        onClose={closeDetail}
        wide
      >
        {detail && editing ? (
          <SaleEditPanel
            sale={detail.sale}
            items={detail.items}
            saving={saving}
            onCancel={() => setEditing(false)}
            onSave={handleSaveEdit}
          />
        ) : detail ? (
          <div>
            {detail.sale.voided ? (
              <Alert variant="danger" className="mb-4">
                Esta venta fue anulada. El stock fue devuelto.
              </Alert>
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
                  <th className="px-3 py-2 text-right">Ajuste</th>
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
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {it.discount_pct !== 0 ? `${it.discount_pct.toFixed(2)}%` : "—"}
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
                <span>Ajuste: {detail.sale.discount_pct.toFixed(2)}%</span>
                <span className="font-bold text-ink">
                  Total: {formatMoney(detail.sale.total, currency)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {canEdit && !detail.sale.voided && (
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    <Pencil size={16} /> Editar venta
                  </Button>
                )}
                {canEdit && !detail.sale.voided && (
                  <Button variant="danger" onClick={handleVoid} disabled={voiding}>
                    <Ban size={16} /> {voiding ? "Anulando…" : "Anular venta"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
