import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Clock, LayoutGrid, Lock, QrCode, ReceiptText, Settings2, Smartphone, Users } from "lucide-react";
import { Button, EmptyState, Input, Modal, PageContent, PageHeader, Select } from "../components/ui";
import TableOrderModal from "../components/tables/TableOrderModal";
import { useSubmitLock } from "../hooks/useSubmitLock";
import TablesConfigModal from "../components/tables/TablesConfigModal";
import TablesTrialNotice from "../components/tables/TablesTrialNotice";
import WaiterPhonesModal from "../components/tables/WaiterPhonesModal";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";
import {
  listDiningTables,
  listOpenTableCalls,
  listOpenTableOrders,
  openTableOrder,
  saveDiningTables,
  tableLabel,
  type DiningTable,
  type OpenTableOrder,
  type TableCall,
} from "../db/tables";
import { listStaffUsers, type StaffUser } from "../db/users";
import { FREE_MAX_TABLES } from "../config/pricing";
import { getMenuPortalStatus } from "../lib/menuPortalPush";
import { refreshTableAlerts, syncTablesToPortal, tableQrUrl, usableTableIds } from "../lib/tables";
import { printTableQrSheet } from "../lib/prints/tablePrints";
import { formatMoney } from "../lib/format";
import { showFlash, showUserError } from "../lib/notice";
import { confirmAction } from "../lib/confirm";
import { openSalesWhatsApp } from "../lib/supportContact";

function minutesSince(localTs: string, now: number): number {
  const t = new Date(localTs.replace(" ", "T")).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60_000)) : 0;
}

function elapsedLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

type CardState = "free" | "busy" | "bill" | "locked";

const CARD_TONE: Record<CardState, string> = {
  free: "border-emerald-500/35 bg-emerald-500/[0.06] hover:border-emerald-500/60",
  busy: "border-brand-500/45 bg-brand-500/[0.08] hover:border-brand-500/70",
  bill: "border-amber-500/60 bg-amber-500/[0.12] hover:border-amber-500/80",
  locked: "border-[var(--color-panel-border)] bg-[var(--color-input-bg)] opacity-60",
};

const STATE_LABEL: Record<CardState, string> = {
  free: "Libre",
  busy: "Ocupada",
  bill: "Pidió la cuenta",
  locked: "Con WalQo Completo",
};

/** Pública el salón en la tienda web solo si está prendida. */
async function syncPortalQuietly(tables: DiningTable[], unlimited: boolean): Promise<void> {
  const status = await getMenuPortalStatus().catch(() => null);
  if (!status?.enabled) return;
  const usable = usableTableIds(tables, unlimited);
  await syncTablesToPortal(tables.filter((t) => usable.has(t.id))).catch(() => undefined);
}

