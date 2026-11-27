import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Settings2, UtensilsCrossed, Volume2, VolumeX } from "lucide-react";
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
  type KitchenTicketSource,
  type KitchenTicketStats,
} from "../db/kitchen";
import { playKitchenChime } from "../lib/tables";
import {
  effectiveTargetMin,
  elapsedMinutes,
  formatKitchenAge,
  isKdsMuted,
  kitchenAlertSoundAllowed,
  kitchenSlaLabel,
  kitchenSlaTone,
  setKdsMuted,
  ticketTargetMin,
  type KitchenSlaTone,
} from "../lib/kitchenTiming";
import { showUserError } from "../lib/notice";
import { useAuth } from "../context/AuthContext";

const POLL_MS = 4_000;

const COLUMNS: { status: KitchenStatus; label: string; tone: string }[] = [
  { status: "pending", label: "Pendiente", tone: "border-amber-500/50 bg-amber-500/[0.07]" },
  { status: "preparing", label: "Preparando", tone: "border-brand-500/45 bg-brand-500/[0.08]" },
  { status: "ready", label: "Listo", tone: "border-[var(--color-success)]/50 bg-[var(--color-success-bg)]" },
];

const SLA_CARD: Record<KitchenSlaTone, string> = {
  ontime: "border-[var(--color-panel-border)] bg-surface",
  delayed:
    "border-amber-500/70 bg-amber-500/[0.08] dark:border-amber-400/60 dark:bg-amber-500/[0.12]",
  very_delayed: "border-[var(--color-danger)]/70 bg-[var(--color-danger-bg)]",
};

const SLA_TEXT: Record<KitchenSlaTone, string> = {
  ontime: "text-ink-muted",
  delayed: "text-amber-700 dark:text-amber-300 font-semibold",
  very_delayed: "text-danger font-semibold",
};

type SourceFilter = "all" | KitchenTicketSource;

function ticketTitle(t: KitchenTicket): string {
  if (t.source === "pos") {
    if (t.waiter_label === "Llevar") return t.sale_id ? `Llevar #${t.sale_id}` : "Llevar";
    if (t.waiter_label === "Delivery") return t.sale_id ? `Delivery #${t.sale_id}` : "Delivery";
    return t.sale_id ? `Mostrador #${t.sale_id}` : "Mostrador";
  }
  const name = t.table_name?.trim();
  if (name) return name;
  if (t.table_number != null) return `Mesa ${t.table_number}`;
  return "Mesa";
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
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [view, setView] = useState<"active" | "today">("active");
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [stats, setStats] = useState<KitchenTicketStats | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [stationsOpen, setStationsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMuted] = useState(() => isKdsMuted());
  const knownIdsRef = useRef<Set<number> | null>(null);

  const reload = useCallback(async () => {
    try {
      const [st, list, stStats] = await Promise.all([
        listKitchenStations(),
        listKitchenTickets({
          stationId: stationId === "all" ? null : stationId,
          source: sourceFilter,
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

      const activeIds = list
        .filter((t) => t.status === "pending" || t.status === "preparing" || t.status === "ready")
        .map((t) => t.id);
      const known = knownIdsRef.current;
      if (known == null) {
        knownIdsRef.current = new Set(activeIds);
      } else {
        const newcomers = activeIds.filter((id) => !known.has(id));
        for (const id of activeIds) known.add(id);
        // Solo avisar tickets nuevos en pendientes (comanda que acaba de llegar).
        const newPending = list.some(
          (t) => newcomers.includes(t.id) && t.status === "pending",
        );
        if (newPending && kitchenAlertSoundAllowed()) {
          try {
            playKitchenChime();
          } catch {
            /* sin audio */
          }
        }
      }
    } catch (e) {
      showUserError(e);
    }
  }, [stationId, sourceFilter, view]);

  useEffect(() => {
    // Al cambiar filtro, no tratar tickets viejos como «nuevos».
    knownIdsRef.current = null;
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

  function toggleMute() {
    const next = !muted;
    setKdsMuted(next);
    setMuted(next);
  }

  const stationTabs = [
    { id: "all" as const, label: "Todas" },
    ...stations.map((s) => ({ id: s.id as number | "all", label: s.name })),
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <PageHeader
        title="Cocina"
        subtitle="Mesas y mostrador por estación. Al marcar Listo, el salón y el mozo reciben el aviso."
        actions={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              aria-label={muted ? "Activar sonido de cocina" : "Silenciar sonido de cocina"}
              title={muted ? "Sonido apagado" : "Sonido encendido"}
            >
              {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
              <span className="hidden sm:inline">{muted ? "Sin sonido" : "Sonido"}</span>
            </Button>
            {canManage ? (
              <Button variant="secondary" size="sm" onClick={() => setStationsOpen(true)}>
                <Settings2 size={14} /> Estaciones
              </Button>
            ) : null}
            <div className="inline-flex rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-1">
              {(
                [
                  ["all", "Todos"],
                  ["table", "Mesas"],
                  ["pos", "Mostrador"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSourceFilter(id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                    sourceFilter === id ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
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
            description="Cuando mandés una ronda desde Mesas o vendas con ticket de cocina en el mostrador, acá aparecen los platos por estación."
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
                      const target = ticketTargetMin(liveItems);
                      const elapsed = elapsedMinutes(ticket.created_at, now);
                      const sla =
                        ticket.status === "pending" || ticket.status === "preparing"
                          ? kitchenSlaTone(elapsed, target)
                          : "ontime";
                      const targetEff = effectiveTargetMin(target);
                      return (
                        <li
                          key={ticket.id}
                          className={`min-w-0 rounded-lg border p-3 shadow-[var(--shadow-sm)] ${SLA_CARD[sla]}`}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-display text-base font-semibold text-ink">
                                {ticketTitle(ticket)}
                              </p>
                              <p className="truncate text-xs text-ink-muted">
                                {ticket.source === "pos"
                                  ? "Mostrador"
                                  : `Ronda ${ticket.round}`}
                                {ticket.station_name ? ` · ${ticket.station_name}` : ""}
                                {ticket.source === "table" && ticket.waiter_label
                                  ? ` · ${ticket.waiter_label}`
                                  : ""}
                              </p>
                            </div>
                            <div className={`flex shrink-0 flex-col items-end gap-0.5 text-xs ${SLA_TEXT[sla]}`}>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Clock3 size={12} aria-hidden />
                                {formatKitchenAge(elapsed)}
                                <span className="font-normal text-ink-muted">
                                  / {targetEff} min
                                </span>
                              </span>
                              {ticket.status === "pending" || ticket.status === "preparing" ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wide">
                                  {kitchenSlaLabel(sla)}
                                </span>
                              ) : null}
                            </div>
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
                                          {Number.isInteger(item.qty)
                                            ? item.qty
                                            : item.qty.toLocaleString("es-AR")}
                                          ×
                                        </span>{" "}
                                        {item.label}
                                        {item.duration_min != null && item.duration_min > 0 ? (
                                          <span className="ml-1 text-xs font-normal tabular-nums text-ink-muted">
                                            · {item.duration_min}′
                                          </span>
                                        ) : null}
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
                                {ticket.status === "pending"
                                  ? " todo"
                                  : ticket.status === "preparing"
                                    ? " todo"
                                    : ""}
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
                    {ticketTitle(ticket)}
                    {ticket.source === "table" ? ` · Ronda ${ticket.round}` : ""}
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
