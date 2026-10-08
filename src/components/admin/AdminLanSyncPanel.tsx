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

function lanPrefix(ip: string): string | null {
  const host = ip.trim().split(":")[0] ?? "";
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  return parts.slice(0, 3).join(".");
}

function sharesLan(localIps: string, host: string): boolean | null {
  const remote = lanPrefix(host);
  const locals = localIps
    .split(/[·,]/)
    .map((s) => lanPrefix(s))
    .filter((p): p is string => Boolean(p));
  if (!remote || locals.length === 0) return null;
  return locals.some((p) => p === remote);
}

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedId, setPickedId] = useState("");
  const [searchError, setSearchError] = useState("");
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

  async function connectWith(host: string, portValue: string) {
    const clean = host.trim();
    if (!clean) {
      showUserError("Primero apretá Buscar red, elegí la PC y después Conectar.");
      return;
    }
    setBusy(true);
    try {
      setMode("client");
      setServerHost(clean);
      setPort(portValue);
      await lanSyncSaveConfig({
        role: "client",
        port: Number(portValue) || 48765,
        psk: psk.trim() || undefined,
        device_name: deviceName.trim() || undefined,
        server_host: clean,
        device_code: deviceCode.trim() || undefined,
      });
      resetFormDirty();
      const latest = await lanSyncGetStatus();
      setStatus(latest);
      if (!hasPsk(latest)) {
        showUserError("Falta la clave. Tiene que ser la misma en las dos PCs.");
        return;
      }
      const s = await lanSyncConnect();
      setStatus(s);
      applyStatusToForm(s, true);
      const msg = await lanSyncTestConnection();
      setStatus(await lanSyncGetStatus());
      setPickerOpen(false);
      onFlash?.("Caja conectada");
      showUserSuccess(msg || "Conectada. Los cambios se copian solos.");
    } catch (e) {
      showUserError(e);
      try {
        setStatus(await lanSyncGetStatus());
      } catch {
        /* el cartel de error ya quedó */
      }
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
    setPickerOpen(true);
    setSearchError("");
    setDiscovered([]);
    setPickedId("");
    setBusy(true);
    try {
      const list = await lanSyncDiscover(4);
      setDiscovered(list);
      setPickedId(list[0]?.device_id ?? "");
      if (!list.length) {
        setSearchError(
          "No aparece ninguna PC. Las dos tienen que estar en el mismo Wi‑Fi (la dirección de las dos empieza igual, por ejemplo 192.168.1.). En la principal apretá Compartir esta PC y aceptá el permiso de Windows.",
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSearchError(msg);
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
            Misma Wi‑Fi en las dos. En la principal, Compartir. En la caja, Buscar red, elegirla y
            Conectar. No hace falta internet.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-panel-border)] p-4 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Qué está pasando</p>
        <p className="mt-2 text-lg font-semibold text-ink">
          <StatusDot status={st} />
          {lanStatusLabel(st)}
          {role === "server" ? " · PC principal" : role === "client" ? " · Caja" : ""}
        </p>
        <p className="mt-2 break-words text-base text-ink">
          {status?.last_error
            ? status.last_error
            : connected
              ? "Las PCs se están copiando los datos."
              : "Todavía no está conectada."}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 min-w-0">
          <Diag label="Dirección de esta PC" value={status?.local_ip || "—"} />
          <Diag
            label={mode === "server" ? "Esta PC" : "Busca a la principal"}
            value={mode === "server" ? "Es la principal" : serverHost.trim() || "Todavía no eligió"}
          />
          <Diag label="Misma red" value={sameNetworkLabel(mode, status?.local_ip, serverHost)} />
          <Diag label="Clave" value={hasPsk(status) ? "Guardada" : "Falta escribirla"} />
          <Diag
            label="Cajas conectadas"
            value={role === "server" ? String(status?.clients_connected ?? 0) : "—"}
          />
          <Diag label="Última copia" value={status?.last_sync_at || "—"} />
        </dl>
      </div>

      <div className="min-w-0">
        <span className="mb-1.5 block text-sm font-medium text-ink-muted">Esta PC es…</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`min-w-0 rounded-xl border px-3 py-3 text-base font-semibold ${
              mode === "server"
                ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40"
                : "border-[var(--color-panel-border)]"
            }`}
            onClick={() => {
              markDirty("mode");
              setMode("server");
            }}
          >
            La principal
          </button>
          <button
            type="button"
            className={`min-w-0 rounded-xl border px-3 py-3 text-base font-semibold ${
              mode === "client"
                ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40"
                : "border-[var(--color-panel-border)]"
            }`}
            onClick={() => {
              markDirty("mode");
              setMode("client");
            }}
          >
            Una caja
          </button>
        </div>
      </div>

      <Input
        label="Clave"
        type="password"
        value={psk}
        onChange={(e) => {
          markDirty("psk");
          setPsk(e.target.value);
        }}
        placeholder="La misma en las dos PCs"
        hint={pskHint}
      />

      {mode === "server" ? (
        connected && role === "server" ? (
          <Button
            variant="danger"
            className="w-full py-3 text-base"
            loading={busy}
            onClick={() => void handleStopServer()}
          >
            Dejar de compartir
          </Button>
        ) : (
          <Button className="w-full py-3 text-base" loading={busy} onClick={() => void handleStartServer()}>
            Compartir esta PC
          </Button>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3 min-w-0">
          <Button
            className="w-full py-3 text-base"
            loading={busy}
            onClick={() => void connectWith(serverHost, port)}
          >
            Conectar
          </Button>
          <Button
            variant="secondary"
            className="w-full py-3 text-base"
            loading={busy}
            onClick={() => void handleDiscover()}
          >
            <Search size={18} /> Buscar red
          </Button>
        </div>
      )}

      {mode === "client" && connected && role === "client" && (
        <Button variant="ghost" loading={busy} onClick={() => void handleDisconnect()}>
          Desconectar
        </Button>
      )}

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

      {status && status.products_with_variants > 0 && (
        <Alert variant="warning">
          Hay {status.products_with_variants} producto(s) con variantes (talle/color). El stock por
          variante no se copia entre PCs; usá productos simples si necesitás stock sincronizado.
        </Alert>
      )}

      <details className="rounded-xl border border-[var(--color-panel-border)] p-3 min-w-0">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Más opciones</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 min-w-0">
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
            label="Código en el ticket"
            value={deviceCode}
            onChange={(e) => {
              markDirty("deviceCode");
              setDeviceCode(e.target.value.toUpperCase());
            }}
            placeholder="Ej. CJ01"
          />
          <Input
            label="Dirección de la principal"
            value={serverHost}
            onChange={(e) => {
              markDirty("serverHost");
              setServerHost(e.target.value);
            }}
            placeholder="La completa Buscar red"
          />
          <Input
            label="Puerto"
            type="number"
            value={port}
            onChange={(e) => {
              markDirty("port");
              setPort(e.target.value);
            }}
            hint="Dejalo en 48765"
          />
        </div>

      <div className="mt-3 rounded-xl border border-[var(--color-panel-border)] p-3 min-w-0 text-sm text-ink-muted">
        <p className="mb-1 text-xs font-semibold uppercase text-ink-muted">
          Módulos de taller sincronizados
        </p>
        <p>
          Además del catálogo y las ventas, se sincronizan automáticamente entre PCs:{" "}
          <strong>vehículos</strong>, <strong>turnos</strong>, <strong>presupuestos</strong>,{" "}
          <strong>órdenes de trabajo</strong>, <strong>remitos</strong> y{" "}
          <strong>peritajes</strong> y <strong>empleados/usuarios</strong> (mismo PIN y rol en
          todas las cajas). El stock de los ítems de OT/remito{" "}
          <em>no</em> se descuenta en la PC destino (viaja por movimientos de stock).
        </p>
      </div>

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

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" loading={busy} onClick={() => void handleTest()}>
          <Wifi size={16} /> Probar otra vez
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
      </details>

      <Modal
        open={pickerOpen}
        title="Redes encontradas"
        onClose={() => setPickerOpen(false)}
      >
        {busy && discovered.length === 0 ? (
          <p className="text-sm text-ink-muted">Buscando la PC principal en esta Wi‑Fi…</p>
        ) : discovered.length === 0 ? (
          <p className="break-words text-sm text-ink">{searchError || "No apareció ninguna PC."}</p>
        ) : (
          <div className="space-y-3 min-w-0">
            <p className="text-sm text-ink-muted">Elegí la PC principal y apretá Conectar.</p>
            <ul className="space-y-2">
              {discovered.map((d) => {
                const selected = pickedId === d.device_id;
                const same = status?.local_ip ? sharesLan(status.local_ip, d.host) : null;
                return (
                  <li key={d.device_id}>
                    <button
                      type="button"
                      className={`flex w-full min-w-0 flex-col gap-0.5 rounded-xl border px-3 py-3 text-left ${
                        selected
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                          : "border-[var(--color-panel-border)]"
                      }`}
                      onClick={() => setPickedId(d.device_id)}
                    >
                      <span className="truncate text-base font-semibold text-ink">
                        {d.name || "PC principal"}
                      </span>
                      <span className="truncate text-sm text-ink-muted">
                        {d.host}
                        {same === false ? " · otra red, no va a conectar" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button
              className="w-full py-3 text-base"
              loading={busy}
              disabled={!pickedId}
              onClick={() => {
                const picked = discovered.find((d) => d.device_id === pickedId);
                if (!picked) return;
                void connectWith(picked.host, String(picked.port));
              }}
            >
              Conectar
            </Button>
          </div>
        )}
      </Modal>

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

function sameNetworkLabel(mode: "server" | "client", localIp?: string | null, host?: string) {
  if (mode === "server") return "Esta PC comparte";
  if (!localIp || !host?.trim()) return "Todavía no se sabe";
  const same = sharesLan(localIp, host);
  if (same === true) return "Sí";
  if (same === false) return "No";
  return "Todavía no se sabe";
}

function Diag({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="break-words font-semibold text-ink">{value}</dd>
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
