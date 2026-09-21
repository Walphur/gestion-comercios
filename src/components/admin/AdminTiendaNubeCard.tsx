import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  CheckCircle2,
  CloudDownload,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShoppingBag,
  Unplug,
} from "lucide-react";
import {
  connectTnOauth,
  disconnectTn,
  getTnConfigStatus,
  saveTnManualCredentials,
  setTnSyncStock,
  tnFlushStock,
  tnImportProducts,
  tnSyncOrders,
  type TnConfigStatus,
} from "../../lib/tiendaNube";
import { Button, Card, Input } from "../ui";
import CollapsibleGuide from "../CollapsibleGuide";
import { usePlanEntitlements } from "../../hooks/usePlanEntitlements";
import PlanUpsellNotice from "../PlanUpsellNotice";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminTiendaNubeCard({ onFlash }: Props) {
  const { tiendaNube } = usePlanEntitlements();
  const [status, setStatus] = useState<TnConfigStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [storeId, setStoreId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showManual, setShowManual] = useState(false);

  const reload = useCallback(() => {
    getTnConfigStatus()
      .then(setStatus)
      .catch(() =>
        setStatus({
          enabled: false,
          connected: false,
          oauth_available: false,
          sync_stock: true,
          store_id: null,
          store_name: null,
          last_import_at: null,
          last_order_sync_at: null,
          mapped_products: 0,
          outbox_pending: 0,
        }),
      );
  }, []);

  useEffect(() => {
    reload();
    let unlisten: (() => void) | undefined;
    void listen("tn-oauth-connected", () => {
      reload();
      setConnecting(false);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [reload]);

  async function handleOauth() {
    setConnecting(true);
    try {
      const result = await connectTnOauth();
      reload();
      onFlash(`Tienda Nube conectada: ${result.store_name}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  async function handleManual() {
    setBusy("manual");
    try {
      const result = await saveTnManualCredentials(storeId, accessToken);
      setAccessToken("");
      setShowManual(false);
      reload();
      onFlash(`Tienda Nube conectada: ${result.store_name}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    if (!confirm("¿Desvincular Tienda Nube de esta PC?")) return;
    try {
      await disconnectTn();
      reload();
      onFlash("Tienda Nube desvinculada");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleImport() {
    setBusy("import");
    try {
      const r = await tnImportProducts();
      reload();
      const extra =
        r.errors.length > 0 ? ` · ${r.errors.length} aviso(s)` : "";
      onFlash(
        `Importación TN: ${r.inserted} nuevos, ${r.updated} actualizados, ${r.skipped} omitidos${extra}`,
      );
      if (r.errors.length > 0) {
        console.warn("Tienda Nube import errors", r.errors.slice(0, 20));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleSyncOrders() {
    setBusy("orders");
    try {
      const r = await tnSyncOrders();
      reload();
      onFlash(
        `Ventas online: ${r.orders_processed} órdenes, ${r.stock_deducted} ítems descontados`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleFlush() {
    setBusy("flush");
    try {
      const r = await tnFlushStock();
      reload();
      onFlash(`Stock enviado a TN: ${r.pushed} ok` + (r.failed ? `, ${r.failed} error(es)` : ""));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggleSync(enabled: boolean) {
    await setTnSyncStock(enabled);
    reload();
    onFlash(enabled ? "Sync de stock activado" : "Sync de stock pausado");
  }

  const connected = status?.connected ?? false;

  return (
    <Card>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <ShoppingBag size={18} className="text-brand-600 dark:text-brand-300" />
        Tienda Nube — productos y stock
      </h3>
      {!tiendaNube ? (
        <PlanUpsellNotice feature="tiendaNube" className="mt-2" />
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-muted">
            Sincronizá el catálogo y el stock entre WalQo (mostrador) y tu tienda online.
            El stock del local manda: al vender en el POS se actualiza Tienda Nube; las ventas
            online se descuentan acá.
          </p>

          <CollapsibleGuide
            title="¿Cómo conectar?"
            steps={[
              "Pulsá «Conectar con Tienda Nube»: se abre el navegador, iniciás sesión y autorizás WalQo.",
              "La app guarda sola el Store ID y el Access Token: no hace falta pegarlos a mano.",
              "Después tocá «Importar productos» y dejá activo el sync de stock.",
              "Solo si OAuth no está disponible en tu instalador, usá la conexión manual (Store ID + Token).",
            ]}
            className="mb-4"
          />

          {connected ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">Tienda conectada</p>
                      <p className="truncate text-sm text-ink-muted">
                        {status?.store_name || "Tienda Nube"}
                        {status?.store_id ? ` · ID ${status.store_id}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {status?.mapped_products ?? 0} productos vinculados
                        {(status?.outbox_pending ?? 0) > 0
                          ? ` · ${status?.outbox_pending} pendientes de enviar`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => void handleDisconnect()}>
                    <Unplug size={16} className="mr-1.5 inline" />
                    Desvincular
                  </Button>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-panel-border)] p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={status?.sync_stock ?? true}
                  onChange={(e) => void toggleSync(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium text-ink">
                    Sincronizar stock automáticamente
                  </span>
                  <span className="block text-xs text-ink-muted">
                    Ventas del POS → TN. Ventas online → descuento en WalQo (cada ~90 s).
                  </span>
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void handleImport()}
                  disabled={busy !== null}
                  className="justify-center"
                >
                  {busy === "import" ? (
                    <Loader2 size={16} className="mr-1.5 animate-spin" />
                  ) : (
                    <CloudDownload size={16} className="mr-1.5" />
                  )}
                  Importar productos
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void handleSyncOrders()}
                  disabled={busy !== null}
                >
                  {busy === "orders" ? (
                    <Loader2 size={16} className="mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw size={16} className="mr-1.5" />
                  )}
                  Traer ventas online
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void handleFlush()}
                  disabled={busy !== null}
                >
                  {busy === "flush" ? (
                    <Loader2 size={16} className="mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw size={16} className="mr-1.5" />
                  )}
                  Enviar stock ahora
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {status?.oauth_available ? (
                <Button
                  className="w-full justify-center sm:w-auto"
                  onClick={() => void handleOauth()}
                  disabled={connecting}
                >
                  {connecting ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Esperando autorización…
                    </>
                  ) : (
                    <>
                      <ExternalLink size={18} className="mr-2" />
                      Conectar con Tienda Nube
                    </>
                  )}
                </Button>
              ) : null}

              <button
                type="button"
                className="text-sm text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
                onClick={() => setShowManual((v) => !v)}
              >
                {showManual ? "Ocultar conexión manual" : "Conectar con Store ID + Access Token"}
              </button>

              {showManual || !status?.oauth_available ? (
                <div className="space-y-3 rounded-xl border border-[var(--color-panel-border)] p-3">
                  <Input
                    label="Store ID"
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    placeholder="Ej. 1234567"
                  />
                  <Input
                    label="Access Token"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="Token de la app instalada"
                    type="password"
                  />
                  <Button
                    className="w-full justify-center sm:w-auto"
                    onClick={() => void handleManual()}
                    disabled={busy === "manual"}
                  >
                    {busy === "manual" ? (
                      <Loader2 size={16} className="mr-1.5 animate-spin" />
                    ) : null}
                    Guardar y conectar
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
