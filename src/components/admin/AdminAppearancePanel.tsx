import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Eye,
  ImagePlus,
  LayoutTemplate,
  Moon,
  Palette,
  Printer,
  RotateCcw,
  Sun,
  Trash2,
  Type,
} from "lucide-react";
import { Button, CardSectionTitle } from "../ui";
import { useAppearance } from "../../context/AppearanceContext";
import { useTheme } from "../../context/ThemeContext";
import { useAppConfig } from "../../context/AppConfig";
import {
  BRAND_PRESETS,
  SLOT_HINTS,
  SLOT_LABELS,
  type AppearanceSlot,
} from "../../config/branding";
import {
  getPrintBrandingSettings,
  savePrintBrandingSettings,
  type PrintBrandingSettings,
} from "../../config/printBranding";
import { previewSamplePrintDocuments } from "../../lib/prints/sampleDocuments";
import { showUserError } from "../../lib/notice";
import { usePlanEntitlements } from "../../hooks/usePlanEntitlements";
import PlanUpsellNotice from "../PlanUpsellNotice";
import AppearanceColorField from "./AppearanceColorField";

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

const ADVANCED_SLOTS: AppearanceSlot[] = [
  "primary",
  "sidebar",
  "accent",
  "pageBg",
  "surface",
];

function slotValue(
  slot: AppearanceSlot,
  app: ReturnType<typeof useAppearance>,
  isDark: boolean,
): string {
  switch (slot) {
    case "primary":
      return app.primary;
    case "sidebar":
      return app.sidebar;
    case "accent":
      return app.accent;
    case "pageBg":
      return isDark ? app.pageBgDark : app.pageBgLight;
    case "surface":
      return isDark ? app.surfaceDark : app.surfaceLight;
  }
}

