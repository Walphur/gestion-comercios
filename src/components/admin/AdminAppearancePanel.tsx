import { useCallback, useEffect, useState } from "react";
import { ImagePlus, Printer, Trash2 } from "lucide-react";
import { Button } from "../ui";
import { useAppearance } from "../../context/AppearanceContext";
import { useTheme } from "../../context/ThemeContext";
import { useAppConfig } from "../../context/AppConfig";
import { BRAND_PRESETS } from "../../config/branding";
import {
  getPrintBrandingSettings,
  savePrintBrandingSettings,
  type PrintBrandingSettings,
} from "../../config/printBranding";
import { showUserError } from "../../lib/notice";

interface Props {
  onFlash: (msg: string) => void;
}

const EMPTY_PRINT: PrintBrandingSettings = {
  showLogo: true,
  phone: "",
  whatsapp: "",
  address: "",
  instagram: "",
  email: "",
  website: "",
  footer: "",
};

export default function AdminAppearancePanel({ onFlash }: Props) {
  const app = useAppearance();
  const { theme, setTheme } = useTheme();
  const { businessName } = useAppConfig();
  const [printCfg, setPrintCfg] = useState<PrintBrandingSettings>(EMPTY_PRINT);
  const [printLoading, setPrintLoading] = useState(true);

  const loadPrint = useCallback(async () => {
    setPrintLoading(true);
    try {
      setPrintCfg(await getPrintBrandingSettings());
    } finally {
      setPrintLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrint();
  }, [loadPrint]);

  async function handleLogoUpload() {
    try {
      await app.uploadLogo();
      onFlash("Logo guardado");
    } catch (e) {
      showUserError(e);
    }
  }

  async function savePrintField<K extends keyof PrintBrandingSettings>(
    key: K,
    value: PrintBrandingSettings[K],
  ) {
    setPrintCfg((prev) => ({ ...prev, [key]: value }));
    try {
      await savePrintBrandingSettings({ [key]: value });
      onFlash("Guardado");
    } catch (e) {
      showUserError(e);
      void loadPrint();
    }
  }

  return (
    <div className="space-y-6">
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

      <section className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)]/40 p-4">
        <div className="flex items-start gap-2">
          <Printer size={18} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" />
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-ink">Documentos impresos (PDF / impresora)</h4>
            <p className="mt-1 text-xs text-ink-muted">
              Datos que salen en presupuestos y órdenes de servicio. El nombre del comercio es{" "}
              <strong>{businessName}</strong> (Configuración → Comercio). El logo es el de arriba.
            </p>
          </div>
        </div>

        {printLoading ? (
          <p className="mt-4 text-sm text-ink-muted">Cargando…</p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={printCfg.showLogo}
                onChange={(e) => void savePrintField("showLogo", e.target.checked)}
                className="rounded border-[var(--color-panel-border)]"
              />
              Mostrar logo en impresiones
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink">Teléfono</span>
                <input
                  className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm"
                  placeholder="Ej. 011 4567-8900"
                  value={printCfg.phone}
                  onChange={(e) => setPrintCfg((p) => ({ ...p, phone: e.target.value }))}
                  onBlur={(e) => void savePrintField("phone", e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink">WhatsApp</span>
                <input
                  className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm"
                  placeholder="Ej. 11 2345-6789"
                  value={printCfg.whatsapp}
                  onChange={(e) => setPrintCfg((p) => ({ ...p, whatsapp: e.target.value }))}
                  onBlur={(e) => void savePrintField("whatsapp", e.target.value)}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-ink">Dirección</span>
                <input
                  className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm"
                  placeholder="Ej. Av. San Martín 1200, Morón"
                  value={printCfg.address}
                  onChange={(e) => setPrintCfg((p) => ({ ...p, address: e.target.value }))}
                  onBlur={(e) => void savePrintField("address", e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink">Instagram</span>
                <input
                  className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm"
                  placeholder="Ej. aguerorepuestos"
                  value={printCfg.instagram}
                  onChange={(e) => setPrintCfg((p) => ({ ...p, instagram: e.target.value }))}
                  onBlur={(e) => void savePrintField("instagram", e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink">Email</span>
                <input
                  className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm"
                  placeholder="contacto@taller.com"
                  value={printCfg.email}
                  onChange={(e) => setPrintCfg((p) => ({ ...p, email: e.target.value }))}
                  onBlur={(e) => void savePrintField("email", e.target.value)}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-ink">Sitio web</span>
                <input
                  className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm"
                  placeholder="www.tucomercio.com"
                  value={printCfg.website}
                  onChange={(e) => setPrintCfg((p) => ({ ...p, website: e.target.value }))}
                  onBlur={(e) => void savePrintField("website", e.target.value)}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-ink">Pie de página (opcional)</span>
                <input
                  className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm"
                  placeholder="Ej. Validez 15 días · IVA responsable inscripto"
                  value={printCfg.footer}
                  onChange={(e) => setPrintCfg((p) => ({ ...p, footer: e.target.value }))}
                  onBlur={(e) => void savePrintField("footer", e.target.value)}
                />
              </label>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
