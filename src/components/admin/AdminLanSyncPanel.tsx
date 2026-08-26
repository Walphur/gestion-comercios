import { useCallback, useEffect, useRef, useState } from "react";
import { Network, RefreshCw, Search, Wifi } from "lucide-react";
import { Alert, Button, Input, Modal } from "../ui";
import {
  lanStatusLabel,
  lanSyncConnect,
  lanSyncConflictCount,
  lanSyncDiscardAllConflicts,
  lanSyncDisconnect,
  lanSyncDiscover,
  lanSyncGetDeviceCode,
  lanSyncGetStatus,
  lanSyncListConflicts,
  lanSyncListLogs,
  lanSyncPullCatchup,
  lanSyncResolveConflict,
  lanSyncSaveConfig,
  lanSyncStartServer,
  lanSyncStopServer,
  lanSyncTestConnection,
  lanSyncSnapshotCancel,
  lanSyncSnapshotFetchManifest,
  lanSyncSnapshotGenerate,
  lanSyncSnapshotImport,
  lanSyncSnapshotPreview,
  lanSyncSnapshotStatus,
  lanSyncClearCatalogOutbox,
  snapshotStatusLabel,
  type LanConflictRow,
  type LanDiscoverResult,
  type LanSyncLogRow,
  type LanUiStatus,
  type SnapshotManifest,
  type SnapshotPreview,
  type SnapshotUiState,
} from "../../lib/lanSync";
import { confirmAction } from "../../lib/confirm";
import { showUserError, showUserSuccess } from "../../lib/notice";

interface Props {
  onFlash?: (msg: string) => void;
}

type FormDirty = {
  deviceName: boolean;
  psk: boolean;
  port: boolean;
  serverHost: boolean;
  deviceCode: boolean;
  mode: boolean;
};

const EMPTY_DIRTY: FormDirty = {
  deviceName: false,
  psk: false,
  port: false,
  serverHost: false,
  deviceCode: false,
  mode: false,
};

