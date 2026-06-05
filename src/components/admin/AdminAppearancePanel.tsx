import { ImagePlus, Trash2 } from "lucide-react";
import { Button, Input } from "../ui";
import { useAppearance } from "../../context/AppearanceContext";
import { useAppConfig } from "../../context/AppConfig";
import { useTheme } from "../../context/ThemeContext";
import { BRAND_PRESETS } from "../../config/branding";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminAppearancePanel({ onFlash }: Props) {
  const app = useAppearance();
  const cfg = useAppConfig();
  const { theme, setTheme } = useTheme();

  async function handleLogoUpload() {
    try {
      await app.uploadLogo();
      onFlash("Logo guardado");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-sm font-semibold text-ink">Identidad</h4>
        <p className="mt-1 text-xs text-ink-muted">Nombre y moneda del comercio.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Nombre del comercio"
            defaultValue={cfg.businessName}
            onBlur={(e) => {
              void cfg.setBusinessName(e.target.value).then(() => onFlash("Guardado"));
            }}
          />
          <Input
            label="Símbolo de moneda"
            defaultValue={cfg.currency}
            onBlur={(e) => {
              void cfg.setCurrency(e.target.value).then(() => onFlash("Guardado"));
            }}
          />
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-ink">Tema</h4>
        <div className="mt-3 inline-flex rounded-xl border border-[var(--color-panel-border)] bg-brand-50 p-1 dark:bg-brand-900/40">
          <button
            type="button"
            onClick={() => void setTheme("light")}
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
              theme === "light" ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted"
            }`}
          >
            Claro
          </button>
          <button
            type="button"
            onClick={() => void setTheme("dark")}
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
              theme === "dark" ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted"
            }`}
          >
            Oscuro
          </button>
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-ink">Color principal</h4>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {BRAND_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.label}
              onClick={() => void app.applyPreset(p.id).then(() => onFlash("Color aplicado"))}
              className={`h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-[var(--color-panel)] transition-transform hover:scale-110 ${
                app.presetId === p.id ? "ring-brand-600" : "ring-transparent"
              }`}
              style={{ backgroundColor: p.primary }}
            />
          ))}
          <label
            title="Color personalizado"
            className={`relative h-9 w-9 shrink-0 cursor-pointer rounded-full ring-2 ring-offset-2 ring-offset-[var(--color-panel)] ${
              app.presetId === "custom" ? "ring-brand-600" : "ring-transparent"
            }`}
            style={{ backgroundColor: app.primary }}
          >
            <input
              type="color"
              value={app.primary}
              onChange={(e) => void app.setPrimaryColor(e.target.value, "custom")}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-ink">Logo</h4>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {app.logoUrl ? (
            <img
              src={app.logoUrl}
              alt="Logo"
              className="h-24 max-w-[220px] rounded-xl border border-[var(--color-panel-border)] object-contain p-1"
            />
          ) : (
            <div className="flex h-24 w-36 items-center justify-center rounded-xl border border-dashed border-[var(--color-panel-border)] text-xs text-ink-muted">
              Sin logo
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void handleLogoUpload()}>
              <ImagePlus size={16} /> Subir
            </Button>
            {app.logoUrl && (
              <Button variant="ghost" onClick={() => void app.clearLogo().then(() => onFlash("Logo quitado"))}>
                <Trash2 size={16} />
              </Button>
            )}
          </div>
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-ink">Barra lateral</h4>
        <input
          className="mt-3 w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm"
          placeholder="Ej: Taller mecánico · Av. San Martín 1200"
          defaultValue={app.sidebarTitle}
          onBlur={(e) => void app.setSidebarTagline(e.target.value).then(() => onFlash("Guardado"))}
        />
        <p className="mt-3 text-xs font-medium text-ink-muted">Densidad de la interfaz</p>
        <div className="mt-2 inline-flex rounded-xl border border-[var(--color-panel-border)] bg-brand-50 p-1 dark:bg-brand-900/40">
          <button
            type="button"
            onClick={() => void app.setDensity("comfortable").then(() => onFlash("Guardado"))}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              app.density === "comfortable" ? "bg-brand-600 text-white" : "text-ink-muted"
            }`}
          >
            Cómoda
          </button>
          <button
            type="button"
            onClick={() => void app.setDensity("compact").then(() => onFlash("Guardado"))}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              app.density === "compact" ? "bg-brand-600 text-white" : "text-ink-muted"
            }`}
          >
            Compacta
          </button>
        </div>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => void app.resetBranding().then(() => onFlash("Restablecido"))}
        >
          Restablecer apariencia
        </Button>
      </section>
    </div>
  );
}
