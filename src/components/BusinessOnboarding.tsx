import { useMemo, useState } from "react";
import { Store } from "lucide-react";
import { Button, Input } from "./ui";
import { useAppConfig } from "../context/AppConfig";
import { RUBROS } from "../config/rubros";
import { getSetting, setSetting } from "../db/settings";
import type { Rubro } from "../types";

interface Props {
  onFinished: () => void;
}

export async function fetchBusinessOnboardingNeeded(): Promise<boolean> {
  try {
    const done = await getSetting("first_run_setup_done");
    if (done === "1") return false;
    const name = (await getSetting("business_name"))?.trim() || "";
    // Instalación ya en uso: no volver a pedir el alta.
    if (name && name !== "Mi Comercio") {
      await setSetting("first_run_setup_done", "1");
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export default function BusinessOnboarding({ onFinished }: Props) {
  const cfg = useAppConfig();
  const [name, setName] = useState(cfg.businessName === "Mi Comercio" ? "" : cfg.businessName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [rubro, setRubro] = useState<Rubro>(cfg.rubro);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rubroList = useMemo(
    () => Object.values(RUBROS).sort((a, b) => a.label.localeCompare(b.label, "es")),
    [],
  );

  async function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Indicá el nombre del comercio.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await cfg.setBusinessName(trimmed);
      await cfg.setRubro(rubro);
      if (phone.trim()) await setSetting("business_phone", phone.trim());
      if (email.trim()) await setSetting("business_email", email.trim());
      // Módulos Pro quedan destildados: el usuario los activa en Configuración si los necesita.

      await setSetting("first_run_setup_done", "1");
      onFinished();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-brand-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] shadow-2xl">
        <div className="border-b border-[var(--color-panel-border)] px-6 py-5">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-700 dark:text-brand-300">
            <Store size={22} />
          </div>
          <h2 className="font-display text-xl font-semibold text-ink">Configurá tu comercio</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Nombre, contacto y tipo de negocio. Así la app se adapta a tu rubro desde el primer día.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <Input
            label="Nombre del comercio"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Agüero Repuestos"
            autoFocus
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Teléfono (opcional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="11 1234-5678"
            />
            <Input
              label="Email (opcional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contacto@comercio.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">¿Para qué tipo de negocio?</label>
            <select
              className="wt-field wt-select w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-sm text-ink"
              value={rubro}
              onChange={(e) => setRubro(e.target.value as Rubro)}
            >
              {rubroList.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-ink-muted">{RUBROS[rubro].description}</p>
          </div>

          {error && (
            <p className="rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end border-t border-[var(--color-panel-border)] px-6 py-4">
          <Button onClick={() => void handleContinue()} loading={saving} disabled={saving}>
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
