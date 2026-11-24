import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Boxes,
  Clock,
  CreditCard,
  Download,
  Handshake,
  Layers,
  MapPin,
  Monitor,
  MessageCircle,
  Package,
  Palette,
  Printer,
  ReceiptText,
  Ruler,
  Scale,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { PageHeader, Button, PageContent } from "../components/ui";
import SetupHintBanner from "../components/SetupHintBanner";
import { showUserError, showUserSuccess } from "../lib/notice";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";
import {
  getCollectedByDay,
  getCustomersWithDebt,
  getPeriodComparison,
  getPeriodProfit,
  getPeriodTotals,
  getProductSalesByDay,
  getSalesByCategory,
  getSalesByDay,
  getSalesByEmployee,
  getSalesByHour,
  getSalesByPayment,
  getSalesByRegister,
  getSalesBySizeColor,
  getSalesByTable,
  getSalesByVariantAttr,
  getSalesByWaiter,
  getStockValuation,
  getTopProducts,
  PERIOD_LABELS,
  periodToDays,
  REPORT_SCOPE_LABELS,
  type CustomerDebtRow,
  type PeriodProfit,
  type PeriodComparison,
  type ProductSalesByDayRow,
  type ReportPeriod,
  type ReportRegisterRow,
  type ReportScope,
  type ReportWindow,
  type SalesByCategoryRow,
  type SalesByDayRow,
  type SalesByEmployeeRow,
  type SalesByHourRow,
  type SalesByPaymentRow,
  type SalesBySizeColorRow,
  type SalesByTableRow,
  type SalesByVariantAttrRow,
  type SalesByWaiterRow,
  type StockValuationRow,
  type TopProductRow,
} from "../db/reports";
import { getExpenseSummary, monthBounds, type ExpenseSummary } from "../db/expenses";
import { getOwnerWithdrawals } from "../db/treasury";
import { listSuppliersWithBalance, type SupplierWithBalance } from "../db/supplierAccounts";
import { listStaffUsers, type StaffUser } from "../db/users";
import { expenseCategory } from "../config/expenseCategories";
import { getMoneyInflow, type MoneyInflow } from "../db/moneyInflow";
import { formatPaymentMethod } from "../lib/paymentLabels";
import { inflowPrintTable } from "../lib/dailySummary";
import DailySummaryModal from "../components/reports/DailySummaryModal";
import ReportsDashboard from "../components/reports/ReportsDashboard";
import {
  CategoriesPanel,
  ColorsSalesPanel,
  DailySalesPanel,
  EmployeesOpsPanel,
  HoursOpsPanel,
  HoursSalesPanel,
  PaymentsFinancePanel,
  ProductsByDayPanel,
  RegistersOpsPanel,
  SizesSalesPanel,
  TablesSalesPanel,
  WaitersSalesPanel,
} from "../components/reports/ReportDetailTabs";
import { formatDateShort, formatMoney, formatQty, shiftYmd, todayYmd } from "../lib/format";
import {
  exportSalesCsv,
  exportSalesDetailCsv,
  pickExportSalesDetailPath,
  pickExportSalesPath,
} from "../lib/tauri";
import { getSetting } from "../db/settings";
import { getWhatsAppTurnosStatus } from "../lib/whatsappTurnos";
import {
  DebtorsPanel,
  ExpensesByCategoryCard,
  ResultPanel,
  StockValuePanel,
  SupplierDebtPanel,
} from "../components/reports/ReportPanels";
import { printReport, type PrintableReport } from "../lib/prints/reportDocument";

type SalesTab =
  | "summary"
  | "result"
  | "daily"
  | "products"
  | "categories"
  | "hours"
  | "tables"
  | "waiters"
  | "sizes"
  | "colors";
type FinanceTab = "expenses" | "payments" | "debtors" | "stock" | "suppliers";
type OpsTab = "employees" | "registers" | "hours_ops";
type TabId = SalesTab | FinanceTab | OpsTab;

type PeriodChoice = ReportPeriod | "today" | "yesterday" | "this_month" | "prev_month" | "custom";

const PERIODS: ReportPeriod[] = ["week", "month", "quarter", "year"];
const SCOPES: ReportScope[] = ["consolidado", "local"];
/** Pestañas que se pueden filtrar por cajero. */
const CASHIER_TABS: TabId[] = [
  "summary",
  "daily",
  "products",
  "categories",
  "hours",
  "tables",
  "waiters",
  "sizes",
  "colors",
  "payments",
  "employees",
  "registers",
  "hours_ops",
];
/** Pestañas que son la foto de hoy, sin período. */
const SNAPSHOT_TABS: TabId[] = ["debtors", "stock", "suppliers"];

