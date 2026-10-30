import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeftRight,
  Banknote,
  Coins,
  HandCoins,
  Landmark,
  Lock,
  PiggyBank,
  Plus,
  Scale,
  Smartphone,
  Vault,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button, EmptyState, PageContent, PageHeader } from "../components/ui";
import TreasuryMoveModal from "../components/treasury/TreasuryMoveModal";
import TreasuryAccountModal from "../components/treasury/TreasuryAccountModal";
import TreasuryStartModal from "../components/treasury/TreasuryStartModal";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { monthBounds } from "../db/expenses";
import { getSetting, setSetting } from "../db/settings";
import { roundMoney } from "../db/supplierAccounts";
import {
  ACCOUNT_KIND_LABELS,
  ensureDefaultTreasury,
  flowsNet,
  getAccountBalances,
  getMethodMap,
  getPeriodSummary,
  listTreasuryAccounts,
  listTreasuryMovements,
  MAPPABLE_METHOD_LABELS,
  MAPPABLE_METHODS,
  MOVEMENT_TYPE_LABELS,
  saveMethodMap,
  setTreasuryAccountActive,
  TREASURY_STARTED_SETTING,
  voidTreasuryMovement,
  type AccountBalance,
  type MethodMap,
  type PeriodSummary,
  type TreasuryAccount,
  type TreasuryAccountKind,
  type TreasuryMovement,
  type TreasuryMovementType,
} from "../db/treasury";
import { formatDateShort, formatMoney, formatTime, shiftYmd, todayYmd } from "../lib/format";
import { confirmAction } from "../lib/confirm";
import { showUserError, showUserSuccess } from "../lib/notice";

type Tab = "movimientos" | "cuentas";
type ListPeriod = "month" | "prev" | "quarter" | "year";

const LIST_PERIODS: { id: ListPeriod; label: string }[] = [
  { id: "month", label: "Este mes" },
  { id: "prev", label: "Mes anterior" },
  { id: "quarter", label: "Últimos 3 meses" },
  { id: "year", label: "Este año" },
];

function listRange(period: ListPeriod, today: string): { from: string; to: string } {
  const month = monthBounds(today);
  if (period === "prev") return monthBounds(shiftYmd(month.from, -1));
  if (period === "quarter") return { from: monthBounds(shiftYmd(month.from, -45)).from, to: month.to };
  if (period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: month.to };
  return month;
}

const KIND_ICONS: Record<TreasuryAccountKind, LucideIcon> = {
  cajon: Wallet,
  guardado: Vault,
  banco: Landmark,
  mercadopago: Smartphone,
  otra: Banknote,
};

const MOVE_ICONS: Record<TreasuryMovementType, LucideIcon> = {
  traslado: ArrowLeftRight,
  retiro: HandCoins,
  aporte: PiggyBank,
  ajuste: Scale,
};

function drawerHint(b: AccountBalance): string {
  if (b.drawerSource === "caja_abierta") return "Esperado (caja abierta)";
  if (b.drawerSource === "caja_cerrada") return "Contado al cerrar";
  return "Saldo inicial";
}

function movementRoute(m: TreasuryMovement): string {
  if (m.type === "traslado") return `${m.from_name ?? "?"} → ${m.to_name ?? "?"}`;
  if (m.type === "ajuste") return `${m.to_name ?? m.from_name ?? "?"} · ${m.to_account_id ? "suma" : "resta"}`;
  return m.from_name ?? m.to_name ?? "";
}

