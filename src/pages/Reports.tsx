import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  Clock,
  CreditCard,
  Download,
  Layers,
  MessageCircle,
  Package,
  PiggyBank,
  Receipt,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader, Card, Button, PageContent, EmptyState } from "../components/ui";
import SetupHintBanner from "../components/SetupHintBanner";
import { showUserError, showUserSuccess } from "../lib/notice";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import {
  getPeriodComparison,
  getPeriodProfit,
  getPeriodTotals,
  getProductSalesByDay,
  getSalesByCategory,
  getSalesByDay,
  getSalesByEmployee,
  getSalesByHour,
  getSalesByPayment,
  getTopProducts,
  PERIOD_LABELS,
  periodToDays,
  type PeriodProfit,
  type PeriodComparison,
  type ProductSalesByDayRow,
  type ReportPeriod,
  type SalesByCategoryRow,
  type SalesByDayRow,
  type SalesByEmployeeRow,
  type SalesByHourRow,
  type SalesByPaymentRow,
  type TopProductRow,
} from "../db/reports";
import { shareDailySummary } from "../lib/dailySummary";
import { formatMoney } from "../lib/format";
import {
  exportSalesCsv,
  exportSalesDetailCsv,
  pickExportSalesDetailPath,
  pickExportSalesPath,
} from "../lib/tauri";
import { getSetting } from "../db/settings";
import { getWhatsAppTurnosStatus } from "../lib/whatsappTurnos";
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";
import PlanUpsellNotice from "../components/PlanUpsellNotice";

type TabId = "summary" | "daily" | "products" | "categories" | "hours";

const PERIODS: ReportPeriod[] = ["week", "month", "quarter", "year"];

