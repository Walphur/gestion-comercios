import { useCallback, useEffect, useRef, useState } from "react";
import { Network, RefreshCw, Search, Wifi } from "lucide-react";
import { Alert, Button, Input, Modal } from "../ui";
import {
  lanStatusLabel,
  lanSyncConnect,
  lanSyncConflictCount,
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
  lanSyncBootstrapRunClient,
  lanSyncBootstrapComplete,
  lanSyncBootstrapContribute,
  lanSyncBootstrapExport,
  lanSyncBootstrapImport,
  lanSyncBootstrapPreview,
  lanSyncSnapshotCancel,
  lanSyncSnapshotFetchManifest,
  lanSyncSnapshotGenerate,
  lanSyncSnapshotImport,
  lanSyncSnapshotPreview,
  lanSyncSnapshotStatus,
  bootstrapStatusLabel,
  snapshotStatusLabel,
  type LanConflictRow,
  type LanDiscoverResult,
  type LanSyncLogRow,
  type LanUiStatus,
  type SnapshotManifest,
  type SnapshotPreview,
  type SnapshotUiState,
} from "../../lib/lanSync";
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
      } catch {
        /* migración pendiente */
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
        showUserError("Definí una clave compartida (PSK) para la red.");
        return;
      }
      const s = await lanSyncStartServer();
      setStatus(s);
      applyStatusToForm(s, true);
      onFlash?.("Servidor LAN iniciado");
      showUserSuccess("Servidor Sync LAN en marcha");
    } catch (e) {
      showUserError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleStopServer() {
    setBusy(true);
    try {
      const s = await lanSyncStopServer();
      setStatus(s);
      onFlash?.("Servidor detenido");
    } catch (e) {
      showUserError(e instanceof Error ? e.message : String(e));
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
        showUserError("Definí la misma clave compartida (PSK) que el servidor.");
        return;
      }
      if (!serverHost.trim()) {
        showUserError("Ingresá la IP del servidor o buscá en la red.");
        return;
      }
      const s = await lanSyncConnect();
      setStatus(s);
      applyStatusToForm(s, true);
      onFlash?.("Cliente conectado");
      showUserSuccess("Conectado al servidor LAN");
    } catch (e) {
      showUserError(e instanceof Error ? e.message : String(e));
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
      showUserError(e instanceof Error ? e.message : String(e));
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
        showUserError("No se encontró ningún servidor. Probá con la IP manual.");
      } else {
        showUserSuccess(`Encontrados: ${list.length}`);
      }
    } catch (e) {
      showUserError(e instanceof Error ? e.message : String(e));
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
      showUserError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePullCatchup() {
    setBusy(true);
    try {
      const msg = await lanSyncPullCatchup();
      await refresh();
      showUserSuccess(msg);
    } catch (e) {
      showUserError(e instanceof Error ? e.message : String(e));
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
      showUserError(e instanceof Error ? e.message : String(e));
    }
  }

  async function openConflicts() {
    try {
      setConflicts(await lanSyncListConflicts(200));
      setConflictsOpen(true);
    } catch (e) {
      showUserError(e instanceof Error ? e.message : String(e));
    }
  }

  async function resolveConflict(id: number, action: "retry" | "discard") {
    try {
      const msg = await lanSyncResolveConflict(id, action);
      showUserSuccess(msg);
      setConflicts(await lanSyncListConflicts(200));
      setConflictCount(await lanSyncConflictCount());
    } catch (e) {
      showUserError(e instanceof Error ? e.message : String(e));
    }
  }

  const st = status?.status ?? "disconnected";
  const role = status?.role ?? "off";
  const connected = st === "connected" || st === "syncing";
  const pskHint = status?.psk_configured
    ? "Clave guardada. Dejá vacío para mantenerla o escribí una nueva."
    : "No la compartas fuera del local";

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-700">
          <Network size={22} />
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">Sincronización LAN</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Oficina (servidor) + cajas en la misma red Wi‑Fi o cable. Cada PC guarda su base; solo se
            copian los cambios. Sin internet.
          </p>
        </div>
      </div>

      <Alert variant="info">
        Sincroniza productos, categorías, clientes, proveedores, ventas y stock (por movimientos).
        Usá la misma clave en todas las PCs.
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-ink-muted">Modo</span>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                mode === "server"
                  ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40"
                  : "border-[var(--color-panel-border)]"
              }`}
              onClick={() => {
                markDirty("mode");
                setMode("server");
              }}
            >
              Servidor
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                mode === "client"
                  ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40"
                  : "border-[var(--color-panel-border)]"
              }`}
              onClick={() => {
                markDirty("mode");
                setMode("client");
              }}
            >
              Cliente
            </button>
          </div>
        </label>
        <div className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2">
          <p className="text-xs font-medium text-ink-muted">Estado</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            <StatusDot status={st} /> {lanStatusLabel(st)}
            {role !== "off" ? ` · ${role === "server" ? "Servidor" : "Cliente"}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
          label="Código de equipo (numeración)"
          value={deviceCode}
          onChange={(e) => {
            markDirty("deviceCode");
            setDeviceCode(e.target.value.toUpperCase());
          }}
          placeholder="Ej. CJ01 / OF01"
          hint="Prefijo único por PC para comprobantes (CJ01-V-00000001)"
        />
        <Input
          label="Clave compartida (PSK)"
          type="password"
          value={psk}
          onChange={(e) => {
            markDirty("psk");
            setPsk(e.target.value);
          }}
          placeholder="Misma clave en servidor y cajas"
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
        />
        {mode === "client" && (
          <Input
            label="IP del servidor"
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
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--color-panel-border)] p-3 text-sm sm:grid-cols-4">
          <Stat label="IP local" value={status.local_ip || "—"} />
          <Stat label="Puerto" value={String(status.port)} />
          <Stat
            label="Clientes"
            value={mode === "server" || role === "server" ? String(status.clients_connected) : "—"}
          />
          <Stat
            label="Bootstrap"
            value={
              status.bootstrap_planned > 0
                ? `${status.bootstrap_applied}/${status.bootstrap_planned}`
                : bootstrapStatusLabel(status.bootstrap_status)
            }
          />
          <Stat label="Outbox" value={String(status.outbox_pending)} />
          <Stat label="Deferred" value={String(status.deferred_pending)} />
          <Stat label="Conflicts" value={String(status.conflicts_open)} />
          <Stat label="Última sync" value={status.last_sync_at || "—"} />
          <Stat label="Equipo" value={status.device_name || status.device_id.slice(0, 8) || "—"} />
        </div>
      )}

      {status?.last_error && (
        <Alert variant="danger">{status.last_error}</Alert>
      )}

      {mode === "server" && status?.clients && status.clients.length > 0 && (
        <div className="rounded-xl border border-[var(--color-panel-border)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">Clientes conectados</p>
          <ul className="space-y-1 text-sm">
            {status.clients.map((c) => (
              <li key={c.device_id} className="flex justify-between gap-2">
                <span>{c.device_name || c.device_id.slice(0, 10)}</span>
                <span className="text-ink-muted">{c.remote_addr}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {discovered.length > 0 && (
        <div className="rounded-xl border border-[var(--color-panel-border)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">Servidores encontrados</p>
          <ul className="space-y-2">
            {discovered.map((d) => (
              <li key={d.device_id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-brand-950/30"
                  onClick={() => {
                    markDirty("serverHost");
                    markDirty("port");
                    markDirty("mode");
                    setServerHost(d.host);
                    setPort(String(d.port));
                    setMode("client");
                  }}
                >
                  <span className="font-medium">{d.name || d.host}</span>
                  <span className="text-ink-muted">
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
          {status.products_with_variants} producto(s) tienen variantes — el stock/precio por variante no
          se sincroniza en Phase 0.5a.
        </Alert>
      )}

      <div className="rounded-xl border border-[var(--color-panel-border)] p-3 min-w-0">
        <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">
          Snapshot catálogo (Phase 0.5b — Caso A)
        </p>
        <p className="mb-3 text-sm text-ink-muted">
          PC principal genera un archivo comprimido y lo comparte por LAN. PC vacía lo importa una
          vez; después sigue el sync CDC normal. No fusiona catálogos existentes.
        </p>
        {(mode === "client" || role === "client") &&
          status &&
          (status.bootstrap_status === "complete" || status.bootstrap_applied > 0) && (
            <Alert variant="warning">
              Esta caja ya tiene bootstrap/catálogo local (Bootstrap{" "}
              {status.bootstrap_applied}/{status.bootstrap_planned || "—"}). El snapshot Caso A
              solo funciona en una PC vacía (0 productos). Si importás acá va a fallar: usá una
              instalación limpia o vaciá el catálogo con backup previo.
            </Alert>
          )}
        {snapUi?.last_error ? (
          <Alert variant="danger">{snapUi.last_error}</Alert>
        ) : null}
        {snapUi && snapUi.status !== "off" && (
          <p className="mb-2 text-sm text-ink-muted">
            Estado: {snapshotStatusLabel(snapUi.status)}
            {snapPhase ? ` — ${snapPhase}` : ""}
          </p>
        )}
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <label className="flex items-center gap-2 text-sm text-ink-muted min-w-0">
            <input
              type="checkbox"
              checked={includeStockSeed}
              onChange={(e) => setIncludeStockSeed(e.target.checked)}
            />
            Importar stock actual (seed; no es historial)
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === "server" && (
            <Button
              variant="secondary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setSnapPhase("Generando…");
                try {
                  const preview = await lanSyncSnapshotPreview();
                  setSnapPreview(preview);
                  onFlash?.(
                    `Catálogo: ${preview.products.toLocaleString("es-AR")} productos, ${preview.categories.toLocaleString("es-AR")} categorías`,
                  );
                  const m = await lanSyncSnapshotGenerate(includeStockSeed);
                  setSnapUi(await lanSyncSnapshotStatus());
                  showUserSuccess(
                    `Catálogo listo para compartir (${(m.compressed_size / (1024 * 1024)).toFixed(1)} MB)`,
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
              Compartir catálogo
            </Button>
          )}
          {(mode === "client" || role === "client") && (
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
                      `${m.row_counts.products.toLocaleString("es-AR")} productos · ${m.row_counts.categories.toLocaleString("es-AR")} categorías · ${m.row_counts.customers.toLocaleString("es-AR")} clientes`,
                    );
                  } catch (e) {
                    showUserError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Buscar catálogo del servidor
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
                      "✓ Catálogo importado · ✓ Stock inicial · ✓ Sincronización LAN activa",
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
        {snapPreview && mode === "server" && (
          <p className="mt-3 text-sm text-ink-muted break-words">
            {snapPreview.products.toLocaleString("es-AR")} productos ·{" "}
            {snapPreview.categories.toLocaleString("es-AR")} categorías ·{" "}
            {snapPreview.customers.toLocaleString("es-AR")} clientes ·{" "}
            {snapPreview.suppliers.toLocaleString("es-AR")} proveedores · ~{" "}
            {Math.max(1, Math.round(snapPreview.estimated_uncompressed_bytes / (1024 * 1024)))} MB
            estimado
          </p>
        )}
        {snapRemote && (mode === "client" || role === "client") && (
          <div className="mt-3 text-sm text-ink-muted min-w-0">
            <p className="font-medium text-ink">
              {status?.server_host || "Servidor"} encontró un catálogo
            </p>
            <p className="break-words">
              {snapRemote.row_counts.products.toLocaleString("es-AR")} productos ·{" "}
              {snapRemote.row_counts.categories.toLocaleString("es-AR")} categorías ·{" "}
              {snapRemote.row_counts.customers.toLocaleString("es-AR")} clientes
              {snapRemote.includes_stock_seed ? " · incluye stock seed" : ""}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--color-panel-border)] p-3 min-w-0">
        <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">
          Bootstrap catálogo (Phase 0.5a)
        </p>
        <p className="mb-3 text-sm text-ink-muted">
          Servidor exporta → cliente ejecuta &quot;Bootstrap completo&quot; (import + contribución).
          El hub aplica la contribución al recibir el push; no hace falta &quot;Descargar del servidor&quot; en A.
        </p>
        <div className="flex flex-wrap gap-2">
          {mode === "server" && (
            <Button
              variant="secondary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const preview = await lanSyncBootstrapPreview();
                  onFlash?.(
                    `Exportar: ${preview.products} productos, ${preview.categories} categorías`,
                  );
                  await lanSyncBootstrapExport();
                  showUserSuccess("Bootstrap exportado al event store");
                  await refresh();
                } catch (e) {
                  showUserError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              1. Exportar catálogo (servidor)
            </Button>
          )}
          {(mode === "client" || role === "client") && (
            <>
              <Button
                variant="secondary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await lanSyncBootstrapRunClient();
                    showUserSuccess("Bootstrap cliente completo (import + contribución)");
                    await refresh();
                  } catch (e) {
                    showUserError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Bootstrap completo (cliente)
              </Button>
              <Button
                variant="secondary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await lanSyncBootstrapImport();
                    showUserSuccess("Import bootstrap completado");
                    await refresh();
                  } catch (e) {
                    showUserError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                2. Importar catálogo
              </Button>
              <Button
                variant="secondary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await lanSyncBootstrapContribute();
                    showUserSuccess("Contribución enviada al hub");
                    await refresh();
                  } catch (e) {
                    showUserError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                3. Contribuir únicos
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await lanSyncBootstrapComplete();
                showUserSuccess("Bootstrap marcado completo — CDC normal");
                await refresh();
              } catch (e) {
                showUserError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Marcar completo
          </Button>
        </div>
      </div>

      {conflictCount > 0 && (
        <Alert variant="danger">
          Hay {conflictCount} conflicto(s) de sincronización pendientes de resolver manualmente.
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {mode === "server" ? (
          connected && role === "server" ? (
            <Button variant="danger" loading={busy} onClick={() => void handleStopServer()}>
              Detener servidor
            </Button>
          ) : (
            <Button loading={busy} onClick={() => void handleStartServer()}>
              Iniciar servidor
            </Button>
          )
        ) : connected && role === "client" ? (
          <Button variant="danger" loading={busy} onClick={() => void handleDisconnect()}>
            Desconectar
          </Button>
        ) : (
          <Button loading={busy} onClick={() => void handleConnect()}>
            Conectar
          </Button>
        )}
        <Button variant="secondary" loading={busy} onClick={() => void handleDiscover()}>
          <Search size={16} /> Buscar servidor
        </Button>
        <Button variant="secondary" loading={busy} onClick={() => void handleTest()}>
          <Wifi size={16} /> Probar conexión
        </Button>
        {(mode === "client" || role === "client") && (
          <Button variant="secondary" loading={busy} onClick={() => void handlePullCatchup()}>
            <RefreshCw size={16} /> Descargar del servidor
          </Button>
        )}
        <Button variant="ghost" onClick={() => void openConflicts()}>
          Conflictos{conflictCount > 0 ? ` (${conflictCount})` : ""}
        </Button>
        <Button variant="ghost" onClick={() => void openLogs()}>
          Ver registros
        </Button>
        <Button variant="ghost" onClick={() => void handleManualRefresh()}>
          <RefreshCw size={16} /> Actualizar
        </Button>
      </div>

      <Modal open={logsOpen} title="Registros Sync LAN" onClose={() => setLogsOpen(false)} wide>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-left text-sm">
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
                  <td className="py-2 pr-2 whitespace-nowrap tabular-nums">{l.at}</td>
                  <td className="py-2 pr-2">{l.direction}</td>
                  <td className="py-2 pr-2">{l.peer || "—"}</td>
                  <td className="py-2">
                    <div>{l.summary}</div>
                    {l.detail && <div className="text-xs text-ink-muted">{l.detail}</div>}
                  </td>
                </tr>
              ))}
              {!logs.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ink-muted">
                    Sin registros todavía
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal
        open={conflictsOpen}
        title="Sincronización → Conflictos"
        onClose={() => setConflictsOpen(false)}
        wide
      >
        <p className="mb-3 text-sm text-ink-muted">
          Eventos que no se pudieron aplicar (barcode duplicado, UNIQUE, etc.). La sync sigue;
          resolvé manualmente.
        </p>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-panel-border)] text-xs uppercase text-ink-muted">
                <th className="py-2 pr-2">Entidad</th>
                <th className="py-2 pr-2">Origen</th>
                <th className="py-2 pr-2">Motivo</th>
                <th className="py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c) => (
                <tr key={c.id} className="border-b border-[var(--color-panel-border)]/60 align-top">
                  <td className="py-2 pr-2">
                    <div className="font-medium">
                      {c.entity_type} · {c.entity_sync_id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-ink-muted">{c.created_at}</div>
                  </td>
                  <td className="py-2 pr-2 text-xs">{c.origin_device.slice(0, 10)}</td>
                  <td className="py-2 pr-2 text-xs">{c.reason}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="secondary"
                        onClick={() => void resolveConflict(c.id, "retry")}
                      >
                        Reintentar
                      </Button>
                      <Button variant="ghost" onClick={() => void resolveConflict(c.id, "discard")}>
                        Descartar remoto
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!conflicts.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ink-muted">
                    Sin conflictos abiertos
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
    <div>
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