export default function Tables() {
  const { currency, businessName } = useAppConfig();
  const { user, can } = useAuth();
  const { tables: unlimited, waiterPhones } = usePlanEntitlements();
  const canManage = can("manage_products");
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [orders, setOrders] = useState<OpenTableOrder[]>([]);
  const [calls, setCalls] = useState<TableCall[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [zone, setZone] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [configOpen, setConfigOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [opening, setOpening] = useState<DiningTable | null>(null);
  const [openGuests, setOpenGuests] = useState("");
  const [openWaiter, setOpenWaiter] = useState<number | "">("");
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [qrBusy, setQrBusy] = useState(false);
  const [waitersOpen, setWaitersOpen] = useState(false);
  const openLock = useSubmitLock();

  const reload = useCallback(async () => {
    try {
      const [t, o, c] = await Promise.all([listDiningTables(), listOpenTableOrders(), listOpenTableCalls()]);
      setTables(t);
      setOrders(o);
      setCalls(c);
      void refreshTableAlerts();
    } catch (e) {
      showUserError(e, "No se pudieron cargar las mesas");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    const tick = window.setInterval(() => {
      setNow(Date.now());
      void reload();
    }, 20_000);
    const onChange = () => void reload();
    window.addEventListener("walqo:tables-changed", onChange);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("walqo:tables-changed", onChange);
    };
  }, [reload]);

  useEffect(() => {
    void listStaffUsers()
      .then((rows) => setStaff(rows.filter((u) => u.active && !u.is_cadete)))
      .catch(() => setStaff([]));
  }, []);

  const usable = useMemo(() => usableTableIds(tables, unlimited), [tables, unlimited]);
  const orderByTable = useMemo(() => new Map(orders.map((o) => [o.table_id, o])), [orders]);
  const callsByTable = useMemo(() => {
    const map = new Map<number, TableCall[]>();
    for (const c of calls) map.set(c.table_id, [...(map.get(c.table_id) ?? []), c]);
    return map;
  }, [calls]);
  const zones = useMemo(
    () => [...new Set(tables.map((t) => t.zone?.trim()).filter((z): z is string => Boolean(z)))],
    [tables],
  );
  const shown = zone ? tables.filter((t) => (t.zone?.trim() ?? "") === zone) : tables;

  function stateOf(t: DiningTable): CardState {
    if (!usable.has(t.id)) return "locked";
    const o = orderByTable.get(t.id);
    if (!o) return "free";
    return o.bill_requested_at || callsByTable.get(t.id)?.some((c) => c.kind === "bill") ? "bill" : "busy";
  }

  const counts = useMemo(() => {
    let free = 0;
    let busy = 0;
    let bill = 0;
    for (const t of tables) {
      const s = stateOf(t);
      if (s === "free") free++;
      else if (s === "busy") busy++;
      else if (s === "bill") bill++;
    }
    return { free, busy, bill };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depende de los mapas ya memorizados
  }, [tables, orderByTable, callsByTable, usable]);

  function onCardClick(t: DiningTable) {
    const s = stateOf(t);
    if (s === "locked") {
      void openSalesWhatsApp("Hola! Quiero pasar a WalQo Completo para usar todas las mesas del salón.");
      return;
    }
    if (s === "free") {
      setOpenGuests("");
      setOpenWaiter(user && staff.some((u) => u.id === user.id) ? user.id : "");
      setOpening(t);
      return;
    }
    setSelectedId(t.id);
  }

  async function confirmOpen() {
    if (!opening) return;
    try {
      await openTableOrder(opening.id, {
        guests: Math.max(0, Math.round(Number(openGuests) || 0)) || null,
        waiterUserId: openWaiter === "" ? null : openWaiter,
        userId: user?.id ?? null,
      });
      const id = opening.id;
      setOpening(null);
      await reload();
      setSelectedId(id);
    } catch (e) {
      showUserError(e, "No se pudo abrir la mesa");
    }
  }

  async function quickCreate() {
    const n = unlimited ? 10 : FREE_MAX_TABLES;
    try {
      await saveDiningTables(Array.from({ length: n }, (_, i) => ({ number: i + 1, name: "", zone: "" })));
      await reload();
      showFlash({ message: `Listo: ${n} mesas. Cambiales el nombre o la zona en «Configurar mesas».` });
      void syncPortalQuietly(await listDiningTables(), unlimited);
    } catch (e) {
      showUserError(e);
    }
  }

  async function printQr() {
    setQrBusy(true);
    try {
      const status = await getMenuPortalStatus();
      if (!status.enabled) {
        showUserError(
          "Los QR abren tu tienda web. Prendela en Configuración → Tienda web y volvé a tocar «Imprimir QR».",
          "Falta la tienda web",
        );
        return;
      }
      const list = tables.filter((t) => usable.has(t.id));
      if (list.length === 0) {
        showUserError("Primero cargá las mesas en «Configurar mesas».", "Sin mesas");
        return;
      }
      const { links, slug } = await syncTablesToPortal(list);
      const tokenBy = new Map(links.map((l) => [l.number, l.token]));
      const s = slug || status.slug;
      await printTableQrSheet({
        businessName,
        tables: list.flatMap((t) => {
          const token = tokenBy.get(t.number);
          return token ? [{ label: tableLabel(t), url: tableQrUrl(s, t.number, token) }] : [];
        }),
      });
    } catch (e) {
      showUserError(e, "No se pudieron armar los QR");
    } finally {
      setQrBusy(false);
    }
  }

  async function renewQr() {
    const ok = await confirmAction({
      title: "Renovar QR",
      message: "¿Cambiar los QR de todas las mesas?",
      detail: "Los QR impresos dejan de andar y tenés que imprimir los nuevos. Sirve si alguien sacó foto a un QR y pide desde afuera.",
      confirmLabel: "Sí, renovar",
    });
    if (!ok) return;
    try {
      const status = await getMenuPortalStatus();
      if (!status.enabled) {
        showUserError("Los QR abren tu tienda web. Prendela en Configuración → Tienda web.", "Falta la tienda web");
        return;
      }
      await syncTablesToPortal(
        tables.filter((t) => usable.has(t.id)),
        true,
      );
      showFlash({ message: "QR renovados. Imprimí los nuevos con «Imprimir QR»." });
    } catch (e) {
      showUserError(e, "No se pudieron renovar los QR");
    }
  }

  const selected = selectedId != null ? (tables.find((t) => t.id === selectedId) ?? null) : null;
  const selectedOrder = selected ? (orderByTable.get(selected.id) ?? null) : null;
  const freeTables = tables.filter((t) => usable.has(t.id) && !orderByTable.has(t.id));

  return (
    <div className="min-w-0 overflow-x-hidden">
      <PageHeader
        title="Mesas"
        subtitle="Abrí la mesa, cargá lo que piden y mandalo a cocina por rondas. Al cobrar, pasa a la caja."
        actions={
          canManage ? (
            <>
              <Button variant="secondary" onClick={() => setWaitersOpen(true)} disabled={tables.length === 0}>
                <Smartphone size={16} /> Mozos desde el celular
              </Button>
              <Button variant="secondary" onClick={() => printQr()} loading={qrBusy} disabled={tables.length === 0}>
                <QrCode size={16} /> Imprimir QR
              </Button>
              <Button variant="secondary" onClick={() => setConfigOpen(true)}>
                <Settings2 size={16} /> Configurar mesas
              </Button>
            </>
          ) : undefined
        }
      />
      <PageContent wide>
        {!unlimited ? <TablesTrialNotice className="mb-4" /> : null}
        {loaded && tables.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="Todavía no cargaste las mesas"
            description="Creá las mesas del salón. Después les ponés nombre o zona (Salón, Vereda) e imprimís un QR para cada una."
            action={
              canManage ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => quickCreate()}>
                    Crear {unlimited ? 10 : FREE_MAX_TABLES} mesas
                  </Button>
                  <Button variant="secondary" onClick={() => setConfigOpen(true)}>
                    Configurar a mano
                  </Button>
                </div>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 text-sm text-ink-muted">
                <strong className="text-emerald-700 dark:text-emerald-300">{counts.free}</strong> libres ·{" "}
                <strong className="text-brand-700 dark:text-brand-300">{counts.busy}</strong> ocupadas ·{" "}
                <strong className="text-amber-700 dark:text-amber-300">{counts.bill}</strong> piden la cuenta
              </p>
              {zones.length > 1 ? (
                <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
                  {["", ...zones].map((z) => (
                    <button
                      key={z || "all"}
                      type="button"
                      onClick={() => setZone(z)}
                      className={`max-w-full truncate rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        zone === z
                          ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500"
                          : "bg-[var(--color-input-bg)] text-ink ring-1 ring-[var(--color-panel-border)] hover:bg-brand-50 dark:hover:bg-brand-950/40"
                      }`}
                    >
                      {z || "Todas"}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,10.5rem),1fr))] gap-3">
              {shown.map((t) => {
                const s = stateOf(t);
                const o = orderByTable.get(t.id);
                const tableCalls = callsByTable.get(t.id) ?? [];
                const calling = tableCalls.some((c) => c.kind === "waiter");
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-table={t.number}
                    onClick={() => onCardClick(t)}
                    className={`relative flex min-h-[8.5rem] min-w-0 flex-col rounded-2xl border-2 p-3 text-left transition-colors ${CARD_TONE[s]}`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-display text-lg font-bold text-ink">{tableLabel(t)}</span>
                      {s === "locked" ? <Lock size={15} className="mt-1 shrink-0 text-ink-muted" /> : null}
                      {calling || (o && o.pending_items > 0) ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                          <BellRing size={11} /> {calling ? "Mozo" : "QR"}
                        </span>
                      ) : null}
                    </div>
                    {t.zone ? <span className="truncate text-xs text-ink-muted">{t.zone}</span> : null}
                    <span
                      className={`mt-1 text-xs font-semibold ${
                        s === "free"
                          ? "text-emerald-700 dark:text-emerald-300"
                          : s === "bill"
                            ? "text-amber-700 dark:text-amber-300"
                            : s === "busy"
                              ? "text-brand-700 dark:text-brand-300"
                              : "text-ink-muted"
                      }`}
                    >
                      {s === "bill" ? (
                        <span className="inline-flex items-center gap-1">
                          <ReceiptText size={12} /> {STATE_LABEL[s]}
                        </span>
                      ) : (
                        STATE_LABEL[s]
                      )}
                    </span>
                    {o ? (
                      <div className="mt-auto min-w-0 space-y-0.5 pt-2">
                        <p className="font-display text-xl font-bold tabular-nums text-ink">
                          {formatMoney(o.total, currency)}
                        </p>
                        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={11} /> {elapsedLabel(minutesSince(o.opened_at, now))}
                          </span>
                          {o.guests ? (
                            <span className="inline-flex items-center gap-1">
                              <Users size={11} /> {o.guests}
                            </span>
                          ) : null}
                          {o.waiter_name ? <span className="min-w-0 truncate">{o.waiter_name}</span> : null}
                        </p>
                        {o.new_items > 0 ? (
                          <p className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                            {o.new_items} sin mandar a cocina
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </PageContent>

      <Modal
        open={opening !== null}
        title={opening ? `Abrir ${tableLabel(opening)}` : ""}
        onClose={() => setOpening(null)}
      >
        <div className="space-y-3">
          <Input
            label="Comensales"
            type="number"
            min={0}
            value={openGuests}
            onChange={(e) => setOpenGuests(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void openLock.run(confirmOpen);
            }}
            autoFocus
          />
          <Select
            label="Mozo (opcional)"
            value={openWaiter}
            onChange={(e) => setOpenWaiter(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Sin asignar</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </Select>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpening(null)}>
              Cancelar
            </Button>
            <Button onClick={() => openLock.run(confirmOpen)} loading={openLock.busy}>
              Abrir mesa
            </Button>
          </div>
        </div>
      </Modal>

      <TableOrderModal
        table={selected}
        order={selectedOrder}
        calls={calls}
        freeTables={freeTables}
        onClose={() => setSelectedId(null)}
        onChanged={() => void reload()}
      />

      <WaiterPhonesModal
        open={waitersOpen}
        onClose={() => setWaitersOpen(false)}
        unlimited={waiterPhones}
        staff={staff}
        businessName={businessName || "el local"}
      />

      <TablesConfigModal
        open={configOpen}
        tables={tables}
        unlimited={unlimited}
        onClose={() => setConfigOpen(false)}
        onRenewQr={() => void renewQr()}
        onSaved={() => {
          void (async () => {
            await reload();
            showFlash({ message: "Mesas guardadas" });
            void syncPortalQuietly(await listDiningTables(), unlimited);
          })();
        }}
      />
    </div>
  );
}