export default function Reports() {
  const { currency, businessName, isProModuleActive } = useAppConfig();
  const { can } = useAuth();
  const { whatsappDailyReport } = usePlanEntitlements();
  const showProfit = can("view_profits");
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [tab, setTab] = useState<TabId>("summary");
  const [exporting, setExporting] = useState<"summary" | "detail" | "whatsapp" | null>(null);
  const [bizWhatsApp, setBizWhatsApp] = useState<string | null>(null);
  const [waTurnosOk, setWaTurnosOk] = useState(true);
  const days = periodToDays(period);

  const [totals, setTotals] = useState({ count: 0, total: 0, avg_ticket: 0 });
  const [comparison, setComparison] = useState<PeriodComparison | null>(null);
  const [profit, setProfit] = useState<PeriodProfit | null>(null);
  const [byDay, setByDay] = useState<SalesByDayRow[]>([]);
  const [byPay, setByPay] = useState<SalesByPaymentRow[]>([]);
  const [top, setTop] = useState<TopProductRow[]>([]);
  const [byEmployee, setByEmployee] = useState<SalesByEmployeeRow[]>([]);
  const [byCategory, setByCategory] = useState<SalesByCategoryRow[]>([]);
  const [byHour, setByHour] = useState<SalesByHourRow[]>([]);
  const [productByDay, setProductByDay] = useState<ProductSalesByDayRow[]>([]);

  useEffect(() => {
    Promise.all([
      getPeriodTotals(days),
      getPeriodComparison(days),
      getSalesByDay(days),
      getSalesByPayment(days),
      getTopProducts(days, 12),
      getSalesByEmployee(days),
      getSalesByCategory(days),
      getSalesByHour(days),
      getProductSalesByDay(days, 250),
    ]).then(([t, cmp, d, p, topP, emp, cat, hrs, pbd]) => {
      setTotals(t);
      setComparison(cmp);
      setByDay(d);
      setByPay(p);
      setTop(topP);
      setByEmployee(emp);
      setByCategory(cat);
      setByHour(hrs);
      setProductByDay(pbd);
    });
  }, [days]);

  useEffect(() => {
    if (!showProfit) {
      setProfit(null);
      return;
    }
    getPeriodProfit(days).then(setProfit);
  }, [days, showProfit]);

  const showWaTurnosHint = isProModuleActive("appointments");

  useEffect(() => {
    getSetting("print_whatsapp")
      .then((v) => setBizWhatsApp(v?.trim() || null))
      .catch(() => setBizWhatsApp(null));
    if (!showWaTurnosHint) {
      setWaTurnosOk(true);
      return;
    }
    getWhatsAppTurnosStatus()
      .then((st) => setWaTurnosOk(st.configured && st.enabled))
      .catch(() => setWaTurnosOk(false));
  }, [showWaTurnosHint]);

  const maxDay = Math.max(...byDay.map((d) => d.total), 1);
  const maxHour = Math.max(...byHour.map((h) => h.total), 1);

  async function handleExportSummary() {
    setExporting("summary");
    try {
      const path = await pickExportSalesPath();
      if (!path) return;
      const n = await exportSalesCsv(path, days);
      showUserSuccess(
        `Exportadas ${n.toLocaleString("es-AR")} ventas con resúmenes incluidos.\n\n${path}\n\nTip: abrilo con Excel (separador ;).`,
        "Exportación lista",
      );
    } catch (e) {
      showUserError(e);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportDetail() {
    setExporting("detail");
    try {
      const path = await pickExportSalesDetailPath();
      if (!path) return;
      const n = await exportSalesDetailCsv(path, days);
      showUserSuccess(
        `Exportadas ${n.toLocaleString("es-AR")} líneas con resumen incluido.\n\n${path}\n\nTip: abrilo con Excel (separador ;).`,
        "Exportación lista",
      );
    } catch (e) {
      showUserError(e);
    } finally {
      setExporting(null);
    }
  }

  async function handleShareToday() {
    setExporting("whatsapp");
    try {
      const { copied } = await shareDailySummary(businessName, currency);
      if (copied) {
        showUserSuccess(
          "El resumen se copió al portapapeles. Elegí el chat en WhatsApp y pegalo.",
        );
      }
    } catch (e) {
      showUserError(e);
    } finally {
      setExporting(null);
    }
  }

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: "summary", label: "Resumen", icon: <TrendingUp size={14} /> },
    { id: "daily", label: "Por día", icon: <BarChart3 size={14} /> },
    { id: "products", label: "Productos / día", icon: <Package size={14} /> },
    { id: "categories", label: "Categorías", icon: <Layers size={14} /> },
    { id: "hours", label: "Por hora", icon: <Clock size={14} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Ventas, productos y estadísticas del período"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {whatsappDailyReport ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleShareToday()}
                disabled={exporting !== null}
                loading={exporting === "whatsapp"}
              >
                <MessageCircle size={14} /> Resumen hoy
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExportSummary()}
              disabled={exporting !== null}
              loading={exporting === "summary"}
            >
              <Download size={14} />
              CSV contador
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExportDetail()}
              disabled={exporting !== null}
              loading={exporting === "detail"}
            >
              <Download size={14} />
              Detalle CSV
            </Button>
            <label className="relative inline-flex">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
                aria-label="Período"
                className="appearance-none rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-1.5 pl-3 pr-7 text-xs font-semibold text-ink outline-none hover:border-brand-300 focus:border-brand-500"
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_LABELS[p]}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted">
                ▾
              </span>
            </label>
          </div>
        }
      />

      <PageContent className="space-y-6">
        {!whatsappDailyReport && (
          <PlanUpsellNotice feature="whatsappDailyReport" />
        )}
        {whatsappDailyReport && !bizWhatsApp && (
          <SetupHintBanner
            title="WhatsApp del comercio sin configurar"
            description="Para mandar el resumen del día por WhatsApp más fácil, cargá el número en Apariencia / datos de impresión."
            to="/admin?section=appearance"
            linkLabel="Configurar WhatsApp"
          />
        )}
        {showWaTurnosHint && !waTurnosOk && (
          <SetupHintBanner
            title="WhatsApp de turnos no sincronizado"
            description="Conectá WhatsApp Business para confirmar turnos y avisos automáticos."
            to="/admin?section=whatsapp"
            linkLabel="Configurar turnos WSP"
            tone="sky"
          />
        )}

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={tab === t.id ? "primary" : "secondary"}
              onClick={() => setTab(t.id)}
            >
              {t.icon} {t.label}
            </Button>
          ))}
        </div>

      {tab === "summary" && (
        <>
          <div
            className={`grid gap-4 ${showProfit && profit ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
          >
            <Card
              variant="kpi-featured"
              className="relative overflow-hidden border-brand-400/30 bg-gradient-to-br from-brand-500/15 via-[var(--color-panel)] to-sky-500/10 lg:col-span-2"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500/20 ring-1 ring-brand-400/40">
                  <TrendingUp className="text-brand-600 dark:text-brand-300" size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    Total vendido
                  </p>
                  <p className="kpi-value break-all">{formatMoney(totals.total, currency)}</p>
                  <p className="text-xs text-ink-muted">
                    {totals.count} ventas en {PERIOD_LABELS[period].toLowerCase()}
                  </p>
                </div>
              </div>
            </Card>
            <Card variant="kpi" className="border-sky-500/20 bg-gradient-to-b from-sky-500/10 to-transparent">
              <div className="mb-2 inline-flex rounded-lg bg-sky-500/15 p-2 text-sky-600 dark:text-sky-300">
                <Receipt size={16} />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Ticket promedio</p>
              <p className="kpi-value mt-1 break-all">{formatMoney(totals.avg_ticket, currency)}</p>
            </Card>
            {comparison && (
              <Card
                variant="kpi"
                className={
                  comparison.change_pct >= 0
                    ? "border-emerald-500/25 bg-gradient-to-b from-emerald-500/10 to-transparent"
                    : "border-rose-500/25 bg-gradient-to-b from-rose-500/10 to-transparent"
                }
              >
                <div
                  className={`mb-2 inline-flex rounded-lg p-2 ${
                    comparison.change_pct >= 0
                      ? "bg-emerald-500/15 text-emerald-600"
                      : "bg-rose-500/15 text-rose-600"
                  }`}
                >
                  <Sparkles size={16} />
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">vs período anterior</p>
                <p
                  className={`kpi-value mt-1 ${
                    comparison.change_pct >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600"
                  }`}
                >
                  {comparison.change_pct >= 0 ? "+" : ""}
                  {comparison.change_pct.toFixed(1)}%
                </p>
                <p className="text-xs text-ink-muted">
                  Antes: {formatMoney(comparison.previous_total, currency)}
                </p>
              </Card>
            )}
            <Card variant="kpi" className="border-violet-500/20 bg-gradient-to-b from-violet-500/10 to-transparent">
              <div className="mb-2 inline-flex rounded-lg bg-violet-500/15 p-2 text-violet-600 dark:text-violet-300">
                <Wallet size={16} />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Medios de pago</p>
              <p className="kpi-value mt-1">{byPay.length}</p>
              <p className="text-xs text-ink-muted">tipos usados</p>
            </Card>
            {showProfit && profit && (
              <Card
                variant="kpi-featured"
                className="border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-orange-500/5"
              >
                <div className="mb-2 inline-flex rounded-lg bg-amber-500/20 p-2 text-amber-700 dark:text-amber-300">
                  <PiggyBank size={16} />
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Ganancia estimada</p>
                <p className="kpi-value mt-1 break-all">{formatMoney(profit.profit, currency)}</p>
                <p className="text-xs text-ink-muted">
                  Margen {profit.margin_pct.toFixed(1)}% · Costo {formatMoney(profit.cost, currency)}
                </p>
              </Card>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card variant="elevated" className="border-sky-500/15">
              <h2 className="report-section-title mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-sky-600" /> Ventas por día
              </h2>
              <div className="max-h-80 space-y-2.5 overflow-y-auto">
                {byDay.map((d) => (
                  <div key={d.day} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-ink-muted">{d.day}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sky-500/15 dark:bg-sky-900/40">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-brand-500 transition-all duration-200"
                        style={{ width: `${(d.total / maxDay) * 100}%` }}
                      />
                    </div>
                    <span className="w-28 shrink-0 text-right tabular-nums font-semibold text-ink">
                      {formatMoney(d.total, currency)}
                    </span>
                    <span className="w-8 shrink-0 text-right text-ink-muted">{d.count}</span>
                  </div>
                ))}
                {byDay.length === 0 && (
                  <EmptyState
                    compact
                    icon={BarChart3}
                    title="Sin ventas en el período"
                    description="Cuando registres ventas, verás la evolución diaria acá."
                  />
                )}
              </div>
            </Card>

            <Card variant="elevated" className="border-violet-500/15">
              <h2 className="report-section-title mb-4 flex items-center gap-2">
                <CreditCard size={16} className="text-violet-600" /> Por medio de pago
              </h2>
              {byPay.length === 0 ? (
                <EmptyState compact icon={Layers} title="Sin datos de pago" description="Los totales por medio de pago aparecerán cuando haya ventas." />
              ) : (
              <ul className="space-y-2.5 text-sm">
                {byPay.map((p) => (
                  <li key={p.payment_method} className="flex justify-between gap-4 rounded-xl border border-violet-500/10 bg-violet-500/5 px-3 py-2 hover:bg-violet-500/10">
                    <span className="inline-flex items-center gap-2 capitalize text-ink">
                      <Wallet size={14} className="text-violet-500" />
                      {p.payment_method}
                    </span>
                    <span className="tabular-nums font-semibold text-ink">
                      {formatMoney(p.total, currency)}{" "}
                      <span className="font-normal text-ink-muted">({p.count})</span>
                    </span>
                  </li>
                ))}
              </ul>
              )}
            </Card>

            <Card variant="elevated">
              <h2 className="report-section-title mb-4 flex items-center gap-2">
                <Users size={16} className="text-brand-600" /> Por empleado
              </h2>
              <div className="data-table-wrap border-0 shadow-none">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th className="text-right">Ventas</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byEmployee.map((e) => (
                      <tr key={e.user_id ?? "none"}>
                        <td>{e.display_name}</td>
                        <td className="text-right tabular-nums">{e.count}</td>
                        <td className="text-right tabular-nums font-medium">
                          {formatMoney(e.total, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {byEmployee.length === 0 && (
                <EmptyState compact icon={Users} title="Sin ventas por empleado" description="El desglose por cajero se mostrará cuando haya ventas registradas." />
              )}
            </Card>

            <Card variant="elevated">
              <h2 className="report-section-title mb-4">Más vendidos</h2>
              <div className="data-table-wrap border-0 shadow-none">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="text-right">Unid.</th>
                      <th className="text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((t) => (
                      <tr key={t.name}>
                        <td>{t.name}</td>
                        <td className="text-right tabular-nums">{t.qty}</td>
                        <td className="text-right tabular-nums font-medium">
                          {formatMoney(t.total, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {top.length === 0 && (
                <EmptyState compact icon={Package} title="Sin productos vendidos" description="El ranking de más vendidos aparecerá cuando haya ventas en el período." />
              )}
            </Card>
          </div>
        </>
      )}

      {tab === "daily" && (
          <Card variant="elevated">
            <h2 className="report-section-title mb-4">Ventas totales por día</h2>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Día</th>
                    <th className="text-right">Operaciones</th>
                    <th className="text-right">Total vendido</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="cell-empty">
                        <EmptyState
                          compact
                          icon={BarChart3}
                          title={`Sin ventas en ${PERIOD_LABELS[period].toLowerCase()}`}
                          description="El detalle diario se completará cuando registres ventas."
                        />
                      </td>
                    </tr>
                  ) : (
                    byDay.map((d) => (
                      <tr key={d.day}>
                        <td>{d.day}</td>
                        <td className="text-right tabular-nums">{d.count}</td>
                        <td className="text-right tabular-nums font-medium">
                          {formatMoney(d.total, currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
      )}

      {tab === "products" && (
          <Card variant="elevated">
            <h2 className="report-section-title mb-2">Ventas parciales por producto y día</h2>
            <p className="mb-4 text-xs text-ink-muted">
              Detalle de unidades e importe vendido cada día (hasta 250 líneas).
            </p>
            <div className="data-table-wrap max-h-[32rem] overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Producto</th>
                    <th className="text-right">Cant.</th>
                    <th className="text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {productByDay.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="cell-empty">
                        <EmptyState
                          compact
                          icon={Package}
                          title="Sin líneas de venta"
                          description="El detalle por producto y día aparecerá cuando haya movimientos."
                        />
                      </td>
                    </tr>
                  ) : (
                    productByDay.map((r) => (
                      <tr key={`${r.day}-${r.name}`}>
                        <td className="cell-muted">{r.day}</td>
                        <td>{r.name}</td>
                        <td className="text-right tabular-nums">{r.qty}</td>
                        <td className="text-right tabular-nums font-medium">
                          {formatMoney(r.total, currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
      )}

      {tab === "categories" && (
          <Card variant="elevated">
            <h2 className="report-section-title mb-4">Ventas por categoría</h2>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th className="text-right">Unidades</th>
                    <th className="text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="cell-empty">
                        <EmptyState
                          compact
                          icon={Layers}
                          title="Sin ventas por categoría"
                          description="Asigná categorías a tus productos para ver este desglose."
                        />
                      </td>
                    </tr>
                  ) : (
                    byCategory.map((c) => (
                      <tr key={c.category_name}>
                        <td>{c.category_name}</td>
                        <td className="text-right tabular-nums">{c.qty}</td>
                        <td className="text-right tabular-nums font-medium">
                          {formatMoney(c.total, currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
      )}

      {tab === "hours" && (
          <Card variant="elevated">
            <h2 className="report-section-title mb-4 flex items-center gap-2">
              <Clock size={16} className="text-brand-600" /> Ventas por hora del día
            </h2>
            <div className="space-y-2.5">
              {byHour.map((h) => (
                <div key={h.hour} className="flex items-center gap-3 text-sm">
                  <span className="w-14 shrink-0 text-ink-muted">{h.hour}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-900/50">
                    <div
                      className="h-full rounded-full bg-brand-400 transition-all duration-200"
                      style={{ width: `${(h.total / maxHour) * 100}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right tabular-nums font-semibold text-ink">
                    {formatMoney(h.total, currency)}
                  </span>
                  <span className="w-8 shrink-0 text-right text-ink-muted">{h.count}</span>
                </div>
              ))}
              {byHour.length === 0 && (
                <EmptyState
                  compact
                  icon={Clock}
                  title="Sin datos horarios"
                  description="La distribución por hora del día se mostrará cuando haya ventas."
                />
              )}
            </div>
          </Card>
      )}
      </PageContent>
    </div>
  );
}
