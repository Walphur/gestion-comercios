import { useMemo, useState } from "react";
import { Check, KeyRound, Sparkles } from "lucide-react";
import { PRO_MODULES, getProModuleNavLabel, type ProModuleKey } from "../config/modules";
import { resolvePlanEntitlements } from "../config/planEntitlements";
import {
  FREE_MAX_PRODUCTS,
  FREE_MAX_SALES_PER_MONTH,
  PRICE_BASIC_MONTHLY_ARS,
  PRICE_BASIC_ONETIME_ARS,
  PRICE_PRO_MONTHLY_ARS,
  formatPriceArs,
} from "../config/pricing";
import { useAppConfig } from "../context/AppConfig";
import { useLicense } from "../context/LicenseContext";
import { planLabel } from "../lib/license";
import { billingLabel, formatExpiryDate } from "../lib/licenseDisplay";
import { openHelpCenter, openSalesWhatsApp, openVirtualAssist } from "../lib/supportContact";
import { Button, Input, Switch } from "./ui";

interface Props {
  onFlash: (msg: string) => void;
}

type PackageId = "free" | "permanent" | "standard" | "pro" | "trial";

function resolvePackageId(status: {
  plan: string;
  billing: string;
  pro_enabled: boolean;
  is_trial: boolean;
} | null): PackageId {
  if (!status) return "free";
  if (status.is_trial || status.billing === "trial" || status.plan === "trial") return "trial";
  if (status.plan === "free" || status.billing === "free") return "free";
  if (status.billing === "perpetual") return "permanent";
  if (status.pro_enabled || status.plan === "pro") return "pro";
  return "standard";
}

const PACKAGE_TITLE: Record<PackageId, string> = {
  free: "Plan Gratis",
  permanent: "Licencia Permanente",
  standard: "Plan Estándar mensual",
  pro: "Plan Pro+",
  trial: "Prueba Pro (7 días)",
};

