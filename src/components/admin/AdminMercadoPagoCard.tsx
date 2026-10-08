import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, CreditCard, ExternalLink, Loader2, Unplug } from "lucide-react";
import { setSetting } from "../../db/settings";
import { copyToClipboard } from "../../lib/openExternal";
import {
  connectMpOauth,
  disconnectMpOauth,
  getMpConfigStatus,
  type MpConfigStatus,
} from "../../lib/posIntegrations";
import { Button, Card } from "../ui";
import { formatUserError } from "../../lib/userError";
import CollapsibleGuide from "../CollapsibleGuide";
import { usePlanEntitlements } from "../../hooks/usePlanEntitlements";
import PlanUpsellNotice from "../PlanUpsellNotice";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminMercadoPagoCard({ onFlash }: Props) {
  const { mercadoPago } = usePlanEntitlements();
  const [mpStatus, setMpStatus] = useState<MpConfigStatus | null>(null);
  const [mpConnecting, setMpConnecting] = useState(false);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);

  const reloadMpStatus = useCallback(() => {
    getMpConfigStatus()
      .then(setMpStatus)
      .catch(() =>
        setMpStatus({
          enabled: false,
          configured: false,
          simulation: false,
          oauth_connected: false,
          oauth_available: false,
          nickname: null,
        }),
      );
  }, []);

  useEffect(() => {
    reloadMpStatus();
    const onFocus = () => reloadMpStatus();
    window.addEventListener("focus", onFocus);
    let unlistenUrl: (() => void) | undefined;
    let unlistenDone: (() => void) | undefined;
    void listen<string>("mp-oauth-url", (event) => {
      if (event.payload) setOauthUrl(event.payload);
    }).then((fn) => {
      unlistenUrl = fn;
    });
    void listen("mp-oauth-connected", () => {
      reloadMpStatus();
      setMpConnecting(false);
      setOauthUrl(null);
    }).then((fn) => {
      unlistenDone = fn;
    });
    return () => {
      window.removeEventListener("focus", onFocus);
      unlistenUrl?.();
      unlistenDone?.();
    };
  }, [reloadMpStatus]);

  useEffect(() => {
    if (!mpConnecting) return;
    const id = window.setInterval(() => {
      getMpConfigStatus()
        .then((st) => {
          setMpStatus(st);
          if (st.oauth_connected && st.configured) {
            setMpConnecting(false);
            onFlash(
              st.nickname
                ? `Mercado Pago conectado como @${st.nickname}. Ya podés cobrar con QR.`
                : "Mercado Pago conectado. Ya podés cobrar con QR.",
            );
          }
        })
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(id);
  }, [mpConnecting, onFlash]);

  async function openOauthPage(url: string) {
    try {
      await invoke("open_https_link", { url });
    } catch (e) {
      await copyToClipboard(url);
      alert(
        `No se pudo abrir el navegador. El enlace quedó copiado: pegalo en Chrome o Edge.\n\n${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  async function copyOauthUrl(url: string) {
    await copyToClipboard(url);
    onFlash("Enlace copiado. Pegalo en Chrome o Edge.");
  }

  async function handleConnectMp() {
    setMpConnecting(true);
    setOauthUrl(null);
    try {
      await setSetting("mp_simulation", "0");
      if (!mpStatus?.oauth_connected) {
        await setSetting("mp_access_token", "");
        await setSetting("mp_external_pos_id", "");
      }
      const result = await connectMpOauth();
      await setSetting("mp_simulation", "0");
      reloadMpStatus();
      onFlash(`Mercado Pago conectado como ${result.nickname}. Ya podés cobrar con QR en el POS.`);
    } catch (e) {
      alert(formatUserError(e));
    } finally {
      setMpConnecting(false);
    }
  }

  async function handleDisconnectMp() {
    if (!confirm("¿Desvincular la cuenta de Mercado Pago de esta PC?")) return;
    try {
      await disconnectMpOauth();
      reloadMpStatus();
      onFlash("Mercado Pago desvinculado");
    } catch (e) {
      alert(formatUserError(e));
    }
  }

  async function toggleDemoMode(enabled: boolean) {
    await setSetting("mp_simulation", enabled ? "1" : "0");
    await setSetting("mp_enabled", enabled ? "1" : "0");
    if (enabled) {
      await setSetting("mp_access_token", "TEST");
      await setSetting("mp_external_pos_id", "DEMO");
    } else {
      await setSetting("mp_access_token", "");
      await setSetting("mp_external_pos_id", "");
    }
    reloadMpStatus();
    onFlash(
      enabled
        ? "Modo demostración activo: en el POS podés probar Mercado Pago QR sin cuenta real."
        : "Modo demostración desactivado",
    );
  }

  const oauthConnected =
    (mpStatus?.oauth_connected && mpStatus?.configured) ?? false;
  const oauthIncomplete =
    (mpStatus?.oauth_connected && !mpStatus?.configured) ?? false;
  const demoActive = mpStatus?.simulation ?? false;

  return (
    <Card>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <CreditCard size={18} className="text-brand-600 dark:text-brand-300" />
        Mercado Pago — cobro con QR
      </h3>
      {!mercadoPago ? (
        <PlanUpsellNotice feature="mercadoPago" className="mt-2" />
      ) : (
        <>
      <p className="mb-4 text-sm text-ink-muted">
        Vinculá tu cuenta de Mercado Pago para cobrar con QR en el punto de venta.
      </p>

      <CollapsibleGuide
        title="¿Cómo conectar Mercado Pago?"
        steps={[
          "Pulsá «Conectar con Mercado Pago».",
          "Iniciá sesión con tu cuenta de vendedor y autorizá la app.",
          "En el punto de venta elegí «Mercado Pago QR» al cobrar.",
        ]}
        className="mb-4"
      />

      {oauthIncomplete ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-ink">Cuenta autorizada, falta la caja QR</p>
          <p className="mt-1 text-xs text-ink-muted">
            Pulsá «Conectar» otra vez (dejá la app abierta) para crear la caja automáticamente.
          </p>
          <Button
            className="mt-3 w-full justify-center bg-[#009ee3] text-white hover:bg-[#0088c7] sm:w-auto"
            onClick={() => void handleConnectMp()}
            disabled={mpConnecting}
          >
            {mpConnecting ? (
              <>
                <Loader2 size={18} className="mr-2 animate-spin" />
                Completando vinculación…
              </>
            ) : (
              <>
                <ExternalLink size={18} className="mr-2" />
                Completar conexión
              </>
            )}
          </Button>
        </div>
      ) : oauthConnected ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              <div>
                <p className="font-semibold text-ink">Cuenta conectada</p>
                <p className="text-sm text-ink-muted">
                  {mpStatus?.nickname ? `@${mpStatus.nickname}` : "Mercado Pago vinculado"}
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => void handleDisconnectMp()}>
              <Unplug size={16} className="mr-1.5 inline" />
              Desvincular
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {mpStatus?.oauth_available ? (
            <>
              <Button
                className="w-full justify-center bg-[#009ee3] text-white hover:bg-[#0088c7] sm:w-auto"
                onClick={() => void handleConnectMp()}
                disabled={mpConnecting}
              >
                {mpConnecting ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Esperando autorización en el navegador…
                  </>
                ) : (
                  <>
                    <ExternalLink size={18} className="mr-2" />
                    Conectar con Mercado Pago
                  </>
                )}
              </Button>
              {mpConnecting && (
                <div className="space-y-2">
                  <p className="text-xs text-ink-muted">
                    Completá el login en el navegador. Esta pantalla se actualiza sola.
                  </p>
                  {oauthUrl && (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full justify-center sm:w-auto"
                        onClick={() => void openOauthPage(oauthUrl)}
                      >
                        <ExternalLink size={16} className="mr-2" />
                        Abrir Mercado Pago en el navegador
                      </Button>
                      <p className="break-all text-[11px] text-ink-muted">{oauthUrl}</p>
                      <button
                        type="button"
                        className="text-xs text-brand-600 hover:underline"
                        onClick={() => void copyOauthUrl(oauthUrl)}
                      >
                        Copiar enlace
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-ink">
              Instalá el instalador oficial de Waltech (no una copia sin credenciales) o contactá
              soporte.
            </div>
          )}
        </div>
      )}

      {!oauthConnected && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-panel-border)] p-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={demoActive}
            onChange={(e) => void toggleDemoMode(e.target.checked)}
            disabled={mpConnecting}
          />
          <span>
            <span className="block text-sm font-medium text-ink">Probar cobro QR (demostración)</span>
            <span className="block text-xs text-ink-muted">
              Sin cuenta real. El QR se aprueba solo en unos segundos.
            </span>
          </span>
        </label>
      )}
        </>
      )}
    </Card>
  );
}
