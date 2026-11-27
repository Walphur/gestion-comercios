import { useCallback, useEffect, useMemo, useState } from "react";
import { HandCoins } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  DataTableShell,
  EmptyState,
  Input,
  PageContent,
  PageHeader,
  Switch,
} from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";
import { listStaffUsers, type StaffUser } from "../db/users";
import {
  getWaiterCommissionPct,
  isWaiterCommissionsEnabled,
  listWaiterCommissionEntries,
  markWaiterCommissionsPaid,
  setWaiterCommissionPct,
  setWaiterCommissionsEnabled,
  summarizeWaiterCommissions,
  type WaiterCommissionEntry,
} from "../db/waiterCommissions";
import { parseCommissionPctInput } from "../lib/waiterCommissionMath";
import { confirmAction } from "../lib/confirm";
import { formatMoney, todayYmd } from "../lib/format";
import { showFlash, showUserError } from "../lib/notice";
import { logAuditAction } from "../lib/tauri";

type Period = "today" | "week" | "month" | "custom";

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function periodRange(period: Period): { from: string; to: string } {
  const now = new Date();
  if (period === "week") {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { from: ymd(monday), to: ymd(now) };
  }
  if (period === "month") {
    return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
  }
  const today = todayYmd();
  return { from: today, to: today };
}

const DATE_INPUT =
  "min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-ink";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  paid: "Liquidada",
  reversed: "Revertida",
};