export default function AdminModulesPanel({ onFlash }: Props) {
  const cfg = useAppConfig();
  const { status, activate } = useLicense();
  const entitlements = useMemo(() => resolvePlanEntitlements(status), [status]);
  const packageId = resolvePackageId(status);
  const licensedPro = status?.pro_enabled ?? false;
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [upgrading, setUpgrading] = useState(false);

  const currentFeatures = useMemo(() => {
    const list: string[] = [
      "Punto de venta, stock, clientes y caja",
      packageId === "free"
        ? `Hasta ${FREE_MAX_PRODUCTS} productos y ${FREE_MAX_SALES_PER_MONTH} ventas/mes`
        : "Productos y ventas ilimitados",
    ];
    if (entitlements.autoUpdates) list.push("Actualizaciones automáticas");
    else list.push("Sin actualizaciones (versión fija)");
    if (entitlements.catalogSuper) list.push("Catálogo ~200.000 productos");
    if (entitlements.facturaIa) list.push("Facturas IA");
    if (entitlements.mercadoPago) list.push("Cobro Mercado Pago desde la PC");
    if (entitlements.whatsappDailyReport) list.push("Resumen del día por WhatsApp");
    if (entitlements.appearanceEdit) list.push("Apariencia y branding en tickets");
    if (entitlements.unlimitedStaff) list.push("Usuarios ilimitados");
    else list.push("Admin + 1 cajero");
    list.push(`Hasta ${status?.max_devices ?? entitlements.maxDevicesDefault} PC(s)`);
    if (entitlements.invoicingArca) list.push("Facturación electrónica ARCA");
    if (entitlements.proModules) list.push("Módulos Pro (turnos, presupuestos, remitos, órdenes)");
    if (entitlements.virtualAssist) list.push("Asistencia virtual por WhatsApp");
    else if (packageId === "permanent") list.push("Centro de ayuda (sin asistencia virtual)");
    else list.push("Centro de ayuda y tutoriales");
    return list;
  }, [entitlements, packageId, status?.max_devices]);

  async function handleUpgradeLicense() {
    const key = newKey.trim();
    if (key.length < 8) {
      onFlash("Ingresá una clave válida");
      return;
    }
    setUpgrading(true);
    try {
      const next = await activate(key);
      if (!next.active) {
        onFlash(next.message ?? "No se pudo activar la licencia");
        return;
      }
      await cfg.reload();
      setNewKey("");
      setShowUpgrade(false);
      onFlash(
        next.pro_enabled
          ? `Licencia ${planLabel(next.plan)} activada. Rubros y módulos Pro habilitados.`
          : `Licencia ${planLabel(next.plan)} actualizada.`,
      );
    } catch (e) {
      onFlash(e instanceof Error ? e.message : "Error al actualizar licencia");
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border-2 border-brand-400/70 bg-gradient-to-br from-brand-50/90 to-transparent p-4 dark:border-brand-600 dark:from-brand-900/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <KeyRound size={16} className="text-brand-600 dark:text-brand-300" />
            Tu plan actual
          </p>
          <span className="rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
            {PACKAGE_TITLE[packageId]}
          </span>
        </div>

        <div className="mt-3 grid gap-1 text-xs text-ink-muted">
          <p>
            Plan: <span className="font-medium text-ink">{planLabel(status?.plan ?? "none")}</span>
            {status?.key_mask ? ` · ${status.key_mask}` : null}
          </p>
          <p>
            Tipo:{" "}
            <span className="font-medium text-ink">{billingLabel(status?.billing ?? "none")}</span>
          </p>
          {status?.is_trial && status.trial_days_left != null && (
            <p className="text-amber-700 dark:text-amber-300">
              Prueba: {status.trial_days_left} día(s) restante(s)
            </p>
          )}
          {status?.expires_at != null && !status.is_trial && (
            <p>
              Vence:{" "}
              <span className="font-medium text-ink">{formatExpiryDate(status.expires_at)}</span>
              {status.days_until_expiry != null && status.days_until_expiry <= 7 && (
                <span className="ml-1 text-amber-600">({status.days_until_expiry} días)</span>
              )}
            </p>
          )}
          <p>
            PCs: <span className="font-medium text-ink">{status?.max_devices ?? 1}</span>
          </p>
        </div>

        <ul className="mt-4 space-y-1.5">
          {currentFeatures.map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs text-ink">
              <Check size={14} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          {entitlements.virtualAssist && (
            <Button type="button" variant="secondary" onClick={() => void openVirtualAssist()}>
              Asistencia virtual
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => openHelpCenter()}>
            Centro de ayuda
          </Button>
          {!showUpgrade ? (
            <Button type="button" variant="secondary" onClick={() => setShowUpgrade(true)}>
              Cambiar licencia
            </Button>
          ) : null}
        </div>

        {showUpgrade ? (
          <div className="mt-4 space-y-3 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3">
            <p className="text-xs text-ink-muted">
              Ingresá una nueva clave. Reemplaza la licencia actual en esta PC.
            </p>
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              placeholder="GC-XXXX-XXXX-XXXX"
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={upgrading || newKey.trim().length < 8}
                onClick={() => void handleUpgradeLicense()}
              >
                {upgrading ? "Activando…" : "Activar nueva licencia"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={upgrading}
                onClick={() => {
                  setShowUpgrade(false);
                  setNewKey("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {licensedPro && (
        <div className="rounded-xl border border-brand-300/60 bg-[var(--color-panel)] p-4 dark:border-brand-700">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Sparkles size={16} className="text-brand-600 dark:text-brand-300" />
            Módulos Pro activos
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Podés apagar los que no uses; siguen incluidos en tu licencia.
          </p>
          {cfg.proPlanEnabled ? (
            <div className="mt-4 divide-y divide-[var(--color-panel-border)] border-t border-[var(--color-panel-border)] pt-2">
              {PRO_MODULES.map((m) => {
                const label = getProModuleNavLabel(m.key, cfg.rubro);
                return (
                <div
                  key={m.key}
                  className="flex items-start justify-between gap-4 py-3 first:pt-3 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{label}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{m.description}</p>
                  </div>
                  <Switch
                    checked={cfg.proModules[m.key as ProModuleKey]}
                    onChange={(v) => {
                      void cfg.setProModule(m.key, v).then(() =>
                        onFlash(v ? `${label} activado` : `${label} desactivado`),
                      );
                    }}
                  />
                </div>
              );
              })}
            </div>
          ) : (
            <div className="mt-3">
              <Button
                type="button"
                onClick={() =>
                  void cfg.setProPlanEnabled(true).then(() => onFlash("Módulos Pro habilitados"))
                }
              >
                Activar módulos Pro en el menú
              </Button>
            </div>
          )}
        </div>
      )}

      {packageId !== "pro" && packageId !== "trial" && (
        <div className="rounded-xl border border-[var(--color-panel-border)] p-4">
          <p className="text-sm font-semibold text-ink">Otros planes</p>
          <p className="mt-1 text-xs text-ink-muted">
            Compará sin confundir con tu plan actual ({PACKAGE_TITLE[packageId]}).
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {packageId !== "free" && (
              <div className="rounded-lg border border-[var(--color-panel-border)] bg-slate-50/50 p-3 dark:bg-slate-900/20">
                <p className="text-xs font-semibold text-ink">Gratis</p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  {FREE_MAX_PRODUCTS} productos · {FREE_MAX_SALES_PER_MONTH} ventas/mes
                </p>
              </div>
            )}
            {packageId !== "permanent" && (
              <div className="rounded-lg border border-[var(--color-panel-border)] bg-slate-50/50 p-3 dark:bg-slate-900/20">
                <p className="text-xs font-semibold text-ink">
                  Permanente · {formatPriceArs(PRICE_BASIC_ONETIME_ARS)}
                </p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  1 PC · sin updates ni catálogo 200k
                </p>
              </div>
            )}
            {packageId !== "standard" && (
              <div className="rounded-lg border border-[var(--color-panel-border)] bg-slate-50/50 p-3 dark:bg-slate-900/20">
                <p className="text-xs font-semibold text-ink">
                  Estándar mensual · {formatPriceArs(PRICE_BASIC_MONTHLY_ARS)}/mes
                </p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  2 PCs · updates · catálogo · MP · Facturas IA
                </p>
              </div>
            )}
            <div className="rounded-lg border border-brand-300/50 bg-brand-50/40 p-3 dark:bg-brand-900/20">
              <p className="text-xs font-semibold text-ink">
                Pro+ · {formatPriceArs(PRICE_PRO_MONTHLY_ARS)}/mes
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                3 PCs · ARCA · turnos · presupuestos · remitos
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-2"
                onClick={() =>
                  void openSalesWhatsApp(
                    "Hola! Quiero pasar al plan Pro+ de WalQo.",
                  )
                }
              >
                Consultar Pro+
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