function registerLabel(row: ReportRegisterRow): string {
  return row.device_name?.trim() || row.device_code;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000,
  );
}

export default function Reports() {
  const { currency, businessName, isProModuleActive, features, rubroDef, tablesEnabled } = useAppConfig();
  const { can, canViewStock } = useAuth();
  const { expenses: expensesPlan } = usePlanEntitlements();
  const showProfit = can("view_profits");
  const showSuppliers = features.stock && rubroDef.id !== "clinica" && can("manage_products") && canViewStock;
  const today = todayYmd();

  const [periodChoice, setPeriodChoice] = useState<PeriodChoice>("month");
  const [customFrom, setCustomFrom] = useState(() => monthBounds(todayYmd()).from);
  const [customTo, setCustomTo] = useState(() => todayYmd());
  const [scope, setScope] = useState<ReportScope>("consolidado");
  const [cashierId, setCashierId] = useState<number | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [tab, setTab] = useState<TabId>("summary");
  const [exporting, setExporting] = useState<"summary" | "detail" | null>(null);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [bizWhatsApp, setBizWhatsApp] = useState<string | null>(null);
  const [waTurnosOk, setWaTurnosOk] = useState(true);

  /** Rango efectivo (YYYY-MM-DD) y ventana para las consultas de ventas. */
  const { range, baseWindow, periodLabel } = useMemo(() => {
    if (periodChoice === "today" || periodChoice === "yesterday") {
      const day = periodChoice === "today" ? today : shiftYmd(today, -1);
      const r = { from: day, to: day };
      return { range: r, baseWindow: r as ReportWindow, periodLabel: periodChoice === "today" ? "Hoy" : "Ayer" };
    }
    if (periodChoice === "this_month") {
      const r = { from: monthBounds(today).from, to: today };
      return { range: r, baseWindow: r as ReportWindow, periodLabel: "Este mes" };
    }
    if (periodChoice === "prev_month") {
      const r = monthBounds(shiftYmd(monthBounds(today).from, -1));
      return { range: r, baseWindow: r as ReportWindow, periodLabel: "Mes anterior" };
    }
    if (periodChoice === "custom") {
      const [from, to] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
      const r = { from: from || today, to: to || today };
      return {
        range: r,
        baseWindow: r as ReportWindow,
        periodLabel: `Del ${formatDateShort(r.from)} al ${formatDateShort(r.to)}`,
      };
    }
    const days = periodToDays(periodChoice);
    return {
      range: { from: shiftYmd(today, -days), to: today },
      baseWindow: days as ReportWindow,
      periodLabel: PERIOD_LABELS[periodChoice],
    };
  }, [periodChoice, customFrom, customTo, today]);

  const salesWindow: ReportWindow = useMemo(() => {
    if (cashierId == null) return baseWindow;
    return typeof baseWindow === "number"
      ? { days: baseWindow, userId: cashierId }
      : { ...baseWindow, userId: cashierId };
  }, [baseWindow, cashierId]);
  const windowKey = JSON.stringify(salesWindow);
  const baseKey = JSON.stringify(baseWindow);
  const cashierName = cashierId != null ? staff.find((u) => u.id === cashierId)?.display_name ?? "Cajero" : null;

  const [totals, setTotals] = useState({ count: 0, total: 0, avg_ticket: 0 });
  const [comparison, setComparison] = useState<PeriodComparison | null>(null);
  const [profit, setProfit] = useState<PeriodProfit | null>(null);
  const [profitAll, setProfitAll] = useState<PeriodProfit | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary>({ total: 0, count: 0, byCategory: [] });
  const [ownerWithdrawals, setOwnerWithdrawals] = useState(0);
  const [byDay, setByDay] = useState<SalesByDayRow[]>([]);
  const [collectedByDay, setCollectedByDay] = useState<SalesByDayRow[]>([]);
  const [byPay, setByPay] = useState<SalesByPaymentRow[]>([]);
  const [inflow, setInflow] = useState<MoneyInflow | null>(null);
  const [top, setTop] = useState<TopProductRow[]>([]);
  const [byEmployee, setByEmployee] = useState<SalesByEmployeeRow[]>([]);
  const [byCategory, setByCategory] = useState<SalesByCategoryRow[]>([]);
  const [byHour, setByHour] = useState<SalesByHourRow[]>([]);
  const [byTable, setByTable] = useState<SalesByTableRow[]>([]);
  const [byWaiter, setByWaiter] = useState<SalesByWaiterRow[]>([]);
  const [bySize, setBySize] = useState<SalesByVariantAttrRow[]>([]);
  const [byColor, setByColor] = useState<SalesByVariantAttrRow[]>([]);
  const [bySizeColor, setBySizeColor] = useState<SalesBySizeColorRow[]>([]);
  const [productByDay, setProductByDay] = useState<ProductSalesByDayRow[]>([]);
  const [byRegister, setByRegister] = useState<ReportRegisterRow[]>([]);
  const [debtors, setDebtors] = useState<CustomerDebtRow[]>([]);
  const [stockRows, setStockRows] = useState<StockValuationRow[]>([]);
  const [supplierRows, setSupplierRows] = useState<SupplierWithBalance[]>([]);
  const showGastroReports = tablesEnabled || rubroDef.id === "gastronomia";
  const sizeAttr =
    rubroDef.variantAttributes.find((a) => /talle/i.test(a)) ??
    (rubroDef.id === "ropa" ? "Talle" : null);
  const colorAttr =
    rubroDef.variantAttributes.find((a) => /color/i.test(a)) ??
    (rubroDef.id === "ropa" ? "Color" : null);
  const showApparelReports = Boolean(
    rubroDef.fields.variants && (sizeAttr || colorAttr) && (rubroDef.id === "ropa" || sizeAttr),
  );

  useEffect(() => {
    listStaffUsers()
      .then((rows) => setStaff(rows.filter((u) => !u.is_cadete)))
      .catch(() => setStaff([]));
  }, []);

  useEffect(() => {
    const w = salesWindow;
    Promise.all([
      getPeriodTotals(w, scope),
      getPeriodComparison(w, scope),
      getSalesByDay(w, scope),
      getCollectedByDay(w, scope),
      getSalesByPayment(w, scope),
      getTopProducts(w, 12, scope),
      getSalesByEmployee(w, scope),
      getSalesByCategory(w, scope),
      getSalesByHour(w, scope),
      getProductSalesByDay(w, 250, scope),
      scope === "consolidado" ? getSalesByRegister(w, "consolidado") : Promise.resolve([]),
      getMoneyInflow(w, scope),
      showGastroReports ? getSalesByTable(w, scope) : Promise.resolve([] as SalesByTableRow[]),
      showGastroReports ? getSalesByWaiter(w, scope) : Promise.resolve([] as SalesByWaiterRow[]),
      showApparelReports && sizeAttr
        ? getSalesByVariantAttr(sizeAttr, w, scope)
        : Promise.resolve([] as SalesByVariantAttrRow[]),
      showApparelReports && colorAttr
        ? getSalesByVariantAttr(colorAttr, w, scope)
        : Promise.resolve([] as SalesByVariantAttrRow[]),
      showApparelReports && sizeAttr && colorAttr
        ? getSalesBySizeColor(w, scope, sizeAttr, colorAttr)
        : Promise.resolve([] as SalesBySizeColorRow[]),
    ])
      .then(
        ([
          t,
          cmp,
          d,
          collected,
          p,
          topP,
          emp,
          cat,
          hrs,
          pbd,
          reg,
          inf,
          tables,
          waiters,
          sizes,
          colors,
          sizeColor,
        ]) => {
          setTotals(t);
          setComparison(cmp);
          setByDay(d);
          setCollectedByDay(collected);
          setByPay(p);
          setInflow(inf);
          setTop(topP);
          setByEmployee(emp);
          setByCategory(cat);
          setByHour(hrs);
          setProductByDay(pbd);
          setByRegister(reg);
          setByTable(tables);
          setByWaiter(waiters);
          setBySize(sizes);
          setByColor(colors);
          setBySizeColor(sizeColor);
        },
      )
      .catch(showUserError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey, scope, showGastroReports, showApparelReports, sizeAttr, colorAttr]);

  useEffect(() => {
    if (!showProfit) {
      setProfit(null);
      setProfitAll(null);
      return;
    }
    const all = getPeriodProfit(baseWindow, scope);
    const mine = cashierId != null ? getPeriodProfit(salesWindow, scope) : all;
    Promise.all([all, mine])
      .then(([a, m]) => {
        setProfitAll(a);
        setProfit(m);
      })
      .catch(showUserError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey, windowKey, scope, showProfit]);

  useEffect(() => {
    getExpenseSummary(range.from, range.to).then(setExpenses).catch(showUserError);
    getOwnerWithdrawals(range.from, range.to)
      .then(setOwnerWithdrawals)
      .catch(() => setOwnerWithdrawals(0));
  }, [range.from, range.to]);

  useEffect(() => {
    if (tab === "debtors") getCustomersWithDebt().then(setDebtors).catch(showUserError);
    if (tab === "stock") getStockValuation().then(setStockRows).catch(showUserError);
    if (tab === "suppliers") listSuppliersWithBalance().then(setSupplierRows).catch(showUserError);
  }, [tab]);

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

  /** El CSV trabaja con «últimos N días»: con fechas elegidas, va desde el «Desde» hasta hoy. */
  const csvDays = typeof baseWindow === "number" ? baseWindow : Math.max(1, daysBetween(range.from, today));
  const csvNote =
    typeof baseWindow === "number" ? "" : `\n\nIncluye desde el ${formatDateShort(range.from)} hasta hoy.`;

  async function handleExportSummary() {
    setExporting("summary");
    try {
      const path = await pickExportSalesPath();
      if (!path) return;
      const n = await exportSalesCsv(path, csvDays);
      showUserSuccess(
        `Exportadas ${n.toLocaleString("es-AR")} ventas con resúmenes incluidos.${csvNote}\n\n${path}\n\nTip: abrilo con Excel (separador ;).`,
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
      const n = await exportSalesDetailCsv(path, csvDays);
      showUserSuccess(
        `Exportadas ${n.toLocaleString("es-AR")} líneas con resumen incluido.${csvNote}\n\n${path}\n\nTip: abrilo con Excel (separador ;).`,
        "Exportación lista",
      );
    } catch (e) {
      showUserError(e);
    } finally {
      setExporting(null);
    }
  }

  const salesTabs: { id: SalesTab; label: string; icon: ReactNode }[] = [
    { id: "summary", label: "Resumen", icon: <TrendingUp size={14} /> },
    ...(showProfit ? [{ id: "result" as const, label: "Resultado", icon: <Scale size={14} /> }] : []),
    { id: "daily", label: "Por día", icon: <BarChart3 size={14} /> },
    { id: "products", label: "Productos / día", icon: <Package size={14} /> },
    { id: "categories", label: "Categorías", icon: <Layers size={14} /> },
    { id: "hours", label: "Por hora", icon: <Clock size={14} /> },
    ...(showGastroReports
      ? [
          { id: "tables" as const, label: "Por mesa", icon: <MapPin size={14} /> },
          { id: "waiters" as const, label: "Por mozo", icon: <UserRound size={14} /> },
        ]
      : []),
    ...(showApparelReports
      ? [
          ...(sizeAttr ? [{ id: "sizes" as const, label: "Por talle", icon: <Ruler size={14} /> }] : []),
          ...(colorAttr ? [{ id: "colors" as const, label: "Por color", icon: <Palette size={14} /> }] : []),
        ]
      : []),
  ];
  const financeTabs: { id: FinanceTab; label: string; icon: ReactNode }[] = [
    { id: "expenses", label: "Gastos por categoría", icon: <ReceiptText size={14} /> },
    { id: "payments", label: "Medios de pago", icon: <CreditCard size={14} /> },
    ...(features.customers ? [{ id: "debtors" as const, label: "Clientes que deben", icon: <Users size={14} /> }] : []),
    ...(showSuppliers ? [{ id: "suppliers" as const, label: "Deuda con proveedores", icon: <Handshake size={14} /> }] : []),
    ...(features.stock && canViewStock
      ? [{ id: "stock" as const, label: "Stock valorizado", icon: <Boxes size={14} /> }]
      : []),
  ];
  const opsTabs: { id: OpsTab; label: string; icon: ReactNode }[] = [
    { id: "employees", label: "Por empleado", icon: <UserRound size={14} /> },
    ...(scope === "consolidado"
      ? [{ id: "registers" as const, label: "Por caja / PC", icon: <Monitor size={14} /> }]
      : []),
    { id: "hours_ops", label: "Actividad operativa", icon: <Clock size={14} /> },
  ];
  const PERIOD_CHIPS: { id: PeriodChoice; label: string }[] = [
    { id: "today", label: "Hoy" },
    { id: "week", label: "7 días" },
    { id: "month", label: "30 días" },
    { id: "this_month", label: "Este mes" },
    { id: "custom", label: "Personalizado" },
  ];

  const isSnapshot = SNAPSHOT_TABS.includes(tab);
  const cashierApplies = CASHIER_TABS.includes(tab);
  const scopeApplies = cashierApplies || tab === "result";

  const resultNotes = [
    "El costo sale del costo cargado hoy en cada producto.",
    "Los pagos a proveedores no se restan acá: esa mercadería ya está en el costo de lo vendido.",
    ...(ownerWithdrawals > 0
      ? ["Los retiros del dueño no son gastos: se muestran aparte y no bajan la ganancia."]
      : []),
    ...(scope === "local" ? ["Las ventas son de esta caja, pero los gastos son de todo el local."] : []),
    ...(cashierId != null ? ["El resultado no se filtra por cajero: muestra todas las ventas."] : []),
  ];

  const inflowNotes = [
    ...(scope === "local" ? ["Los cobros de fiado no se separan por caja."] : []),
    ...(cashierName ? [`Solo lo que cobró ${cashierName}.`] : []),
  ];

  const filterSubtitle = [
    isSnapshot ? "Hoy" : periodLabel,
    scopeApplies ? REPORT_SCOPE_LABELS[scope] : null,
    cashierApplies && cashierName ? `Cajero: ${cashierName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function buildPrintable(): PrintableReport {
    const money = (n: number) => formatMoney(n, currency);
    const base = { subtitle: filterSubtitle };
    switch (tab) {
      case "result": {
        const p = profitAll;
        return {
          ...base,
          title: "Resultado del período",
          summary: p
            ? [
                { label: "Ventas", value: money(p.revenue) },
                { label: "Costo de lo vendido (estimado)", value: `− ${money(p.cost)}` },
                { label: "Ganancia de las ventas", value: money(p.profit) },
                { label: "Gastos del negocio", value: `− ${money(expenses.total)}` },
                { label: "Ganancia real (estimada)", value: money(p.profit - expenses.total), grand: true },
                ...(ownerWithdrawals > 0
                  ? [{ label: "Retiros del dueño (no se restan)", value: money(ownerWithdrawals) }]
                  : []),
              ]
            : [],
          tables: [
            {
              heading: "Gastos por categoría",
              columns: [{ label: "Categoría" }, { label: "Cant.", num: true }, { label: "Total", num: true }],
              rows: expenses.byCategory.map((c) => [expenseCategory(c.category).label, String(c.count), money(c.total)]),
            },
          ],
          notes: resultNotes,
        };
      }
      case "daily":
        return {
          ...base,
          title: "Ventas por día",
          summary: [{ label: "Total vendido", value: money(totals.total), grand: true }],
          tables: [
            {
              columns: [{ label: "Día" }, { label: "Operaciones", num: true }, { label: "Total", num: true }],
              rows: byDay.map((d) => [formatDateShort(d.day), String(d.count), money(d.total)]),
            },
          ],
        };
      case "products":
        return {
          ...base,
          title: "Ventas por producto y día",
          summary: [{ label: "Total vendido", value: money(totals.total), grand: true }],
          tables: [
            {
              columns: [{ label: "Día" }, { label: "Producto" }, { label: "Cant.", num: true }, { label: "Importe", num: true }],
              rows: productByDay.map((r) => [formatDateShort(r.day), r.name, formatQty(r.qty), money(r.total)]),
            },
          ],
        };
      case "categories":
        return {
          ...base,
          title: "Ventas por categoría",
          summary: [{ label: "Total vendido", value: money(totals.total), grand: true }],
          tables: [
            {
              columns: [{ label: "Categoría" }, { label: "Unidades", num: true }, { label: "Importe", num: true }],
              rows: byCategory.map((c) => [c.category_name, formatQty(c.qty), money(c.total)]),
            },
          ],
        };
      case "hours":
        return {
          ...base,
          title: "Ventas por hora",
          summary: [{ label: "Total vendido", value: money(totals.total), grand: true }],
          tables: [
            {
              columns: [{ label: "Hora" }, { label: "Ventas", num: true }, { label: "Total", num: true }],
              rows: byHour.map((h) => [h.hour, String(h.count), money(h.total)]),
            },
          ],
        };
      case "tables":
        return {
          ...base,
          title: "Ventas por mesa",
          summary: [
            {
              label: "Total mesas",
              value: money(byTable.reduce((acc, r) => acc + r.total, 0)),
              grand: true,
            },
          ],
          tables: [
            {
              columns: [
                { label: "Mesa" },
                { label: "Zona" },
                { label: "Cuentas", num: true },
                { label: "Total", num: true },
              ],
              rows: byTable.map((r) => [
                r.table_label,
                r.zone?.trim() || "—",
                String(r.count),
                money(r.total),
              ]),
            },
          ],
        };
      case "waiters":
        return {
          ...base,
          title: "Ventas por mozo",
          summary: [
            {
              label: "Total mesas",
              value: money(byWaiter.reduce((acc, r) => acc + r.total, 0)),
              grand: true,
            },
          ],
          tables: [
            {
              columns: [{ label: "Mozo" }, { label: "Cuentas", num: true }, { label: "Total", num: true }],
              rows: byWaiter.map((r) => [r.waiter_name, String(r.count), money(r.total)]),
            },
          ],
        };
      case "sizes":
        return {
          ...base,
          title: "Ventas por talle",
          summary: [
            {
              label: "Total con variante",
              value: money(bySize.reduce((acc, r) => acc + r.total, 0)),
              grand: true,
            },
          ],
          tables: [
            {
              columns: [
                { label: "Talle" },
                { label: "Unidades", num: true },
                { label: "Total", num: true },
              ],
              rows: bySize.map((r) => [r.attr_value, formatQty(r.qty), money(r.total)]),
            },
            ...(bySizeColor.length > 0
              ? [
                  {
                    columns: [
                      { label: "Talle · color" },
                      { label: "Unidades", num: true },
                      { label: "Total", num: true },
                    ],
                    rows: bySizeColor
                      .slice(0, 40)
                      .map((r) => [r.label, formatQty(r.qty), money(r.total)]),
                  },
                ]
              : []),
          ],
        };
      case "colors":
        return {
          ...base,
          title: "Ventas por color",
          summary: [
            {
              label: "Total con variante",
              value: money(byColor.reduce((acc, r) => acc + r.total, 0)),
              grand: true,
            },
          ],
          tables: [
            {
              columns: [
                { label: "Color" },
                { label: "Unidades", num: true },
                { label: "Total", num: true },
              ],
              rows: byColor.map((r) => [r.attr_value, formatQty(r.qty), money(r.total)]),
            },
          ],
        };
      case "expenses":
        return {
          ...base,
          title: "Gastos por categoría",
          summary: [
            { label: "Gastos anotados", value: String(expenses.count) },
            { label: "Total de gastos", value: money(expenses.total), grand: true },
          ],
          tables: [
            {
              columns: [{ label: "Categoría" }, { label: "Cant.", num: true }, { label: "Total", num: true }],
              rows: expenses.byCategory.map((c) => [expenseCategory(c.category).label, String(c.count), money(c.total)]),
            },
          ],
        };
      case "debtors":
        return {
          ...base,
          title: "Clientes que deben",
          summary: [
            { label: "Clientes", value: String(debtors.length) },
            { label: "Total que te deben", value: money(debtors.reduce((a, r) => a + r.balance, 0)), grand: true },
          ],
          tables: [
            {
              columns: [{ label: "Cliente" }, { label: "Teléfono" }, { label: "Último mov." }, { label: "Debe", num: true }],
              rows: debtors.map((r) => [
                r.name,
                r.phone || "—",
                r.last_movement_at ? formatDateShort(r.last_movement_at) : "—",
                money(r.balance),
              ]),
            },
          ],
        };
      case "stock":
        return {
          ...base,
          title: "Stock valorizado",
          summary: [
            ...(showProfit
              ? [{ label: "A costo", value: money(stockRows.reduce((a, r) => a + r.cost_value, 0)) }]
              : []),
            { label: "A precio de venta", value: money(stockRows.reduce((a, r) => a + r.price_value, 0)), grand: true },
          ],
          tables: [
            {
              columns: [
                { label: "Categoría" },
                { label: "Productos", num: true },
                { label: "Unidades", num: true },
                ...(showProfit ? [{ label: "A costo", num: true }] : []),
                { label: "A precio", num: true },
              ],
              rows: stockRows.map((r) => [
                r.category_name,
                String(r.products),
                formatQty(Math.round(r.units * 1000) / 1000),
                ...(showProfit ? [money(r.cost_value)] : []),
                money(r.price_value),
              ]),
            },
          ],
        };
      case "suppliers": {
        const withDebt = supplierRows.filter((s) => s.balance > 0);
        return {
          ...base,
          title: "Deuda con proveedores",
          summary: [{ label: "Total que les debés", value: money(withDebt.reduce((a, s) => a + s.balance, 0)), grand: true }],
          tables: [
            {
              columns: [{ label: "Proveedor" }, { label: "Teléfono" }, { label: "Último mov." }, { label: "Le debés", num: true }],
              rows: withDebt.map((s) => [
                s.name,
                s.phone || "—",
                s.last_movement_at ? formatDateShort(s.last_movement_at) : "—",
                money(s.balance),
              ]),
            },
          ],
        };
      }
      default:
        return {
          ...base,
          title: "Resumen de ventas",
          summary: [
            { label: "Ventas", value: String(totals.count) },
            { label: "Ticket promedio", value: money(totals.avg_ticket) },
            ...(comparison
              ? [{ label: "Contra el período anterior", value: `${comparison.change_pct >= 0 ? "+" : ""}${comparison.change_pct.toFixed(1)}%` }]
              : []),
            ...(showProfit && profit ? [{ label: "Ganancia estimada", value: money(profit.profit) }] : []),
            ...(inflow ? [{ label: "Total que entró (ventas cobradas y fiado cobrado)", value: money(inflow.totalIn) }] : []),
            { label: "Total vendido", value: money(totals.total), grand: true },
          ],
          tables: [
            ...(inflow ? [inflowPrintTable(inflow, currency)] : []),
            {
              heading: "Por medio de pago",
              columns: [{ label: "Medio" }, { label: "Ventas", num: true }, { label: "Total", num: true }],
              rows: byPay.map((p) => [formatPaymentMethod(p.payment_method), String(p.count), money(p.total)]),
            },
            {
              heading: "Por empleado",
              columns: [{ label: "Empleado" }, { label: "Ventas", num: true }, { label: "Total", num: true }],
              rows: byEmployee.map((e) => [e.display_name, String(e.count), money(e.total)]),
            },
            {
              heading: "Más vendidos",
              columns: [{ label: "Producto" }, { label: "Unid.", num: true }, { label: "Importe", num: true }],
              rows: top.map((t) => [t.name, formatQty(t.qty), money(t.total)]),
            },
          ],
        };
    }
  }

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Rendimiento del comercio y decisiones con números claros."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
              onClick={() => setDailyOpen(true)}
            >
              <MessageCircle size={14} /> Resumen hoy
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleExportSummary()}
              disabled={exporting !== null}
              loading={exporting === "summary"}
            >
              <Download size={14} />
              Exportar CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleExportDetail()}
              disabled={exporting !== null}
              loading={exporting === "detail"}
            >
              <Download size={14} />
              Detalle CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => printReport(businessName, buildPrintable())}>
              <Printer size={14} />
              Imprimir / PDF
            </Button>
          </div>
        }
        filters={
          isSnapshot ? (
            <p className="max-w-xs text-right text-xs text-ink-muted">
              Este reporte es la foto de hoy: no depende del período ni del cajero.
            </p>
          ) : (
            <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap justify-end gap-1.5" role="group" aria-label="Atajos de período">
                {PERIOD_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setPeriodChoice(chip.id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      periodChoice === chip.id
                        ? "bg-brand-500 text-white shadow-sm"
                        : "bg-[var(--color-panel-muted)] text-ink-muted hover:text-ink"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <div className="report-filters report-filters--end">
                <label className="report-filters__field">
                  <span>Período</span>
                  <select
                    value={periodChoice}
                    onChange={(e) => setPeriodChoice(e.target.value as PeriodChoice)}
                    aria-label="Período"
                  >
                    <option value="today">Hoy</option>
                    <option value="yesterday">Ayer</option>
                    {PERIODS.map((p) => (
                      <option key={p} value={p}>
                        {PERIOD_LABELS[p]}
                      </option>
                    ))}
                    <option value="this_month">Este mes</option>
                    <option value="prev_month">Mes anterior</option>
                    <option value="custom">Elegir fechas…</option>
                  </select>
                </label>
                {periodChoice === "custom" && (
                  <>
                    <label className="report-filters__field">
                      <span>Desde</span>
                      <input
                        type="date"
                        value={customFrom}
                        max={today}
                        onChange={(e) => setCustomFrom(e.target.value)}
                      />
                    </label>
                    <label className="report-filters__field">
                      <span>Hasta</span>
                      <input
                        type="date"
                        value={customTo}
                        max={today}
                        onChange={(e) => setCustomTo(e.target.value)}
                      />
                    </label>
                  </>
                )}
                {scopeApplies && (
                  <label className="report-filters__field">
                    <span>Caja</span>
                    <select
                      value={scope}
                      onChange={(e) => setScope(e.target.value as ReportScope)}
                      aria-label="Alcance del reporte"
                    >
                      {SCOPES.map((s) => (
                        <option key={s} value={s}>
                          {REPORT_SCOPE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {cashierApplies && staff.length > 1 && (
                  <label className="report-filters__field">
                    <span>Empleado</span>
                    <select
                      value={cashierId ?? ""}
                      onChange={(e) => setCashierId(e.target.value ? Number(e.target.value) : null)}
                      aria-label="Empleado"
                    >
                      <option value="">Todos</option>
                      {staff.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.display_name}
                          {u.active ? "" : " (inactivo)"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
          )
        }
      />

      <PageContent className="space-y-4">
        {!bizWhatsApp && (
          <SetupHintBanner
            className="report-page-hint"
            title="WhatsApp del comercio sin configurar"
            description="Igual podés mandar el resumen eligiendo el chat. Para que vaya directo a tu número, cargalo en Apariencia / datos de impresión."
            to="/admin?section=appearance"
            linkLabel="Configurar WhatsApp"
            collapsible
            storageKey="reports-biz-whatsapp"
          />
        )}
        {showWaTurnosHint && !waTurnosOk && (
          <SetupHintBanner
            className="report-page-hint"
            title="WhatsApp de turnos no sincronizado"
            description="Conectá WhatsApp Business para confirmar turnos y avisos automáticos."
            to="/admin?section=whatsapp"
            linkLabel="Configurar turnos WSP"
            tone="sky"
            collapsible
            storageKey="reports-wa-turnos"
          />
        )}

        <div className="report-page-tabs">
          <div>
            <p className="report-tabs-label">Ventas</p>
            <div className="flex flex-wrap gap-1.5">
              {salesTabs.map((t) => (
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
          </div>
          <div>
            <p className="report-tabs-label">Finanzas</p>
            <div className="flex flex-wrap gap-1.5">
              {financeTabs.map((t) => (
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
          </div>
          <div>
            <p className="report-tabs-label">Operación</p>
            <div className="flex flex-wrap gap-1.5">
              {opsTabs.map((t) => (
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
          </div>
        </div>

      {tab === "result" && showProfit && (
        <ResultPanel
          profit={profitAll}
          expenses={expenses}
          currency={currency}
          notes={resultNotes}
          ownerWithdrawals={ownerWithdrawals}
        />
      )}

      {tab === "expenses" && <ExpensesByCategoryCard expenses={expenses} currency={currency} />}
      {tab === "debtors" && <DebtorsPanel rows={debtors} currency={currency} />}
      {tab === "stock" && <StockValuePanel rows={stockRows} currency={currency} showCost={showProfit} />}
      {tab === "suppliers" && <SupplierDebtPanel rows={supplierRows} currency={currency} />}

      {tab === "summary" && (
        <ReportsDashboard
          currency={currency}
          periodLabel={periodLabel}
          scopeLabel={REPORT_SCOPE_LABELS[scope]}
          cashierName={cashierName}
          totals={totals}
          comparison={comparison}
          profit={profit}
          showProfit={showProfit}
          inflow={inflow}
          inflowNotes={inflowNotes}
          byDay={byDay}
          collectedByDay={collectedByDay}
          byPay={byPay}
          byEmployee={byEmployee}
          byHour={byHour}
          top={top}
          onOpenResult={() => setTab("result")}
          onOpenDebtors={() => setTab("debtors")}
          onOpenPayments={() => setTab("payments")}
          onOpenProducts={() => setTab("products")}
          onOpenHours={() => setTab("hours")}
          features={{ customers: Boolean(features.customers), expenses: expensesPlan }}
        />
      )}

      {tab === "payments" && (
        <PaymentsFinancePanel
          byPay={byPay}
          inflow={inflow}
          currency={currency}
          inflowNotes={inflowNotes}
        />
      )}

      {tab === "employees" && <EmployeesOpsPanel rows={byEmployee} currency={currency} />}

      {tab === "registers" && (
        <RegistersOpsPanel rows={byRegister} currency={currency} registerLabel={registerLabel} />
      )}

      {tab === "hours_ops" && <HoursOpsPanel rows={byHour} currency={currency} />}

      {tab === "daily" && (
        <DailySalesPanel
          byDay={byDay}
          collectedByDay={collectedByDay}
          currency={currency}
          periodLabel={periodLabel}
          totals={totals}
        />
      )}

      {tab === "products" && (
        <ProductsByDayPanel rows={productByDay} currency={currency} totals={totals} />
      )}

      {tab === "categories" && <CategoriesPanel rows={byCategory} currency={currency} />}

      {tab === "hours" && <HoursSalesPanel rows={byHour} currency={currency} />}

      {tab === "tables" && showGastroReports && (
        <TablesSalesPanel rows={byTable} currency={currency} />
      )}

      {tab === "waiters" && showGastroReports && (
        <WaitersSalesPanel rows={byWaiter} currency={currency} />
      )}

      {tab === "sizes" && showApparelReports && (
        <SizesSalesPanel rows={bySize} combo={bySizeColor} currency={currency} />
      )}

      {tab === "colors" && showApparelReports && (
        <ColorsSalesPanel rows={byColor} currency={currency} />
      )}
      </PageContent>

      <DailySummaryModal
        open={dailyOpen}
        onClose={() => setDailyOpen(false)}
        businessName={businessName}
        currency={currency}
        showProfit={showProfit}
        bizWhatsApp={bizWhatsApp}
      />
    </div>
  );
}