export default function AdminAppearancePanel({ onFlash }: Props) {
  const app = useAppearance();
  const { theme, setTheme } = useTheme();
  const { businessName, currency } = useAppConfig();
  const { appearanceEdit, printBranding } = usePlanEntitlements();
  const [printCfg, setPrintCfg] = useState<PrintBrandingSettings>(EMPTY_PRINT);
  const [printLoading, setPrintLoading] = useState(true);
  const isDark = theme === "dark";

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

  const activePresetLabel =
    BRAND_PRESETS.find((p) => p.id === app.presetId)?.label ??
    (app.presetId === "custom" ? "Personalizada" : "Personalizada");

  return (
    <div className="space-y-8">
      {!appearanceEdit && <PlanUpsellNotice feature="appearanceEdit" />}

      <div className={`space-y-8 ${!appearanceEdit ? "pointer-events-none opacity-50" : ""}`}>
        {/* Vista previa en vivo con tokens reales */}
        <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--color-panel-border)] shadow-sm">
          <div
            className="flex min-h-[7.5rem] min-w-0"
            style={{ background: "var(--color-surface)" }}
          >
            <div
              className="flex w-[4.5rem] shrink-0 flex-col gap-1.5 p-2 sm:w-28 sm:p-3"
              style={{
                background:
                  "linear-gradient(to bottom, var(--color-sidebar), var(--color-sidebar-deep))",
                color: "var(--color-sidebar-ink)",
              }}
              aria-hidden
            >
              <div
                className="rounded-lg px-1.5 py-1 text-[10px] font-semibold sm:text-xs"
                style={{
                  background: "color-mix(in srgb, var(--color-sidebar-ink) 12%, transparent)",
                }}
              >
                Menú
              </div>
              <div
                className="rounded-lg px-1.5 py-1 text-[10px] opacity-70 sm:text-xs"
                style={{ color: "var(--color-sidebar-muted)" }}
              >
                Inicio
              </div>
              <div
                className="mt-auto h-1.5 w-8 rounded-full"
                style={{ background: "var(--color-accent-500)" }}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:p-4">
              <p className="font-display text-sm font-semibold text-ink">Vista previa</p>
              <div
                className="rounded-xl border border-[var(--color-panel-border)] p-3 shadow-sm"
                style={{ background: "var(--color-panel)" }}
              >
                <p className="text-xs text-ink-muted">Tarjeta / superficie</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className="inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ background: "var(--color-brand-600)" }}
                  >
                    Primario
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-panel-border)] px-2.5 py-1.5 text-xs font-medium text-ink"
                    style={{ background: "var(--color-input-bg)" }}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: "var(--color-accent-500)" }}
                    />
                    Acento
                  </span>
                  <span className="inline-flex rounded-lg bg-[var(--color-success-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-success)]">
                    Éxito
                  </span>
                  <span className="inline-flex rounded-lg bg-[var(--color-danger-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-danger)]">
                    Error
                  </span>
                </div>
              </div>
            </div>
          </div>
          <p className="border-t border-[var(--color-panel-border)] bg-[var(--color-panel)] px-3 py-2 text-[11px] text-ink-muted sm:px-4">
            Los cambios se aplican al instante en toda la app. Paleta activa:{" "}
            <span className="font-semibold text-ink">{activePresetLabel}</span>
            {isDark ? " · tema oscuro" : " · tema claro"}
          </p>
        </section>

        {/* Tema */}
        <section className="min-w-0">
          <CardSectionTitle icon={Sun} title="Tema" description="Claro u oscuro. Cada uno guarda su fondo y superficies." />
          <div className="mt-3 inline-flex rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-1">
            <button
              type="button"
              onClick={() => void setTheme("light")}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                theme === "light" ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              <Sun size={16} aria-hidden />
              Claro
            </button>
            <button
              type="button"
              onClick={() => void setTheme("dark")}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                theme === "dark" ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              <Moon size={16} aria-hidden />
              Oscuro
            </button>
          </div>
        </section>

        {/* Paletas */}
        <section className="min-w-0">
          <CardSectionTitle
            icon={Palette}
            title="Paletas"
            description="Elegí un set completo. Si después tocás un color, pasa a Personalizada."
          />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {BRAND_PRESETS.map((p) => {
              const active = app.presetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    void app.applyPreset(p.id).then(() => onFlash(`Paleta: ${p.label}`))
                  }
                  className={`relative min-w-0 rounded-xl border p-2.5 text-left transition ${
                    active
                      ? "border-brand-500 ring-2 ring-brand-500/30"
                      : "border-[var(--color-panel-border)] hover:border-brand-300"
                  }`}
                  style={{ background: "var(--color-panel)" }}
                >
                  {active && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                      <Check size={12} strokeWidth={3} aria-hidden />
                    </span>
                  )}
                  <div className="flex gap-1" aria-hidden>
                    <span className="h-6 flex-1 rounded-md" style={{ background: p.primary }} />
                    <span className="h-6 flex-1 rounded-md" style={{ background: p.sidebar }} />
                    <span className="h-6 flex-1 rounded-md" style={{ background: p.accent }} />
                  </div>
                  <p className="mt-2 truncate text-xs font-semibold text-ink">{p.label}</p>
                </button>
              );
            })}
          </div>
          {app.presetId === "custom" && (
            <p className="mt-2 text-xs font-medium text-ink-muted">
              Paleta activa: Personalizada
            </p>
          )}
        </section>

        {/* Personalización avanzada */}
        <section className="min-w-0">
          <CardSectionTitle
            icon={LayoutTemplate}
            title="Personalización avanzada"
            description={
              isDark
                ? "Fondo y superficies de este control son del tema oscuro. Primario, barra y acento valen en ambos."
                : "Fondo y superficies de este control son del tema claro. Primario, barra y acento valen en ambos."
            }
          />
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {ADVANCED_SLOTS.map((slot) => (
              <AppearanceColorField
                key={slot}
                label={SLOT_LABELS[slot]}
                hint={SLOT_HINTS[slot]}
                value={slotValue(slot, app, isDark)}
                onChange={(hex) =>
                  void app.setSlotColor(slot, hex).then(() => onFlash("Color actualizado"))
                }
                onReset={() =>
                  void app.resetSlot(slot).then(() => onFlash(`${SLOT_LABELS[slot]} restablecido`))
                }
              />
            ))}
          </div>
        </section>

        {/* Identidad */}
        <section className="min-w-0">
          <CardSectionTitle
            icon={Type}
            title="Identidad"
            description="Logo y nombre corto en la barra lateral."
          />
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
              <Button variant="secondary" onClick={() => handleLogoUpload()}>
                <ImagePlus size={16} /> Subir
              </Button>
              {app.logoUrl && (
                <Button
                  variant="ghost"
                  onClick={() => app.clearLogo().then(() => onFlash("Logo quitado"))}
                >
                  <Trash2 size={16} />
                </Button>
              )}
            </div>
          </div>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-ink">Nombre en la barra</span>
            <input
              className="wt-field w-full max-w-xl rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm"
              placeholder="Ej: Taller mecánico · Av. San Martín 1200"
              defaultValue={app.sidebarTitle}
              onBlur={(e) => void app.setSidebarTagline(e.target.value).then(() => onFlash("Guardado"))}
            />
          </label>
        </section>

        {/* Densidad */}
        <section className="min-w-0">
          <h4 className="text-sm font-semibold text-ink">Densidad</h4>
          <p className="mt-1 text-xs text-ink-muted">Más aire o más compacto en listas y botones.</p>
          <div className="mt-3 inline-flex rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-1">
            <button
              type="button"
              onClick={() => void app.setDensity("comfortable").then(() => onFlash("Guardado"))}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                app.density === "comfortable" ? "bg-brand-600 text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              Cómoda
            </button>
            <button
              type="button"
              onClick={() => void app.setDensity("compact").then(() => onFlash("Guardado"))}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                app.density === "compact" ? "bg-brand-600 text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              Compacta
            </button>
          </div>
        </section>

        {/* Preferencias */}
        <section className="min-w-0">
          <h4 className="text-sm font-semibold text-ink">Preferencias</h4>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={app.showSidebarClock}
              onChange={(e) =>
                void app.setShowSidebarClock(e.target.checked).then(() => onFlash("Guardado"))
              }
              className="mt-0.5 rounded border-[var(--color-panel-border)]"
            />
            <span>
              Mostrar fecha y hora en la barra lateral
              <span className="mt-0.5 block text-xs font-normal text-ink-muted">
                Por defecto está oculto; en Windows ya tenés el reloj en la barra de tareas.
              </span>
            </span>
          </label>
          <Button
            variant="ghost"
            className="mt-4"
            onClick={() => app.resetBranding().then(() => onFlash("Restablecido"))}
          >
            <RotateCcw size={16} />
            Restablecer apariencia
          </Button>
        </section>
      </div>

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

        {!printBranding && <PlanUpsellNotice feature="printBranding" className="mt-3" />}

        {printLoading ? (
          <p className="mt-4 text-sm text-ink-muted">Cargando…</p>
        ) : (
          <div className={`mt-4 space-y-3 ${!printBranding ? "pointer-events-none opacity-50" : ""}`}>
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

            <div className="pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  void previewSamplePrintDocuments(businessName, currency).catch((e) =>
                    showUserError(e),
                  );
                }}
              >
                <Eye size={16} />
                Ver ejemplo PDF (presupuesto + remito)
              </Button>
              <p className="mt-1.5 text-xs text-ink-muted">
                Abre una vista con tus datos de contacto y logo. Podés imprimir o guardar como PDF.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