export default function AdminLanSyncPanel({ onFlash }: Props) {
  const [status, setStatus] = useState<LanUiStatus | null>(null);
  const [psk, setPsk] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [port, setPort] = useState("48765");
  const [serverHost, setServerHost] = useState("");
  const [mode, setMode] = useState<"server" | "client">("server");
  const [busy, setBusy] = useState(false);
  const [discovered, setDiscovered] = useState<LanDiscoverResult[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<LanSyncLogRow[]>([]);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [conflicts, setConflicts] = useState<LanConflictRow[]>([]);
  const [conflictCount, setConflictCount] = useState(0);
  const [deviceCode, setDeviceCode] = useState("");
  const [snapPreview, setSnapPreview] = useState<SnapshotPreview | null>(null);
  const [snapRemote, setSnapRemote] = useState<SnapshotManifest | null>(null);
  const [snapUi, setSnapUi] = useState<SnapshotUiState | null>(null);
  const [snapPhase, setSnapPhase] = useState("");
  const [includeStockSeed, setIncludeStockSeed] = useState(true);
  const formDirty = useRef<FormDirty>({ ...EMPTY_DIRTY });

  const applyStatusToForm = useCallback((s: LanUiStatus, force = false) => {
    const dirty = formDirty.current;
    if (force || !dirty.deviceName) setDeviceName(s.device_name || "");
    if (force || !dirty.port) setPort(String(s.port || 48765));
    if (force || !dirty.serverHost) setServerHost(s.server_host || "");
    if (force || !dirty.mode) {
      if (s.role === "client" || s.role === "server") setMode(s.role);
    }
  }, []);

  const refresh = useCallback(
    async (opts?: { forceForm?: boolean }) => {
      const forceForm = opts?.forceForm ?? false;
      const s = await lanSyncGetStatus();
      setStatus(s);
      applyStatusToForm(s, forceForm);
      try {
        setConflictCount(await lanSyncConflictCount());
        const code = await lanSyncGetDeviceCode();
        if (forceForm || !formDirty.current.deviceCode) setDeviceCode(code);
        setSnapUi(await lanSyncSnapshotStatus());
      } catch {
        /* ok */
      }
    },
    [applyStatusToForm],
  );

  function resetFormDirty() {
    formDirty.current = { ...EMPTY_DIRTY };
  }

  function markDirty(field: keyof FormDirty) {
    formDirty.current[field] = true;
  }

  useEffect(() => {
    void refresh({ forceForm: true }).catch(() => undefined);
    const t = setInterval(() => void refresh().catch(() => undefined), 2500);
    return () => clearInterval(t);
  }, [refresh]);

  async function saveBasics() {
    await lanSyncSaveConfig({
      role: mode,
      port: Number(port) || 48765,
      psk: psk.trim() || undefined,
      device_name: deviceName.trim() || undefined,
      server_host: serverHost.trim() || undefined,
      device_code: deviceCode.trim() || undefined,
    });
    resetFormDirty();
  }

  function hasPsk(statusSnapshot: LanUiStatus | null) {
    return Boolean(psk.trim() || statusSnapshot?.psk_configured);
  }

  async function handleStartServer() {
    setBusy(true);
    try {
      await saveBasics();
      const latest = await lanSyncGetStatus();
      setStatus(latest);
      if (!hasPsk(latest)) {
        showUserError("Definí una clave de red. Tiene que ser la misma en todas las PCs.");
        return;
      }
      const s = await lanSyncStartServer();
      setStatus(s);
      applyStatusToForm(s, true);
      onFlash?.("PC principal lista");
      showUserSuccess("Esta PC ya puede compartir datos con las cajas");
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleStopServer() {
    setBusy(true);
    try {
      const s = await lanSyncStopServer();
      setStatus(s);
      onFlash?.("Dejó de compartir");
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleConnect() {
    setBusy(true);
    try {
      await saveBasics();
      const latest = await lanSyncGetStatus();
      setStatus(latest);
      if (!hasPsk(latest)) {
        showUserError("Usá la misma clave de red que la PC principal.");
        return;
      }
      if (!serverHost.trim()) {
        showUserError("Indicá la IP de la PC principal o usá «Buscar en la red».");
        return;
      }
      const s = await lanSyncConnect();
      setStatus(s);
      applyStatusToForm(s, true);
      onFlash?.("Caja conectada");
      showUserSuccess("Conectada a la PC principal. Los cambios se copian solos.");
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      const s = await lanSyncDisconnect();
      setStatus(s);
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscover() {
    setBusy(true);
    try {
      const list = await lanSyncDiscover(4);
      setDiscovered(list);
      if (!list.length) {
        showUserError("No encontramos ninguna PC principal. Probá poner la IP a mano.");
      } else {
        showUserSuccess(`Encontramos ${list.length} equipo(s)`);
      }
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    try {
      await saveBasics();
      const msg = await lanSyncTestConnection();
      showUserSuccess(msg || "Conexión OK");
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handlePullCatchup() {
    setBusy(true);
    try {
      const msg = await lanSyncPullCatchup();
      await refresh();
      showUserSuccess(msg || "Cambios actualizados");
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleManualRefresh() {
    resetFormDirty();
    setPsk("");
    await refresh({ forceForm: true });
  }

  async function openLogs() {
    try {
      setLogs(await lanSyncListLogs(150));
      setLogsOpen(true);
    } catch (e) {
      showUserError(e);
    }
  }

  async function openConflicts() {
    try {
      setConflicts(await lanSyncListConflicts(200));
      setConflictsOpen(true);
    } catch (e) {
      showUserError(e);
    }
  }

  async function resolveConflict(id: number, action: "retry" | "discard") {
    try {
      const msg = await lanSyncResolveConflict(id, action);
      showUserSuccess(msg);
      setConflicts(await lanSyncListConflicts(200));
      setConflictCount(await lanSyncConflictCount());
    } catch (e) {
      showUserError(e);
    }
  }

  async function discardAllConflicts() {
    if (
      !(await confirmAction({
        title: "Ignorar todos los conflictos",
        message: `Se van a ignorar ${conflictCount.toLocaleString("es-AR")} conflicto(s). No borra productos: solo limpia la cola de sync. ¿Continuar?`,
        variant: "danger",
        confirmLabel: "Sí, ignorar todos",
      }))
    ) {
      return;
    }
    try {
      setBusy(true);
      const msg = await lanSyncDiscardAllConflicts();
      showUserSuccess(msg);
      setConflicts([]);
      setConflictCount(0);
      setConflictsOpen(false);
      await refresh();
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  const st = status?.status ?? "disconnected";
  const role = status?.role ?? "off";
  const connected = st === "connected" || st === "syncing";
  const isServer = mode === "server" || role === "server";
  const isClient = mode === "client" || role === "client";
  const pskHint = status?.psk_configured
    ? "Clave guardada. Dejá vacío para mantenerla o escribí una nueva."
    : "La misma clave en la PC principal y en cada caja";

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-700">
          <Network size={22} />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-ink">Varias PCs en el local</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Una PC principal (oficina) y las cajas en la misma Wi‑Fi o cable. Cada una guarda sus
            datos; los cambios se copian solos entre ellas. No hace falta internet.
          </p>
        </div>
      </div>

      <Alert variant="info">
        Se copian productos, categorías, clientes, proveedores, ventas y stock. Primero copiá el
        catálogo una vez a cada caja nueva; después todo lo demás va automático.
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 min-w-0">
        <label className="block text-sm min-w-0">
          <span className="mb-1.5 block font-medium text-ink-muted">Esta PC es…</span>
          <div className="flex gap-2">
            <button
              type="button"
              className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                mode === "server"
                  ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40"
                  : "border-[var(--color-panel-border)]"
              }`}
              onClick={() => {
                markDirty("mode");
                setMode("server");
              }}
            >
              PC principal
            </button>
            <button
              type="button"
              className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                mode === "client"
                  ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40"
                  : "border-[var(--color-panel-border)]"
              }`}
              onClick={() => {
                markDirty("mode");
                setMode("client");
              }}
            >
              Caja
            </button>
          </div>
        </label>
        <div className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 min-w-0">
          <p className="text-xs font-medium text-ink-muted">Estado</p>
          <p className="mt-1 text-sm font-semibold text-ink truncate">
            <StatusDot status={st} /> {lanStatusLabel(st)}
            {role !== "off" ? ` · ${role === "server" ? "PC principal" : "Caja"}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 min-w-0">
        <Input
          label="Nombre de esta PC"
          value={deviceName}
          onChange={(e) => {
            markDirty("deviceName");
            setDeviceName(e.target.value);
          }}
          placeholder="Ej. Oficina / Caja 1"
        />
        <Input
          label="Código corto (para tickets)"
          value={deviceCode}
          onChange={(e) => {
            markDirty("deviceCode");
            setDeviceCode(e.target.value.toUpperCase());
          }}
          placeholder="Ej. CJ01 / OF01"
          hint="Un código distinto por PC (aparece en comprobantes)"
        />
        <Input
          label="Clave de la red"
          type="password"
          value={psk}
          onChange={(e) => {
            markDirty("psk");
            setPsk(e.target.value);
          }}
          placeholder="Misma clave en todas las PCs"
          hint={pskHint}
        />
        <Input
          label="Puerto"
          type="number"
          value={port}
          onChange={(e) => {
            markDirty("port");
            setPort(e.target.value);
          }}
          hint="Casi nunca hay que cambiarlo (48765)"
        />
        {mode === "client" && (
          <Input
            label="IP de la PC principal"
            value={serverHost}
            onChange={(e) => {
              markDirty("serverHost");
              setServerHost(e.target.value);
            }}
            placeholder="Ej. 192.168.1.10"
          />
        )}
      </div>

      {status && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--color-panel-border)] p-3 text-sm sm:grid-cols-4 min-w-0">
          <Stat label="IP de esta PC" value={status.local_ip || "—"} />
          <Stat label="Puerto" value={String(status.port)} />
          <Stat
            label="Cajas conectadas"
            value={isServer ? String(status.clients_connected) : "—"}
          />
          <Stat
            label="Cambios pendientes"
            value={String(status.outbox_pending || status.pending || 0)}
          />
          <Stat label="En espera" value={String(status.deferred_pending)} />
          <Stat label="Conflictos" value={String(status.conflicts_open)} />
          <Stat label="Última sync" value={status.last_sync_at || "—"} />
          <Stat label="Equipo" value={status.device_name || "—"} />
        </div>
      )}

      {status?.last_error && <Alert variant="danger">{status.last_error}</Alert>}

      {isServer && status?.clients && status.clients.length > 0 && (
        <div className="rounded-xl border border-[var(--color-panel-border)] p-3 min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">Cajas conectadas</p>
          <ul className="space-y-1 text-sm">
            {status.clients.map((c) => (
              <li key={c.device_id} className="flex justify-between gap-2 min-w-0">
                <span className="truncate">{c.device_name || c.device_id.slice(0, 10)}</span>
                <span className="shrink-0 text-ink-muted">{c.remote_addr}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {discovered.length > 0 && (
        <div className="rounded-xl border border-[var(--color-panel-border)] p-3 min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">
            PCs principales encontradas
          </p>
          <ul className="space-y-2">
            {discovered.map((d) => (
              <li key={d.device_id}>
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-brand-950/30"
                  onClick={() => {
                    markDirty("serverHost");
                    markDirty("port");
                    markDirty("mode");
                    setServerHost(d.host);
                    setPort(String(d.port));
                    setMode("client");
                  }}
                >
                  <span className="truncate font-medium">{d.name || d.host}</span>
                  <span className="shrink-0 text-ink-muted">
                    {d.host}:{d.port}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status && status.products_with_variants > 0 && (
        <Alert variant="warning">
          Hay {status.products_with_variants} producto(s) con variantes (talle/color). El stock por
          variante no se copia entre PCs; usá productos simples si necesitás stock sincronizado.
        </Alert>
      )}

      <div className="rounded-xl border border-[var(--color-panel-border)] p-3 min-w-0">
        <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">
          Copiar catálogo a una caja nueva
        </p>
        <p className="mb-3 text-sm text-ink-muted">
          {isServer
            ? "En la PC principal: prepará el catálogo y dejalo listo. En una caja vacía (sin productos), conectala y copiá el catálogo una sola vez. Después los cambios van solos."
            : "Solo en una caja vacía (sin productos ni ventas). Conectá a la PC principal, buscá el catálogo e importalo. Si esta caja ya tiene productos, no uses esto."}
        </p>

        {isServer && status && status.outbox_pending > 5_000 && (
          <Alert variant="warning">
            Hay muchos cambios pendientes (
            {status.outbox_pending.toLocaleString("es-AR")}). Eso puede saturar las cajas. Usá
            «Vaciar cola de productos» y volvé a compartir el catálogo.
          </Alert>
        )}

        {snapUi?.last_error ? <Alert variant="danger">{snapUi.last_error}</Alert> : null}

        {snapUi && snapUi.status !== "off" && (
          <p className="mb-2 text-sm text-ink-muted">
            Estado: {snapshotStatusLabel(snapUi.status)}
            {snapPhase ? ` — ${snapPhase}` : ""}
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={includeStockSeed}
              onChange={(e) => setIncludeStockSeed(e.target.checked)}
            />
            Incluir stock actual (solo el de ahora, no el historial)
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {isServer && (
            <>
              <Button
                variant="secondary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setSnapPhase("Preparando…");
                  try {
                    const preview = await lanSyncSnapshotPreview();
                    setSnapPreview(preview);
                    onFlash?.(
                      `${preview.products.toLocaleString("es-AR")} productos · ${preview.categories.toLocaleString("es-AR")} categorías`,
                    );
                    const m = await lanSyncSnapshotGenerate(includeStockSeed);
                    setSnapUi(await lanSyncSnapshotStatus());
                    showUserSuccess(
                      `Catálogo listo (${(m.compressed_size / (1024 * 1024)).toFixed(1)} MB). En la caja vacía: Importar catálogo.`,
                    );
                    setSnapPhase("");
                    await refresh();
                  } catch (e) {
                    showUserError(e);
                    setSnapPhase("");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Preparar catálogo para compartir
              </Button>
              <Button
                variant="ghost"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const n = await lanSyncClearCatalogOutbox();
                    showUserSuccess(
                      `Cola vaciada (${n.toLocaleString("es-AR")} ítems)`,
                    );
                    await refresh();
                  } catch (e) {
                    showUserError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Vaciar cola de productos
              </Button>
            </>
          )}
          {isClient && (
            <>
              <Button
                variant="secondary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const m = await lanSyncSnapshotFetchManifest();
                    setSnapRemote(m);
                    onFlash?.(
                      `${m.row_counts.products.toLocaleString("es-AR")} productos · ${m.row_counts.categories.toLocaleString("es-AR")} categorías`,
                    );
                  } catch (e) {
                    showUserError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Buscar catálogo
              </Button>
              <Button
                loading={busy}
                disabled={!snapRemote}
                onClick={async () => {
                  setBusy(true);
                  setSnapPhase("Descargando…");
                  try {
                    const progress = await lanSyncSnapshotImport();
                    setSnapPhase(progress.message || "Finalizando…");
                    setSnapUi(await lanSyncSnapshotStatus());
                    showUserSuccess(
                      "Catálogo copiado. A partir de ahora los cambios se sincronizan solos.",
                    );
                    setSnapPhase("");
                    await refresh();
                  } catch (e) {
                    showUserError(e);
                    setSnapPhase("");
                    try {
                      setSnapUi(await lanSyncSnapshotStatus());
                    } catch {
                      /* ignore */
                    }
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Importar catálogo
              </Button>
              <Button
                variant="ghost"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setSnapUi(await lanSyncSnapshotCancel());
                    showUserSuccess("Descarga cancelada");
                  } catch (e) {
                    showUserError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Cancelar descarga
              </Button>
            </>
          )}
        </div>

        {snapPreview && isServer && (
          <p className="mt-3 break-words text-sm text-ink-muted">
            {snapPreview.products.toLocaleString("es-AR")} productos ·{" "}
            {snapPreview.categories.toLocaleString("es-AR")} categorías ·{" "}
            {snapPreview.customers.toLocaleString("es-AR")} clientes ·{" "}
            {snapPreview.suppliers.toLocaleString("es-AR")} proveedores · ~{" "}
            {Math.max(1, Math.round(snapPreview.estimated_uncompressed_bytes / (1024 * 1024)))} MB
          </p>
        )}
        {snapRemote && isClient && (
          <div className="mt-3 min-w-0 text-sm text-ink-muted">
            <p className="font-medium text-ink">Catálogo encontrado en la PC principal</p>
            <p className="break-words">
              {snapRemote.row_counts.products.toLocaleString("es-AR")} productos ·{" "}
              {snapRemote.row_counts.categories.toLocaleString("es-AR")} categorías ·{" "}
              {snapRemote.row_counts.customers.toLocaleString("es-AR")} clientes
              {snapRemote.includes_stock_seed ? " · con stock actual" : ""}
            </p>
          </div>
        )}
      </div>

      {conflictCount > 0 && (
        <Alert variant="danger">
          Hay {conflictCount.toLocaleString("es-AR")} dato(s) en conflicto (solo en esta PC).
          No son productos a borrar: usá «Ignorar todos» o revisá uno por uno.
        </Alert>
      )}

      <Alert variant="info">
        El precio de un producto se copia por la red al guardarlo. El stock viaja cuando
        vendés, ajustás stock o cambiás la cantidad al editar el producto (versión nueva).
      </Alert>

      <div className="flex flex-wrap gap-2">
        {mode === "server" ? (
          connected && role === "server" ? (
            <Button variant="danger" loading={busy} onClick={() => void handleStopServer()}>
              Dejar de compartir
            </Button>
          ) : (
            <Button loading={busy} onClick={() => void handleStartServer()}>
              Empezar a compartir
            </Button>
          )
        ) : connected && role === "client" ? (
          <Button variant="danger" loading={busy} onClick={() => void handleDisconnect()}>
            Desconectar
          </Button>
        ) : (
          <Button loading={busy} onClick={() => void handleConnect()}>
            Conectar a la PC principal
          </Button>
        )}
        <Button variant="secondary" loading={busy} onClick={() => void handleDiscover()}>
          <Search size={16} /> Buscar en la red
        </Button>
        <Button variant="secondary" loading={busy} onClick={() => void handleTest()}>
          <Wifi size={16} /> Probar conexión
        </Button>
        {isClient && (
          <Button variant="secondary" loading={busy} onClick={() => void handlePullCatchup()}>
            <RefreshCw size={16} /> Traer cambios ahora
          </Button>
        )}
        <Button variant="ghost" onClick={() => void openConflicts()}>
          Conflictos{conflictCount > 0 ? ` (${conflictCount.toLocaleString("es-AR")})` : ""}
        </Button>
        {conflictCount > 0 && (
          <Button variant="danger" loading={busy} onClick={() => void discardAllConflicts()}>
            Ignorar todos los conflictos
          </Button>
        )}
        <Button variant="ghost" onClick={() => void openLogs()}>
          Ver actividad
        </Button>
        <Button variant="ghost" onClick={() => void handleManualRefresh()}>
          <RefreshCw size={16} /> Actualizar pantalla
        </Button>
      </div>

      <Modal open={logsOpen} title="Actividad de la red" onClose={() => setLogsOpen(false)} wide>
        <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
          <table className="w-full min-w-0 text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-panel-border)] text-xs uppercase text-ink-muted">
                <th className="py-2 pr-2">Hora</th>
                <th className="py-2 pr-2">Dir.</th>
                <th className="py-2 pr-2">Equipo</th>
                <th className="py-2">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-[var(--color-panel-border)]/60 align-top">
                  <td className="whitespace-nowrap py-2 pr-2 tabular-nums">{l.at}</td>
                  <td className="py-2 pr-2">{l.direction}</td>
                  <td className="py-2 pr-2">{l.peer || "—"}</td>
                  <td className="py-2 min-w-0">
                    <div className="break-words">{l.summary}</div>
                    {l.detail && (
                      <div className="break-words text-xs text-ink-muted">{l.detail}</div>
                    )}
                  </td>
                </tr>
              ))}
              {!logs.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ink-muted">
                    Todavía no hay actividad
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal
        open={conflictsOpen}
        title="Datos en conflicto"
        onClose={() => setConflictsOpen(false)}
        wide
      >
        <p className="mb-3 text-sm text-ink-muted">
          Son cambios que no se pudieron aplicar solos (por ejemplo un código de barras repetido).
          La sincronización sigue; resolvé estos a mano. Ignorar todos no borra el catálogo.
        </p>
        {conflictCount > 0 && (
          <div className="mb-3">
            <Button variant="danger" loading={busy} onClick={() => void discardAllConflicts()}>
              Ignorar todos ({conflictCount.toLocaleString("es-AR")})
            </Button>
          </div>
        )}
        <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
          <table className="w-full min-w-0 text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-panel-border)] text-xs uppercase text-ink-muted">
                <th className="py-2 pr-2">Qué</th>
                <th className="py-2 pr-2">De dónde</th>
                <th className="py-2 pr-2">Motivo</th>
                <th className="py-2">Qué hacer</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c) => (
                <tr key={c.id} className="border-b border-[var(--color-panel-border)]/60 align-top">
                  <td className="py-2 pr-2 min-w-0">
                    <div className="truncate font-medium">
                      {c.entity_type} · {c.entity_sync_id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-ink-muted">{c.created_at}</div>
                  </td>
                  <td className="py-2 pr-2 text-xs">{c.origin_device.slice(0, 10)}</td>
                  <td className="break-words py-2 pr-2 text-xs">{c.reason}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="secondary"
                        onClick={() => void resolveConflict(c.id, "retry")}
                      >
                        Reintentar
                      </Button>
                      <Button variant="ghost" onClick={() => void resolveConflict(c.id, "discard")}>
                        Ignorar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!conflicts.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ink-muted">
                    No hay conflictos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className="truncate font-medium tabular-nums text-ink">{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "connected"
      ? "bg-emerald-500"
      : status === "syncing"
        ? "bg-sky-500 animate-pulse"
        : status === "connecting"
          ? "bg-amber-400 animate-pulse"
          : status === "error"
            ? "bg-red-500"
            : "bg-slate-400";
  return (
    <span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${color}`} aria-hidden />
  );
}
