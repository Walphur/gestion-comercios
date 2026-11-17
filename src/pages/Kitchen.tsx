import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Settings2, UtensilsCrossed } from "lucide-react";
import { Button, EmptyState, PageContent, PageHeader } from "../components/ui";
import KitchenStationsModal from "../components/tables/KitchenStationsModal";
import {
  kitchenTicketStats,
  listKitchenStations,
  listKitchenTickets,
  setKitchenItemStatus,
  setKitchenTicketStatus,
  type KitchenStation,
  type KitchenStatus,
  type KitchenTicket,
  type KitchenTicketStats,
} from "../db/kitchen";
import { showUserError } from "../lib/notice";
import { useAuth } from "../context/AuthContext";

const POLL_MS = 4_000;

const COLUMNS: { status: KitchenStatus; label: string; tone: string }[] = [
  { status: "pending", label: "Pendiente", tone: "border-amber-500/50 bg-amber-500/[0.07]" },
  { status: "preparing", label: "Preparando", tone: "border-brand-500/45 bg-brand-500/[0.08]" },
  { status: "ready", label: "Listo", tone: "border-emerald-500/50 bg-emerald-500/[0.09]" },
];

function tableTitle(t: KitchenTicket): string {
  const name = t.table_name?.trim();
  return name || `Mesa ${t.table_number}`;
}

function parseMods(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { name?: string }[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((m) => m.name?.trim()).filter((n): n is string => Boolean(n));
  } catch {
    return [];
  }
}

function ageLabel(createdAt: string, now: number): string {
  const t = new Date(createdAt.replace(" ", "T")).getTime();
  if (!Number.isFinite(t)) return "";
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 1) return "<1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function ageTone(createdAt: string, now: number): string {
  const t = new Date(createdAt.replace(" ", "T")).getTime();
  if (!Number.isFinite(t)) return "text-ink-muted";
  const min = (now - t) / 60_000;
  if (min >= 20) return "text-danger font-semibold";
  if (min >= 10) return "text-amber-600 dark:text-amber-400 font-semibold";
  return "text-ink-muted";
}

function nextAction(status: KitchenStatus): { status: KitchenStatus; label: string } | null {
  if (status === "pending") return { status: "preparing", label: "Empezar" };
  if (status === "preparing") return { status: "ready", label: "Listo" };
  if (status === "ready") return { status: "delivered", label: "Entregado" };
  return null;
}

