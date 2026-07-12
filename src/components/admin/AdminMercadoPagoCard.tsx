import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, CreditCard, ExternalLink, Loader2, Unplug } from "lucide-react";
import { setSetting } from "../../db/settings";
import {
  connectMpOauth,
  disconnectMpOauth,
  getMpConfigStatus,
  type MpConfigStatus,
} from "../../lib/posIntegrations";
import { Button, Card } from "../ui";
import CollapsibleGuide from "../CollapsibleGuide";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminMercadoPagoCard({ onFlash }: Props) {
  const [mpStatus, setMpStatus] = useState<MpConfigStatus | null>(null);
  const [mpConnecting, setMpConnecting] = useState(false);

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
    let unlisten: (() => void) | undefined;
    void listen("mp-oauth-connected", () => {
      reloadMpStatus();
      setMpConnecting(false);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      window.removeEventListener("focus", onFocus);
      unlisten?.();
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

  async function handleConnectMp() {
    setMpConnecting(true);
    try {
      const result = await connectMpOauth();
      await setSetting("mp_simulation", "0");
      reloadMpStatus();
      onFlash(`Mercado Pago conectado como ${result.nickname}. Ya podés cobrar con QR en el POS.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
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
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleDemoMode(enabled: boolean) {
    await setSetting("mp_simulation", enabled ? "1" : "0");
    await setSetting("mp_enabled", enabled ? "1" : "0");
    if (enabled) {
      await setSetting("mp_access_token", "TEST");
      await setSetting("mp_external_pos_id", "DEMO");
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
            disabled={mpConnecting || demoActive}
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
                disabled={mpConnecting || demoActive}
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
                <p className="text-xs text-ink-muted">
                  Completá el login en el navegador. Esta pantalla se actualiza sola.
                </p>
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
    </Card>
  );
}