export default function Treasury() {
  const { currency } = useAppConfig();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "cuentas" ? "cuentas" : "movimientos";
  const today = todayYmd();

  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [allAccounts, setAllAccounts] = useState<TreasuryAccount[]>([]);
  const [map, setMap] = useState<MethodMap | null>(null);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [movements, setMovements] = useState<TreasuryMovement[]>([]);
  const [period, setPeriod] = useState<ListPeriod>("month");
  const [loaded, setLoaded] = useState(false);

  const [moveType, setMoveType] = useState<TreasuryMovementType | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<TreasuryAccount | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [mapDirty, setMapDirtyState] = useState(false);
  const mapDirtyRef = useRef(false);
  const setMapDirty = (v: boolean) => {
    mapDirtyRef.current = v;
    setMapDirtyState(v);
  };

  const reload = useCallback(async () => {
    await ensureDefaultTreasury();
    const range = listRange(period, today);
    const [b, all, m, s, mv] = await Promise.all([
      getAccountBalances(),
      listTreasuryAccounts(true),
      getMethodMap(),
      getPeriodSummary(range.from, range.to),
      listTreasuryMovements(range.from, range.to),
    ]);
    setBalances(b);
    setAllAccounts(all);
    if (!mapDirtyRef.current) setMap(m);
    setSummary(s);
    setMovements(mv);
    setLoaded(true);
  }, [period, today]);

  useEffect(() => {
    void reload().catch(showUserError);
  }, [reload]);

  useEffect(() => {
    if (!loaded) return;
    void getSetting(TREASURY_STARTED_SETTING).then((v) => {
      if (v !== "1") setStartOpen(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const total = useMemo(() => roundMoney(balances.reduce((a, b) => a + b.balance, 0)), [balances]);
  const drawer = balances.find((b) => b.account.kind === "cajon");
  const cashOpen = drawer?.drawerSource === "caja_abierta";
  const mapTargets = allAccounts.filter((a) => a.active && a.kind !== "cajon");

  function setTab(next: Tab) {
    setParams(next === "cuentas" ? { tab: "cuentas" } : {}, { replace: true });
  }

  async function handleVoid(m: TreasuryMovement) {
    const ok = await confirmAction({
      title: "Anular movimiento",
      message: `¿Anular ${MOVEMENT_TYPE_LABELS[m.type].toLowerCase()} de ${formatMoney(m.amount, currency)}?`,
      detail:
        m.cash_movement_id != null
          ? "Como pasó por la caja, también se saca de la caja abierta."
          : "Deja de contar en los saldos.",
      confirmLabel: "Sí, anular",
    });
    if (!ok) return;
    try {
      await voidTreasuryMovement(m.id);
      showUserSuccess("Movimiento anulado.");
      await reload();
    } catch (e) {
      showUserError(e);
    }
  }

  async function toggleAccount(a: TreasuryAccount) {
    try {
      await setTreasuryAccountActive(a.id, !a.active);
      await reload();
    } catch (e) {
      showUserError(e);
    }
  }

  async function saveMap() {
    if (!map) return;
    try {
      await saveMethodMap(map);
      setMapDirty(false);
      showUserSuccess("Guardado. Los saldos se recalcularon.");
    } catch (e) {
      showUserError(e);
    }
  }

  const flowRows = (s: PeriodSummary) => {
    const rows: { key: string; name: string; icon: LucideIcon; lines: [string, number][]; net: number }[] = [];
    if (s.drawer && drawer) {
      const d = s.drawer;
      rows.push({
        key: "cajon",
        name: drawer.account.name,
        icon: Wallet,
        lines: [
          ["Ventas en efectivo", d.cashSales],
          ["Cobros de fiado en efectivo", d.cashCustomerPayments],
          ["Otras entradas a la caja", d.cashIn],
          ["Salidas de la caja", -d.cashOut],
          ["Sobró o faltó al cerrar", d.closeDifference],
        ],
        net: roundMoney(d.cashSales + d.cashCustomerPayments + d.cashIn - d.cashOut + d.closeDifference),
      });
    }
    for (const { account, flows } of s.accounts) {
      rows.push({
        key: String(account.id),
        name: account.name,
        icon: KIND_ICONS[account.kind],
        lines: [
          ["Ventas", flows.sales],
          ["Cobros de fiado", flows.customerPayments],
          ["Gastos", -flows.expenses],
          ["Pagos a proveedores", -flows.supplierPayments],
          ["Movimientos a mano", flows.manualIn - flows.manualOut],
        ],
        net: roundMoney(flowsNet(flows)),
      });
    }
    return rows;
  };

  return (
    <div>
      <PageHeader
        title="Tesorería"
        subtitle="¿Dónde está la plata? Cajón, caja fuerte, banco y Mercado Pago"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setMoveType("ajuste")}>
              <Scale size={16} /> Ajustar saldo
            </Button>
            <Button variant="secondary" onClick={() => setMoveType("aporte")}>
              <PiggyBank size={16} /> Aporte
            </Button>
            <Button variant="secondary" onClick={() => setMoveType("retiro")}>
              <HandCoins size={16} /> Retiro del dueño
            </Button>
            <Button onClick={() => setMoveType("traslado")}>
              <ArrowLeftRight size={16} /> Mover plata
            </Button>
          </div>
        }
      />
      <PageContent>
        <div className="supplier-summary">
          <div className="supplier-summary__card treasury-total">
            <Coins size={18} aria-hidden />
            <div className="min-w-0">
              <p className="supplier-summary__label">Total estimado</p>
              <p className={`supplier-summary__value tabular-nums${total < 0 ? " is-debt" : ""}`}>
                {formatMoney(total, currency)}
              </p>
              <p className="truncate text-xs text-ink-muted">Todas las cuentas</p>
            </div>
          </div>
          {balances.map((b) => {
            const Icon = KIND_ICONS[b.account.kind];
            return (
              <div key={b.account.id} className="supplier-summary__card">
                <Icon size={18} aria-hidden />
                <div className="min-w-0">
                  <p className="supplier-summary__label truncate" title={b.account.name}>
                    {b.account.name}
                  </p>
                  <p className={`supplier-summary__value tabular-nums${b.balance < 0 ? " is-debt" : ""}`}>
                    {formatMoney(b.balance, currency)}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {b.account.kind === "cajon"
                      ? drawerHint(b)
                      : `Desde el ${formatDateShort(b.account.opening_date)}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mb-3 text-xs text-ink-muted">
          Son saldos estimados con lo que anotás en WalQo. El cajón sigue a la caja: abierta, muestra lo que debería
          haber; cerrada, lo que contaste al cerrar. Si llevás plata del cajón a otro lado, anotalo con «Mover plata»
          antes de cerrar la caja.
        </p>

        <div className="supplier-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "movimientos"}
            className={`supplier-tabs__tab${tab === "movimientos" ? " is-on" : ""}`}
            onClick={() => setTab("movimientos")}
          >
            Movimientos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "cuentas"}
            className={`supplier-tabs__tab${tab === "cuentas" ? " is-on" : ""}`}
            onClick={() => setTab("cuentas")}
          >
            Cuentas y medios de pago
          </button>
        </div>

        {tab === "movimientos" ? (
          <>
            <div className="supplier-toolbar">
              <div className="flex flex-wrap gap-2">
                {LIST_PERIODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`supplier-chip${period === p.id ? " supplier-chip--on" : ""}`}
                    onClick={() => setPeriod(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {summary && (
              <section className="mb-5">
                <h2 className="expense-pending__title">Qué entró y salió en el período</h2>
                <div className="treasury-flows">
                  {flowRows(summary).map((r) => {
                    const Icon = r.icon;
                    return (
                      <div key={r.key} className="treasury-flows__card">
                        <p className="treasury-flows__name">
                          <Icon size={15} aria-hidden />
                          <span className="truncate" title={r.name}>
                            {r.name}
                          </span>
                        </p>
                        <ul className="treasury-flows__lines">
                          {r.lines
                            .filter(([, v]) => Math.abs(v) >= 0.005)
                            .map(([label, v]) => (
                              <li key={label}>
                                <span className="truncate">{label}</span>
                                <span className={`tabular-nums${v < 0 ? " is-out" : ""}`}>
                                  {v < 0 ? "− " : "+ "}
                                  {formatMoney(Math.abs(v), currency)}
                                </span>
                              </li>
                            ))}
                          {r.lines.every(([, v]) => Math.abs(v) < 0.005) && (
                            <li className="text-ink-muted">
                              <span>Sin movimientos</span>
                            </li>
                          )}
                        </ul>
                        <p className="treasury-flows__net">
                          <span>Neto</span>
                          <strong className={`tabular-nums${r.net < 0 ? " is-out" : ""}`}>
                            {r.net < 0 ? "− " : ""}
                            {formatMoney(Math.abs(r.net), currency)}
                          </strong>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <h2 className="expense-pending__title">Movimientos anotados a mano</h2>
            {!loaded ? null : movements.length === 0 ? (
              <EmptyState
                icon={ArrowLeftRight}
                title="No hay movimientos en este período"
                description="Anotá cuando llevás plata del cajón a la caja fuerte, depositás en el banco o te llevás un retiro."
                action={
                  <Button onClick={() => setMoveType("traslado")}>
                    <ArrowLeftRight size={16} /> Mover plata
                  </Button>
                }
              />
            ) : (
              <ul className="expense-list">
                {movements.map((m) => {
                  const Icon = MOVE_ICONS[m.type];
                  const out = m.type === "retiro" || (m.type === "ajuste" && m.from_account_id != null);
                  return (
                    <li key={m.id} className="expense-list__row">
                      <span className="expense-list__icon" aria-hidden>
                        <Icon size={16} />
                      </span>
                      <div className="expense-list__main">
                        <span className="truncate font-medium text-ink" title={m.note || MOVEMENT_TYPE_LABELS[m.type]}>
                          {MOVEMENT_TYPE_LABELS[m.type]}
                          {m.note ? ` · ${m.note}` : ""}
                        </span>
                        <span className="truncate text-xs text-ink-muted">
                          {[
                            `${formatDateShort(m.moved_at)} ${formatTime(m.moved_at)}`,
                            movementRoute(m),
                            m.cash_movement_id != null ? "pasó por la caja" : null,
                            m.user_name,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <span className="expense-list__amount tabular-nums font-semibold text-ink">
                        {out ? "− " : m.type === "traslado" ? "" : "+ "}
                        {formatMoney(m.amount, currency)}
                      </span>
                      <div className="expense-list__actions">
                        <Button size="sm" variant="ghost" onClick={() => handleVoid(m)}>
                          Anular
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="expense-pending__title mb-0">Cuentas</h2>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setStartOpen(true)}>
                  Cargar saldos de hoy
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingAccount(null);
                    setAccountOpen(true);
                  }}
                >
                  <Plus size={14} /> Agregar cuenta
                </Button>
              </div>
            </div>
            <ul className="expense-list mb-5">
              {allAccounts.map((a) => {
                const Icon = KIND_ICONS[a.kind];
                return (
                  <li key={a.id} className={`expense-list__row${a.active ? "" : " is-paused"}`}>
                    <span className="expense-list__icon" aria-hidden>
                      <Icon size={16} />
                    </span>
                    <div className="expense-list__main">
                      <span className="truncate font-medium text-ink" title={a.name}>
                        {a.name}
                      </span>
                      <span className="truncate text-xs text-ink-muted">
                        {a.kind === "cajon"
                          ? "Sigue a la caja"
                          : `${ACCOUNT_KIND_LABELS[a.kind]} · empezó con ${formatMoney(a.opening_balance, currency)} el ${formatDateShort(a.opening_date)}`}
                      </span>
                    </div>
                    <div className="expense-list__amount">
                      {!a.active ? <Badge>Oculta</Badge> : a.kind === "cajon" ? <Lock size={14} aria-label="Fija" /> : null}
                    </div>
                    <div className="expense-list__actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingAccount(a);
                          setAccountOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                      {a.kind !== "cajon" && (
                        <Button size="sm" variant="ghost" onClick={() => toggleAccount(a)}>
                          {a.active ? "Ocultar" : "Mostrar"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <h2 className="expense-pending__title">¿A qué cuenta va cada medio de pago?</h2>
            <p className="mb-3 text-xs text-ink-muted">
              Vale para ventas y cobros de fiado (entra plata) y para gastos y pagos a proveedores (sale plata). El
              efectivo va siempre al cajón y el fiado no entra hasta que se cobra.
            </p>
            {map && (
              <div className="treasury-map">
                {MAPPABLE_METHODS.map((m) => (
                  <label key={m} className="treasury-map__row">
                    <span className="truncate">{MAPPABLE_METHOD_LABELS[m]}</span>
                    <select
                      value={map[m] ?? ""}
                      onChange={(e) => {
                        setMap({ ...map, [m]: e.target.value ? Number(e.target.value) : null });
                        setMapDirty(true);
                      }}
                    >
                      <option value="">No sumar en ninguna</option>
                      {mapTargets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <Button onClick={() => saveMap().then(() => reload()).catch(showUserError)} disabled={!mapDirty}>
                Guardar medios de pago
              </Button>
            </div>
          </>
        )}
      </PageContent>

      {moveType && (
        <TreasuryMoveModal
          open
          type={moveType}
          balances={balances}
          cashOpen={cashOpen}
          userId={user?.id ?? null}
          onClose={() => setMoveType(null)}
          onSaved={() => void reload().catch(showUserError)}
        />
      )}
      <TreasuryAccountModal
        open={accountOpen}
        editing={editingAccount}
        onClose={() => setAccountOpen(false)}
        onSaved={() => void reload().catch(showUserError)}
      />
      <TreasuryStartModal
        open={startOpen}
        balances={balances}
        cashUsed={cashOpen}
        onClose={() => {
          setStartOpen(false);
          void setSetting(TREASURY_STARTED_SETTING, "1").catch(() => undefined);
        }}
        onSaved={() => void reload().catch(showUserError)}
      />
    </div>
  );
}
