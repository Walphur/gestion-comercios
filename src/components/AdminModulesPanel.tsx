import { useState } from "react";
import { KeyRound, Sparkles } from "lucide-react";
import {
  BASIC_PLAN_FEATURES,
  PRO_MODULES,
  type ProModuleKey,
} from "../config/modules";
import { useAppConfig } from "../context/AppConfig";
import { useLicense } from "../context/LicenseContext";
import { planLabel } from "../lib/license";
import { Button, Input, Switch } from "./ui";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminModulesPanel({ onFlash }: Props) {
  const cfg = useAppConfig();
  const { status, activate } = useLicense();
  const licensedPro = status?.pro_enabled ?? false;
  const plan = status?.plan ?? "none";
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [upgrading, setUpgrading] = useState(false);

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
      <div className="rounded-xl border border-[var(--color-panel-border)] bg-slate-50/60 p-4 dark:bg-slate-900/30">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <KeyRound size={16} className="text-brand-600 dark:text-brand-300" />
          Tu licencia
        </p>
        <div className="mt-2 grid gap-1 text-xs text-ink-muted">
          <p>
            Plan: <span className="font-medium text-ink">{planLabel(plan)}</span>
            {status?.key_mask ? ` · ${status.key_mask}` : null}
          </p>
          <p>
            PCs permitidas: <span className="font-medium text-ink">{status?.max_devices ?? 1}</span>
          </p>
          {status?.offline_grace_days_left != null && (
            <p>
              Uso offline restante:{" "}
              <span className="font-medium text-ink">{status.offline_grace_days_left} días</span>
            </p>
          )}
        </div>

        {!showUpgrade ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-4 w-full sm:w-auto"
            onClick={() => setShowUpgrade(true)}
          >
            {licensedPro ? "Cambiar licencia" : "Actualizar a Pro / cambiar licencia"}
          </Button>
        ) : (
          <div className="mt-4 space-y-3 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3">
            <p className="text-xs text-ink-muted">
              Ingresá la nueva clave de compra. Reemplaza la licencia actual en esta PC (por ejemplo
              Básico → Pro). La clave anterior queda usada; la nueva se vincula acá.
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
        )}
      </div>

      <div className="rounded-xl border border-[var(--color-panel-border)] bg-brand-50/40 p-4 dark:bg-brand-900/20">
        <p className="text-sm font-semibold text-ink">Plan Básico</p>
        <p className="mt-1 text-xs text-ink-muted">
          Incluido con la licencia Básica — kiosco, farmacia, ferretería, pet shop, etc.
        </p>
        <ul className="mt-3 space-y-1 text-xs text-ink-muted">
          {BASIC_PLAN_FEATURES.map((f) => (
            <li key={f}>· {f}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-brand-300/60 bg-gradient-to-br from-brand-50/80 to-transparent p-4 dark:border-brand-700 dark:from-brand-900/30">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Sparkles size={16} className="text-brand-600 dark:text-brand-300" />
              Plan Pro
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Turnos, presupuestos, remitos, órdenes de servicio y rubros de servicios (taller,
              estética, clínica).
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
              licensedPro
                ? "bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200"
                : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {licensedPro ? "Activo" : "No incluido"}
          </span>
        </div>

        {licensedPro && cfg.proPlanEnabled && (
          <div className="mt-4 divide-y divide-[var(--color-panel-border)] border-t border-[var(--color-panel-border)] pt-4">
            {PRO_MODULES.map((m) => (
              <div key={m.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{m.label}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{m.description}</p>
                </div>
                <Switch
                  checked={cfg.proModules[m.key as ProModuleKey]}
                  onChange={(v) => {
                    void cfg.setProModule(m.key, v).then(() =>
                      onFlash(v ? `${m.label} activado` : `${m.label} desactivado`),
                    );
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {!licensedPro && (
          <p className="mt-4 border-t border-[var(--color-panel-border)] pt-4 text-xs text-ink-muted">
            Comprá la licencia Pro y usá el botón de arriba para ingresar la nueva clave en esta PC.
          </p>
        )}
      </div>
    </div>
  );
}
