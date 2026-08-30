import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, QrCode } from "lucide-react";
import { getSetting, setSetting } from "../../db/settings";
import {
  getPaywayConfigStatus,
  testPaywayConnection,
  type PaywayConfigStatus,
} from "../../lib/posIntegrations";
import { Button, Card, Input } from "../ui";
import CollapsibleGuide from "../CollapsibleGuide";
import { usePlanEntitlements } from "../../hooks/usePlanEntitlements";
import PlanUpsellNotice from "../PlanUpsellNotice";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminPaywayCard({ onFlash }: Props) {
  const { mercadoPago } = usePlanEntitlements();
  const [status, setStatus] = useState<PaywayConfigStatus | null>(null);
  const [apiKeyPublic, setApiKeyPublic] = useState("");
  const [apiKeySecret, setApiKeySecret] = useState("");
  const [cuitOwner, setCuitOwner] = useState("");
  const [merchantCuit, setMerchantCuit] = useState("");
  const [branchOffice, setBranchOffice] = useState("");
  const [checkout, setCheckout] = useState("");
  const [sandbox, setSandbox] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const reloadStatus = useCallback(() => {
    getPaywayConfigStatus()
      .then(setStatus)
      .catch(() =>
        setStatus({
          enabled: false,
          configured: false,
          simulation: false,
          sandbox: true,
        }),
      );
  }, []);

  useEffect(() => {
    reloadStatus();
    void Promise.all([
      getSetting("payway_api_key_public"),
      getSetting("payway_api_key_secret"),
      getSetting("payway_cuit_owner"),
      getSetting("payway_merchant_cuit"),
      getSetting("payway_branch_office"),
      getSetting("payway_checkout"),
      getSetting("payway_sandbox"),
    ]).then(([pub, sec, owner, cuit, branch, chk, sb]) => {
      setApiKeyPublic(pub ?? "");
      setApiKeySecret(sec ?? "");
      setCuitOwner(owner ?? "");
      setMerchantCuit(cuit ?? "");
      setBranchOffice(branch ?? "");
      setCheckout(chk ?? "");
      setSandbox(sb !== "0");
    });
  }, [reloadStatus]);

  async function saveCredentials() {
    setSaving(true);
    try {
      await setSetting("payway_api_key_public", apiKeyPublic.trim());
      await setSetting("payway_api_key_secret", apiKeySecret.trim());
      await setSetting("payway_cuit_owner", cuitOwner.trim());
      await setSetting("payway_merchant_cuit", merchantCuit.trim());
      await setSetting("payway_branch_office", branchOffice.trim());
      await setSetting("payway_checkout", checkout.trim());
      await setSetting("payway_sandbox", sandbox ? "1" : "0");
      await setSetting("payway_production", sandbox ? "0" : "1");
      reloadStatus();
      onFlash("Credenciales Payway guardadas");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(enabled: boolean) {
    await setSetting("payway_enabled", enabled ? "1" : "0");
    reloadStatus();
    onFlash(enabled ? "Payway QR activado en caja" : "Payway QR desactivado");
  }

  async function toggleDemoMode(enabled: boolean) {
    await setSetting("payway_simulation", enabled ? "1" : "0");
    await setSetting("payway_enabled", enabled ? "1" : "0");
    reloadStatus();
    onFlash(
      enabled
        ? "Modo demostración Payway: en el POS podés probar sin API real."
        : "Modo demostración Payway desactivado",
    );
  }

  async function handleTestConnection() {
    setTesting(true);
    try {
      const result = await testPaywayConnection();
      onFlash(result.message);
    } catch (e) {
      onFlash(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }

  const demoActive = status?.simulation ?? false;
  const enabled = status?.enabled ?? false;

  return (
    <Card>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <QrCode size={18} className="text-brand-600 dark:text-brand-300" />
        Payway / Prisma — QR interoperable
      </h3>
      {!mercadoPago ? (
        <PlanUpsellNotice feature="mercadoPago" className="mt-2" />
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-muted">
            Cobrá con QR interoperable (bancos, MODO, billeteras) vía Payway/Prisma. Requiere API
            Decidir QR Services del portal de desarrolladores y alta comercial del comercio.
          </p>

          <CollapsibleGuide
            title="¿Cómo configurar Payway QR?"
            steps={[
              "Creá un proyecto en portal.developers.prismamediosdepago.com con Payments - Decidir QR Services.",
              "Pegá API key pública y secreta (sandbox primero).",
              "Completá CUIT del comercio, sucursal y caja (datos Payway del local).",
              "En caja elegí «Payway QR» al cobrar.",
            ]}
            className="mb-4"
          />

          {enabled && status?.configured && !demoActive && (
            <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <div>
                  <p className="font-semibold text-ink">Listo para cobrar</p>
                  <p className="text-sm text-ink-muted">
                    {status.sandbox ? "Ambiente sandbox" : "Ambiente producción"}
                  </p>
                </div>
              </div>
            </div>
          )}

          <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--color-panel-border)] p-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => void toggleEnabled(e.target.checked)}
              disabled={demoActive}
            />
            <span className="text-sm font-medium text-ink">Activar Payway QR en el punto de venta</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="API key pública"
              value={apiKeyPublic}
              onChange={(e) => setApiKeyPublic(e.target.value)}
              placeholder="Del portal Prisma"
              autoComplete="off"
            />
            <Input
              label="API key secreta"
              type="password"
              value={apiKeySecret}
              onChange={(e) => setApiKeySecret(e.target.value)}
              placeholder="Del portal Prisma"
              autoComplete="off"
            />
            <Input
              label="CUIT comercio"
              value={merchantCuit}
              onChange={(e) => setMerchantCuit(e.target.value)}
              placeholder="20123456789"
            />
            <Input
              label="Cuit-Owner (header API)"
              value={cuitOwner}
              onChange={(e) => setCuitOwner(e.target.value)}
              placeholder="Igual al CUIT si no sabés"
            />
            <Input
              label="Sucursal (branch_office)"
              value={branchOffice}
              onChange={(e) => setBranchOffice(e.target.value)}
              placeholder="0001"
            />
            <Input
              label="Caja (checkout)"
              value={checkout}
              onChange={(e) => setCheckout(e.target.value)}
              placeholder="0001"
            />
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={sandbox}
              onChange={(e) => setSandbox(e.target.checked)}
            />
            <span>Usar sandbox (api-sandbox.prismamediosdepago.com)</span>
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void saveCredentials()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar credenciales"}
            </Button>
            <Button variant="secondary" onClick={() => void handleTestConnection()} disabled={testing}>
              {testing ? (
                <>
                  <Loader2 size={16} className="mr-1.5 inline animate-spin" />
                  Probando…
                </>
              ) : (
                "Probar conexión"
              )}
            </Button>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-panel-border)] p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={demoActive}
              onChange={(e) => void toggleDemoMode(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-ink">Probar cobro QR (demostración)</span>
              <span className="block text-xs text-ink-muted">
                Sin API real. El QR se aprueba solo en unos segundos.
              </span>
            </span>
          </label>
        </>
      )}
    </Card>
  );
}
