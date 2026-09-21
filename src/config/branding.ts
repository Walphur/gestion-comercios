/** Colores por defecto (Azul WalTech). */
export const DEFAULT_BRAND_PRIMARY = "#2563eb";

export const BRAND_PRESETS: { id: string; label: string; primary: string }[] = [
  { id: "blue", label: "Azul WalTech", primary: "#2563eb" },
  { id: "teal", label: "Verde agua", primary: "#14b8a6" },
  { id: "violet", label: "Violeta", primary: "#8b5cf6" },
  { id: "orange", label: "Naranja", primary: "#f97316" },
  { id: "rose", label: "Rosa", primary: "#f43f5e" },
  { id: "emerald", label: "Esmeralda", primary: "#10b981" },
];

export type UiDensity = "comfortable" | "compact";

export interface BrandAppearance {
  primary: string;
  presetId: string;
  density: UiDensity;
  sidebarTitle: string;
  showSidebarClock: boolean;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return null;
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function mix(hex: string, target: { r: number; g: number; b: number }, amount: number): string {
  const base = hexToRgb(hex);
  if (!base) return hex;
  return rgbToHex(
    base.r + (target.r - base.r) * amount,
    base.g + (target.g - base.g) * amount,
    base.b + (target.b - base.b) * amount,
  );
}

/** Genera escala brand-* desde un color principal (tintes neutros, sin sesgo verde). */
export function scaleFromPrimary(primary: string): Record<string, string> {
  const p = primary.startsWith("#") ? primary : `#${primary}`;
  return {
    50: mix(p, { r: 248, g: 250, b: 252 }, 0.92),
    100: mix(p, { r: 241, g: 245, b: 249 }, 0.85),
    200: mix(p, { r: 226, g: 232, b: 240 }, 0.7),
    300: mix(p, { r: 203, g: 213, b: 225 }, 0.55),
    400: mix(p, { r: 148, g: 163, b: 184 }, 0.35),
    500: p,
    600: mix(p, { r: 0, g: 0, b: 0 }, 0.12),
    700: mix(p, { r: 0, g: 0, b: 0 }, 0.22),
    800: mix(p, { r: 0, g: 0, b: 0 }, 0.32),
    900: mix(p, { r: 0, g: 0, b: 0 }, 0.42),
    950: mix(p, { r: 0, g: 0, b: 0 }, 0.52),
  };
}

const BRAND_STYLE_ID = "wt-brand-live";

/** Bases de UI — independientes del color de marca. */
const LIGHT_UI = {
  surface: "#f4f4f5",
  panel: "#ffffff",
  input: "#ffffff",
  border: "#e4e4e7",
  ink: "#18181b",
  inkMuted: "#71717a",
} as const;

/** Oscuro neutro (gris), sin tinte azul/teal del color de marca. */
const DARK_UI = {
  surface: "#121212",
  panel: "#1c1c1c",
  input: "#0a0a0a",
  border: "#2e2e2e",
  ink: "#f5f5f5",
  inkMuted: "#a3a3a3",
} as const;

function applyUiSurfaces(isDark: boolean): void {
  const ui = isDark ? DARK_UI : LIGHT_UI;
  const root = document.documentElement.style;
  root.setProperty("--color-surface", ui.surface);
  root.setProperty("--color-panel", ui.panel);
  root.setProperty("--color-input-bg", ui.input);
  root.setProperty("--color-panel-border", ui.border);
  root.setProperty("--color-ink", ui.ink);
  root.setProperty("--color-ink-muted", ui.inkMuted);
  root.setProperty("--background", ui.surface);
  root.setProperty("--surface", ui.panel);
  root.setProperty("--surface-2", ui.input);
  root.setProperty("--text", ui.ink);
  root.setProperty("--text-secondary", ui.inkMuted);
}

/** Aplica el color elegido en Apariencia (acentos). La base claro/oscuro es gris/blanco fija. */
export function applyBrandColors(primary: string): void {
  const scale = scaleFromPrimary(primary);
  const p = primary.startsWith("#") ? primary : `#${primary}`;
  const root = document.documentElement.style;

  for (const [shade, value] of Object.entries(scale)) {
    root.setProperty(`--wt-brand-${shade}`, value);
    root.setProperty(`--color-brand-${shade}`, value);
  }
  root.setProperty("--user-brand-primary", p);
  root.setProperty("--brand-surface-light", LIGHT_UI.surface);
  root.setProperty("--brand-surface-dark", DARK_UI.surface);
  root.setProperty("--brand-panel-border-light", LIGHT_UI.border);
  root.setProperty("--brand-panel-border-dark", DARK_UI.border);
  root.setProperty("--brand-glow", scale[400]);
  root.setProperty("--brand-header-tint", LIGHT_UI.surface);

  // Hoja sin @layer: gana a los defaults de Tailwind (@layer theme).
  if (typeof document !== "undefined") {
    let sheet = document.getElementById(BRAND_STYLE_ID) as HTMLStyleElement | null;
    if (!sheet) {
      sheet = document.createElement("style");
      sheet.id = BRAND_STYLE_ID;
      document.head.appendChild(sheet);
    }
    const decls = Object.entries(scale)
      .flatMap(([shade, value]) => [
        `--wt-brand-${shade}:${value}`,
        `--color-brand-${shade}:${value}`,
      ])
      .join(";");
    sheet.textContent = `:root{${decls};--user-brand-primary:${p};--primary:${scale[600]};--primary-hover:${scale[700]};--primary-soft:${scale[100]};--primary-border:${scale[300]}}`;
  }

  applyUiSurfaces(document.documentElement.classList.contains("dark"));
}

export function applyBrandSurfacesForTheme(isDark: boolean): void {
  applyUiSurfaces(isDark);
}

export function applyUiDensity(density: UiDensity): void {
  document.documentElement.classList.toggle("density-compact", density === "compact");
}

export function parseBrandAppearance(settings: Record<string, string>): BrandAppearance {
  return {
    primary: settings.brand_primary || DEFAULT_BRAND_PRIMARY,
    presetId: settings.brand_preset || "blue",
    density: settings.ui_density === "compact" ? "compact" : "comfortable",
    sidebarTitle: settings.sidebar_tagline || "",
    showSidebarClock: settings.sidebar_show_clock === "1",
  };
}