export default function Kitchen() {
  const { can } = useAuth();
  const canManage = can("manage_products");
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [stationId, setStationId] = useState<number | "all">("all");
  const [view, setView] = useState<"active" | "today">("active");
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [stats, setStats] = useState<KitchenTicketStats | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [stationsOpen, setStationsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [st, list, stStats] = await Promise.all([
        listKitchenStations(),
        listKitchenTickets({
          stationId: stationId === "all" ? null : stationId,
          history: view === "today",
          statuses:
            view === "today"
              ? ["pending", "preparing", "ready", "delivered", "voided"]
              : ["pending", "preparing", "ready"],
        }),
        kitchenTicketStats(),
      ]);
      setStations(st);
      setTickets(list);
      setStats(stStats);
      setLoaded(true);
    } catch (e) {
      showUserError(e);
    }
  }, [stationId, view]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onChange = () => void reload();
    window.addEventListener("walqo-kitchen-changed", onChange);
    const poll = window.setInterval(() => void reload(), POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      window.removeEventListener("walqo-kitchen-changed", onChange);
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [reload]);

  const byColumn = useMemo(() => {
    const map: Record<string, KitchenTicket[]> = {
      pending: [],
      preparing: [],
      ready: [],
      delivered: [],
      voided: [],
    };
    for (const t of tickets) {
      (map[t.status] ??= []).push(t);
    }
    return map;
  }, [tickets]);

  async function advanceTicket(ticket: KitchenTicket) {
    const next = nextAction(ticket.status);
    if (!next) return;
    try {
      await setKitchenTicketStatus(ticket.id, next.status);
      await reload();
    } catch (e) {
      showUserError(e);
    }
  }

  async function advanceItem(itemId: number, status: KitchenStatus) {
    const next = nextAction(status);
    if (!next) return;
    try {
      await setKitchenItemStatus(itemId, next.status);
      await reload();
    } catch (e) {
      showUserError(e);
    }
  }

  const stationTabs = [
    { id: "all" as const, label: "Todas" },
    ...stations.map((s) => ({ id: s.id as number | "all", label: s.name })),
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <PageHeader
        title="Cocina"
        subtitle="Pedidos de mesa por estación. Al marcar Listo, el salón y el mozo reciben el aviso."
        actions={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {canManage ? (
              <Button variant="secondary" size="sm" onClick={() => setStationsOpen(true)}>
                <Settings2 size={14} /> Estaciones
              </Button>
            ) : null}
            <div className="inline-flex rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-1">
              <button
                type="button"
                onClick={() => setView("active")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                  view === "active" ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted hover:text-ink"
                }`}
              >
                Activos
              </button>
              <button
                type="button"
                onClick={() => setView("today")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                  view === "today" ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted hover:text-ink"
                }`}
              >
                Hoy
              </button>
            </div>
          </div>
        }
      />
      <PageContent wide className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 pb-4">
        {stats ? (
          <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span>
              <strong className="text-ink">{stats.pending}</strong> pendientes
            </span>
            <span>
              <strong className="text-ink">{stats.preparing}</strong> en prep.
            </span>
            <span>
              <strong className="text-ink">{stats.ready}</strong> listos
            </span>
            {stats.avg_prep_seconds != null ? (
              <span>
                Promedio prep.{" "}
                <strong className="text-ink">{Math.round(stats.avg_prep_seconds / 60)} min</strong>
              </span>
            ) : null}
          </div>
        ) : null}

        {stations.length > 1 || stationId !== "all" ? (
          <div className="flex min-w-0 gap-1 overflow-x-auto pb-0.5">
            {stationTabs.map((tab) => (
              <button
                key={String(tab.id)}
                type="button"
                onClick={() => setStationId(tab.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                  stationId === tab.id
                    ? "bg-brand-600 text-white"
                    : "bg-[var(--color-input-bg)] text-ink-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        {!loaded ? (
          <p className="text-ink-muted">Cargando cocina…</p>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title={view === "today" ? "Sin tickets hoy" : "Nada en cocina"}
            description="Cuando mandes una ronda desde Mesas, acá aparecen los platos por estación."
          />
        ) : (
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3 md:items-start">
            {COLUMNS.map((col) => {
              const list = byColumn[col.status] ?? [];
              return (
                <section
                  key={col.status}
                  className={`min-w-0 rounded-xl border p-2.5 ${col.tone}`}
                >
                  <header className="mb-2 flex items-center justify-between gap-2 px-0.5">
                    <h2 className="font-display text-sm font-semibold text-ink">{col.label}</h2>
                    <span className="rounded-md bg-surface/80 px-1.5 py-0.5 text-xs font-semibold text-ink-muted">
                      {list.length}
                    </span>
                  </header>
                  <ul className="flex min-w-0 flex-col gap-2">
                    {list.map((ticket) => {
                      const action = nextAction(ticket.status);
                      const liveItems = ticket.items.filter((i) => i.status !== "voided");
                      return (
                        <li
                          key={ticket.id}
                          className="min-w-0 rounded-lg border border-[var(--color-panel-border)] bg-surface p-3 shadow-[var(--shadow-sm)]"
                        >
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-display text-base font-semibold text-ink">
                                {tableTitle(ticket)}
                              </p>
                              <p className="truncate text-xs text-ink-muted">
                                Ronda {ticket.round}
                                {ticket.station_name ? ` · ${ticket.station_name}` : ""}
                                {ticket.waiter_label ? ` · ${ticket.waiter_label}` : ""}
                              </p>
                            </div>
                            <span
                              className={`inline-flex shrink-0 items-center gap-1 text-xs ${ageTone(ticket.created_at, now)}`}
                            >
                              <Clock3 size={12} aria-hidden />
                              {ageLabel(ticket.created_at, now)}
                            </span>
                          </div>

                          <ul className="mt-2 space-y-1.5 border-t border-[var(--color-panel-border)] pt-2">
                            {liveItems.map((item) => {
                              const mods = parseMods(item.modifiers_json);
                              const itemAction = nextAction(item.status);
                              return (
                                <li key={item.id} className="min-w-0">
                                  <div className="flex min-w-0 items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-ink">
                                        <span className="tabular-nums text-ink-muted">
                                          {Number.isInteger(item.qty) ? item.qty : item.qty.toLocaleString("es-AR")}
                                          ×
                                        </span>{" "}
                                        {item.label}
                                      </p>
                                      {(item.cook || mods.length > 0 || item.note) && (
                                        <p className="truncate text-xs text-ink-muted">
                                          {[item.cook, ...mods, item.note].filter(Boolean).join(" · ")}
                                        </p>
                                      )}
                                    </div>
                                    {itemAction && item.status !== ticket.status ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="shrink-0 !px-2 !py-0.5 text-xs"
                                        onClick={() => advanceItem(item.id, item.status)}
                                      >
                                        {itemAction.label}
                                      </Button>
                                    ) : null}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>

                          {action ? (
                            <div className="mt-3">
                              <Button
                                className="w-full"
                                variant={ticket.status === "ready" ? "secondary" : "primary"}
                                onClick={() => advanceTicket(ticket)}
                              >
                                {action.label}
                                {ticket.status === "pending" ? " todo" : ticket.status === "preparing" ? " todo" : ""}
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                    {list.length === 0 ? (
                      <li className="px-1 py-6 text-center text-xs text-ink-muted">Vacío</li>
                    ) : null}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {view === "today" && (byColumn.delivered?.length || byColumn.voided?.length) ? (
          <section className="min-w-0 space-y-2">
            <h2 className="font-display text-sm font-semibold text-ink-muted">Cerrados hoy</h2>
            <ul className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[...(byColumn.delivered ?? []), ...(byColumn.voided ?? [])].map((ticket) => (
                <li
                  key={ticket.id}
                  className="min-w-0 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)]/50 p-3 opacity-80"
                >
                  <p className="truncate text-sm font-semibold text-ink">
                    {tableTitle(ticket)} · Ronda {ticket.round}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {ticket.status === "voided" ? "Anulado" : "Entregado"}
                    {ticket.station_name ? ` · ${ticket.station_name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PageContent>

      <KitchenStationsModal
        open={stationsOpen}
        onClose={() => setStationsOpen(false)}
        onSaved={() => void reload()}
      />
    </div>
  );
}