export default function WaiterCommissions() {
  const { currency } = useAppConfig();
  const { user, can } = useAuth();
  const { waiterCommissions: entitled } = usePlanEntitlements();
  const isAdmin = can("manage_admin");
  const canLiquidate = can("void_sale") || isAdmin;

  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState(() => periodRange("month"));
  const [waiterFilter, setWaiterFilter] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<"" | "pending" | "paid" | "reversed">("");
  const [rows, setRows] = useState<WaiterCommissionEntry[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [pct, setPct] = useState("0");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [savingCfg, setSavingCfg] = useState(false);

  const range = period === "custom" ? custom : periodRange(period);
  const summary = useMemo(() => summarizeWaiterCommissions(rows), [rows]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, on, p, users] = await Promise.all([
        listWaiterCommissionEntries({
          from: range.from,
          to: range.to,
          waiterUserId: waiterFilter === "" ? null : waiterFilter,
          status: statusFilter,
        }),
        isWaiterCommissionsEnabled(),
        getWaiterCommissionPct(),
        listStaffUsers(),
      ]);
      setRows(list);
      setEnabled(on);
      setPct(String(p));
      setStaff(users);
      setSelected(new Set());
    } catch (e) {
      showUserError(e);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, waiterFilter, statusFilter]);

  useEffect(() => {
    if (range.from > range.to) return;
    void reload();
  }, [reload, range.from, range.to]);

  async function saveConfig() {
    const n = parseCommissionPctInput(pct);
    if (n == null) {
      showFlash({ message: "El porcentaje debe estar entre 0 y 100.", variant: "error" });
      return;
    }
    setSavingCfg(true);
    try {
      await setWaiterCommissionsEnabled(enabled);
      await setWaiterCommissionPct(n);
      showFlash({ message: "Configuración de comisiones de mozos guardada." });
      if (user) {
        void logAuditAction(
          user.id,
          "waiter_commission_config",
          "settings",
          undefined,
          `enabled=${enabled ? 1 : 0};pct=${n}`,
        );
      }
      await reload();
    } catch (e) {
      showUserError(e);
    } finally {
      setSavingCfg(false);
    }
  }

  async function liquidateSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const ok = await confirmAction({
      title: "Liquidar comisiones",
      message: `¿Marcar ${ids.length} comisión${ids.length === 1 ? "" : "es"} como pagada${ids.length === 1 ? "" : "s"}?`,
      detail: "Queda anotado quién liquidó y cuándo. No se puede deshacer desde acá.",
      confirmLabel: "Sí, liquidar",
    });
    if (!ok || !user) return;
    try {
      const n = await markWaiterCommissionsPaid(ids, { id: user.id, isAdmin });
      showFlash({ message: n ? `Liquidaste ${n} comisión${n === 1 ? "" : "es"}.` : "Nada para liquidar." });
      void logAuditAction(user.id, "waiter_commission_paid", "waiter_commission", undefined, `ids=${ids.join(",")}`);
      await reload();
    } catch (e) {
      showUserError(e);
    }
  }

  function toggleRow(id: number, status: string) {
    if (status !== "pending") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!entitled) {
    return (
      <div className="min-w-0">
        <PageHeader title="Comisiones de mozos" />
        <PageContent>
          <Alert variant="warning">
            Las comisiones de mozos vienen con WalQo Completo. No están incluidas en Gratis ni Permanente.
          </Alert>
        </PageContent>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Comisiones de mozos"
        subtitle="% sobre lo cobrado en mesas (sin propina). Distinto de las comisiones de profesionales."
      />
      <PageContent className="min-w-0 space-y-4">
        {isAdmin ? (
          <Card className="space-y-3 p-4">
            <h2 className="font-display text-sm font-semibold text-ink">Configuración</h2>
            <label className="flex min-w-0 items-center gap-3 text-sm text-ink">
              <Switch checked={enabled} onChange={setEnabled} />
              <span>Calcular comisiones al cobrar mesas</span>
            </label>
            <div className="flex max-w-xs flex-col gap-1">
              <Input
                label="Porcentaje global (0–100)"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={pct}
                onChange={(e) => setPct(e.target.value)}
              />
              <p className="text-xs text-ink-muted">
                Base: mercadería neta de descuentos. La propina solo se muestra como dato.
              </p>
            </div>
            <Button onClick={() => void saveConfig()} loading={savingCfg}>
              Guardar configuración
            </Button>
          </Card>
        ) : null}

        {!enabled ? (
          <Alert variant="info">
            Las comisiones están desactivadas. El administrador puede prenderlas arriba (o pedirle que lo haga).
          </Alert>
        ) : null}

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="Comisión generada" value={formatMoney(summary.generated, currency)} />
          <SummaryTile label="Pendiente" value={formatMoney(summary.pending, currency)} />
          <SummaryTile label="Liquidado" value={formatMoney(summary.paid, currency)} />
          <SummaryTile
            label="Propinas (informativo)"
            value={formatMoney(summary.tipsInformative, currency)}
          />
        </div>

        <div className="flex min-w-0 flex-wrap items-end gap-2">
          {(
            [
              ["today", "Hoy"],
              ["week", "Semana"],
              ["month", "Mes"],
              ["custom", "Fechas"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={period === id ? "primary" : "secondary"}
              onClick={() => setPeriod(id)}
            >
              {label}
            </Button>
          ))}
          {period === "custom" ? (
            <>
              <input
                type="date"
                className={DATE_INPUT}
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              />
              <input
                type="date"
                className={DATE_INPUT}
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              />
            </>
          ) : null}
          <select
            className={DATE_INPUT}
            value={waiterFilter === "" ? "" : String(waiterFilter)}
            onChange={(e) => setWaiterFilter(e.target.value ? Number(e.target.value) : "")}
            aria-label="Filtrar mozo"
          >
            <option value="">Todos los mozos</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
          <select
            className={DATE_INPUT}
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "" | "pending" | "paid" | "reversed")
            }
            aria-label="Filtrar estado"
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="paid">Liquidada</option>
            <option value="reversed">Revertida</option>
          </select>
          {canLiquidate && selected.size > 0 ? (
            <Button onClick={() => void liquidateSelected()}>
              Liquidar seleccionadas ({selected.size})
            </Button>
          ) : null}
        </div>

        {loading ? (
          <p className="text-sm text-ink-muted">Cargando…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="Sin comisiones en este período"
            description="Se generan al cobrar una mesa con la función activada."
          />
        ) : (
          <DataTableShell>
            <table className="w-full min-w-0 text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-panel-border)] text-xs text-ink-muted">
                  {canLiquidate ? <th className="p-2 w-8" /> : null}
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Mesa</th>
                  <th className="p-2">Mozo</th>
                  <th className="p-2 text-right">Base</th>
                  <th className="p-2 text-right">Propina*</th>
                  <th className="p-2 text-right">%</th>
                  <th className="p-2 text-right">Comisión</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">Liquidación</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-panel-border)]/60">
                    {canLiquidate ? (
                      <td className="p-2">
                        {r.status === "pending" ? (
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleRow(r.id, r.status)}
                            aria-label={`Seleccionar comisión ${r.id}`}
                          />
                        ) : null}
                      </td>
                    ) : null}
                    <td className="p-2 tabular-nums text-ink-muted">
                      {(r.sale_created_at ?? r.created_at)?.slice(0, 16)}
                    </td>
                    <td className="p-2">{r.table_number != null ? `Mesa ${r.table_number}` : "—"}</td>
                    <td className="p-2 min-w-0 truncate">
                      {r.waiter_label?.trim() || (r.waiter_user_id ? `Usuario #${r.waiter_user_id}` : "Sin mozo")}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoney(r.merchandise_base, currency)}
                    </td>
                    <td className="p-2 text-right tabular-nums text-ink-muted">
                      {formatMoney(r.tip_amount, currency)}
                    </td>
                    <td className="p-2 text-right tabular-nums">{r.commission_pct}%</td>
                    <td className="p-2 text-right tabular-nums font-semibold">
                      {formatMoney(r.commission_amount, currency)}
                    </td>
                    <td className="p-2">{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td className="p-2 text-xs text-ink-muted">
                      {r.status === "paid" && r.paid_at
                        ? `${r.paid_at.slice(0, 16)}${r.paid_by_name ? ` · ${r.paid_by_name}` : ""}`
                        : r.note?.includes("Ajuste") || r.note?.includes("Reversión")
                          ? r.note
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-muted">
              * Propina informativa: no entra en el porcentaje ni en la liquidación de comisión.
            </p>
          </DataTableShell>
        )}
      </PageContent>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="min-w-0 p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums text-ink">{value}</p>
    </Card>
  );
}
