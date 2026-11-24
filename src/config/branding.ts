/** Personalización visual de la app de gestión (Desktop + WalQo Web). */

export const DEFAULT_BRAND_PRIMARY = "#2563eb";
export const DEFAULT_BRAND_SIDEBAR = "#1e3a8a";
export const DEFAULT_BRAND_ACCENT = "#14b8a6";
export const DEFAULT_PAGE_BG_LIGHT = "#f4f4f5";
export const DEFAULT_PAGE_BG_DARK = "#121212";
export const DEFAULT_SURFACE_LIGHT = "#ffffff";
export const DEFAULT_SURFACE_DARK = "#1c1c1c";

export type UiDensity = "comfortable" | "compact";

/** Las 5 propiedades visuales independientes. */
export type AppearanceSlot =
  | "primary"
  | "sidebar"
  | "accent"
  | "pageBg"
  | "surface";

export interface AppearanceColors {
  primary: string;
  sidebar: string;
  accent: string;
  pageBgLight: string;
  pageBgDark: string;
  surfaceLight: string;
  surfaceDark: string;
}

export interface BrandPreset extends AppearanceColors {
  id: string;
  label: string;
}

export interface BrandAppearance extends AppearanceColors {
  presetId: string;
  density: UiDensity;
  sidebarTitle: string;
  showSidebarClock: boolean;
}

/** Semánticos fijos — nunca salen de la paleta del comercio. */
export const SEMANTIC_COLORS = {
  success: "#059669",
  successBg: "#ecfdf5",
  warning: "#d97706",
  warningBg: "#fffbeb",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  info: "#2563eb",
  infoBg: "#eff6ff",
} as const;

const LIGHT_INK = {
  ink: "#18181b",
  inkMuted: "#71717a",
  border: "#e4e4e7",
  input: "#ffffff",
} as const;

const DARK_INK = {
  ink: "#f5f5f5",
  inkMuted: "#a3a3a3",
  border: "#2e2e2e",
  input: "#0a0a0a",
} as const;

export const DEFAULT_COLORS: AppearanceColors = {
  primary: DEFAULT_BRAND_PRIMARY,
  sidebar: DEFAULT_BRAND_SIDEBAR,
  accent: DEFAULT_BRAND_ACCENT,
  pageBgLight: DEFAULT_PAGE_BG_LIGHT,
  pageBgDark: DEFAULT_PAGE_BG_DARK,
  surfaceLight: DEFAULT_SURFACE_LIGHT,
  surfaceDark: DEFAULT_SURFACE_DARK,
};

/** Paletas listos (claro + oscuro). */
export const BRAND_PRESETS: BrandPreset[] = [
  {
    id: "classic",
    label: "Azul clásico",
    primary: "#2563eb",
    sidebar: "#1e3a8a",
    accent: "#14b8a6",
    pageBgLight: "#f4f4f5",
    pageBgDark: "#121212",
    surfaceLight: "#ffffff",
    surfaceDark: "#1c1c1c",
  },
  {
    id: "emerald",
    label: "Esmeralda",
    primary: "#059669",
    sidebar: "#064e3b",
    accent: "#0ea5e9",
    pageBgLight: "#f4f7f5",
    pageBgDark: "#0f1412",
    surfaceLight: "#ffffff",
    surfaceDark: "#1a1f1c",
  },
  {
    id: "violet",
    label: "Violeta",
    primary: "#7c3aed",
    sidebar: "#4c1d95",
    accent: "#14b8a6",
    pageBgLight: "#f6f4f8",
    pageBgDark: "#121014",
    surfaceLight: "#ffffff",
    surfaceDark: "#1c1a20",
  },
  {
    id: "slate",
    label: "Gris profesional",
    primary: "#475569",
    sidebar: "#1e293b",
    accent: "#0d9488",
    pageBgLight: "#f1f5f9",
    pageBgDark: "#0f172a",
    surfaceLight: "#ffffff",
    surfaceDark: "#1e293b",
  },
  {
    id: "terracotta",
    label: "Terracota",
    primary: "#c2410c",
    sidebar: "#7c2d12",
    accent: "#0f766e",
    pageBgLight: "#faf6f3",
    pageBgDark: "#14110f",
    surfaceLight: "#ffffff",
    surfaceDark: "#1f1b18",
  },
  {
    id: "premium",
    label: "Premium",
    primary: "#1d4ed8",
    sidebar: "#0f172a",
    accent: "#b45309",
    pageBgLight: "#f8fafc",
    pageBgDark: "#0b1220",
    surfaceLight: "#ffffff",
    surfaceDark: "#152033",
  },
];

/** IDs viejos → nuevos (migración suave). */
const PRESET_ALIASES: Record<string, string> = {
  blue: "classic",
  teal: "emerald",
  orange: "terracotta",
  rose: "custom",
};

export function resolveLegacyPresetId(id: string): string {
  return PRESET_ALIASES[id] ?? id;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function normalizeHex(raw: string): string | null {
  let h = raw.trim().replace(/^#/, "");
  if (h.length === 3 && /^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return `#${h.toLowerCase()}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  const v = Number.parseInt(n.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
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

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Texto legible sobre un fondo (sidebar). */
export function contrastInk(bg: string): string {
  return relativeLuminance(bg) > 0.45 ? "#18181b" : "#ffffff";
}

export function contrastMuted(bg: string): string {
  const ink = contrastInk(bg);
  return ink === "#ffffff" ? "rgb(255 255 255 / 0.72)" : "rgb(24 24 27 / 0.65)";
}

/** Genera escala brand/accent desde un color principal. */
export function scaleFromPrimary(primary: string): Record<string, string> {
  const p = normalizeHex(primary) ?? DEFAULT_BRAND_PRIMARY;
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

function sameHex(a: string, b: string): boolean {
  return (normalizeHex(a) ?? "") === (normalizeHex(b) ?? "");
}

export function colorsEqual(a: AppearanceColors, b: AppearanceColors): boolean {
  return (
    sameHex(a.primary, b.primary) &&
    sameHex(a.sidebar, b.sidebar) &&
    sameHex(a.accent, b.accent) &&
    sameHex(a.pageBgLight, b.pageBgLight) &&
    sameHex(a.pageBgDark, b.pageBgDark) &&
    sameHex(a.surfaceLight, b.surfaceLight) &&
    sameHex(a.surfaceDark, b.surfaceDark)
  );
}

export function findMatchingPresetId(colors: AppearanceColors): string {
  for (const p of BRAND_PRESETS) {
    if (colorsEqual(colors, p)) return p.id;
  }
  return "custom";
}

export function slotDefault(slot: AppearanceSlot, isDark: boolean): string {
  switch (slot) {
    case "primary":
      return DEFAULT_BRAND_PRIMARY;
    case "sidebar":
      return DEFAULT_BRAND_SIDEBAR;
    case "accent":
      return DEFAULT_BRAND_ACCENT;
    case "pageBg":
      return isDark ? DEFAULT_PAGE_BG_DARK : DEFAULT_PAGE_BG_LIGHT;
    case "surface":
      return isDark ? DEFAULT_SURFACE_DARK : DEFAULT_SURFACE_LIGHT;
  }
}

function applyUiForTheme(colors: AppearanceColors, isDark: boolean): void {
  const pageBg = isDark ? colors.pageBgDark : colors.pageBgLight;
  const panel = isDark ? colors.surfaceDark : colors.surfaceLight;
  const ui = isDark ? DARK_INK : LIGHT_INK;
  // Input: en claro, misma superficie; en oscuro, un poco más hundido.
  const input = isDark ? mix(panel, { r: 0, g: 0, b: 0 }, 0.35) : panel;
  // Borde: mezcla con ink para que se vea sobre superficies custom.
  const border = isDark
    ? mix(panel, { r: 255, g: 255, b: 255 }, 0.12)
    : mix(panel, { r: 24, g: 24, b: 27 }, 0.12);

  const root = document.documentElement.style;
  root.setProperty("--color-surface", pageBg);
  root.setProperty("--color-panel", panel);
  root.setProperty("--color-input-bg", input);
  root.setProperty("--color-panel-border", border || ui.border);
  root.setProperty("--color-ink", ui.ink);
  root.setProperty("--color-ink-muted", ui.inkMuted);
  root.setProperty("--background", pageBg);
  root.setProperty("--surface", panel);
  root.setProperty("--surface-2", input);
  root.setProperty("--text", ui.ink);
  root.setProperty("--text-secondary", ui.inkMuted);
}

function applySidebarTokens(sidebar: string): void {
  const s = normalizeHex(sidebar) ?? DEFAULT_BRAND_SIDEBAR;
  const deep = mix(s, { r: 0, g: 0, b: 0 }, 0.22);
  const soft = mix(s, { r: 255, g: 255, b: 255 }, 0.18);
  const ink = contrastInk(s);
  const muted = contrastMuted(s);
  const root = document.documentElement.style;
  root.setProperty("--color-sidebar", s);
  root.setProperty("--color-sidebar-deep", deep);
  root.setProperty("--color-sidebar-soft", soft);
  root.setProperty("--color-sidebar-ink", ink);
  root.setProperty("--color-sidebar-muted", muted);
}

function applyAccentScale(accent: string): void {
  const scale = scaleFromPrimary(accent);
  const root = document.documentElement.style;
  for (const [shade, value] of Object.entries(scale)) {
    if (["50", "100", "500", "600", "700"].includes(shade)) {
      root.setProperty(`--wt-accent-${shade}`, value);
      root.setProperty(`--color-accent-${shade}`, value);
    }
  }
  // Alias usado por checkboxes / íconos legacy (`var(--color-accent)`).
  root.setProperty("--color-accent", scale[500] ?? DEFAULT_BRAND_ACCENT);
}

function applyPrimaryScale(primary: string): Record<string, string> {
  const scale = scaleFromPrimary(primary);
  const p = normalizeHex(primary) ?? DEFAULT_BRAND_PRIMARY;
  const root = document.documentElement.style;
  for (const [shade, value] of Object.entries(scale)) {
    root.setProperty(`--wt-brand-${shade}`, value);
    root.setProperty(`--color-brand-${shade}`, value);
  }
  root.setProperty("--user-brand-primary", p);
  root.setProperty("--brand-glow", scale[400]);
  root.setProperty("--primary", scale[600]);
  root.setProperty("--primary-hover", scale[700]);
  root.setProperty("--primary-soft", scale[100]);
  root.setProperty("--primary-border", scale[300]);
  return scale;
}

function ensureSemanticProtection(): void {
  const root = document.documentElement.style;
  root.setProperty("--color-success", SEMANTIC_COLORS.success);
  root.setProperty("--color-warning", SEMANTIC_COLORS.warning);
  root.setProperty("--color-danger", SEMANTIC_COLORS.danger);
  root.setProperty("--color-info", SEMANTIC_COLORS.info);
  // Fondos semánticos: solo si el tema no los redefine en .dark CSS.
  if (!document.documentElement.classList.contains("dark")) {
    root.setProperty("--color-success-bg", SEMANTIC_COLORS.successBg);
    root.setProperty("--color-warning-bg", SEMANTIC_COLORS.warningBg);
    root.setProperty("--color-danger-bg", SEMANTIC_COLORS.dangerBg);
    root.setProperty("--color-info-bg", SEMANTIC_COLORS.infoBg);
  }
}

function writeLiveStyleSheet(colors: AppearanceColors, primaryScale: Record<string, string>): void {
  if (typeof document === "undefined") return;
  let sheet = document.getElementById(BRAND_STYLE_ID) as HTMLStyleElement | null;
  if (!sheet) {
    sheet = document.createElement("style");
    sheet.id = BRAND_STYLE_ID;
    document.head.appendChild(sheet);
  }
  const p = normalizeHex(colors.primary) ?? DEFAULT_BRAND_PRIMARY;
  const brandDecls = Object.entries(primaryScale)
    .flatMap(([shade, value]) => [
      `--wt-brand-${shade}:${value}`,
      `--color-brand-${shade}:${value}`,
    ])
    .join(";");
  const accentScale = scaleFromPrimary(colors.accent);
  const accentDecls = ["50", "100", "500", "600", "700"]
    .flatMap((shade) => [
      `--wt-accent-${shade}:${accentScale[shade]}`,
      `--color-accent-${shade}:${accentScale[shade]}`,
    ])
    .join(";");
  const sidebar = normalizeHex(colors.sidebar) ?? DEFAULT_BRAND_SIDEBAR;
  const sidebarDeep = mix(sidebar, { r: 0, g: 0, b: 0 }, 0.22);
  const accent500 = accentScale[500] ?? DEFAULT_BRAND_ACCENT;
  sheet.textContent = `:root{${brandDecls};${accentDecls};--color-accent:${accent500};--user-brand-primary:${p};--primary:${primaryScale[600]};--primary-hover:${primaryScale[700]};--primary-soft:${primaryScale[100]};--primary-border:${primaryScale[300]};--color-sidebar:${sidebar};--color-sidebar-deep:${sidebarDeep};--color-success:${SEMANTIC_COLORS.success};--color-warning:${SEMANTIC_COLORS.warning};--color-danger:${SEMANTIC_COLORS.danger};--color-info:${SEMANTIC_COLORS.info}}`;
}

export interface ApplyAppearanceOptions {
  /** Si se omite, se lee de `html.dark`. */
  isDark?: boolean;
}

/** Aplica las 5 propiedades + semánticos protegidos. Cambiar una no pisa las demás. */
export function applyAppearanceColors(
  colors: AppearanceColors,
  opts: ApplyAppearanceOptions = {},
): void {
  const isDark =
    opts.isDark ??
    (typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  const primaryScale = applyPrimaryScale(colors.primary);
  applySidebarTokens(colors.sidebar);
  applyAccentScale(colors.accent);
  applyUiForTheme(colors, isDark);
  ensureSemanticProtection();

  const root = document.documentElement.style;
  root.setProperty("--brand-page-bg-light", normalizeHex(colors.pageBgLight) ?? DEFAULT_PAGE_BG_LIGHT);
  root.setProperty("--brand-page-bg-dark", normalizeHex(colors.pageBgDark) ?? DEFAULT_PAGE_BG_DARK);
  root.setProperty("--brand-surface-light", normalizeHex(colors.surfaceLight) ?? DEFAULT_SURFACE_LIGHT);
  root.setProperty("--brand-surface-dark", normalizeHex(colors.surfaceDark) ?? DEFAULT_SURFACE_DARK);
  root.setProperty("--user-brand-sidebar", normalizeHex(colors.sidebar) ?? DEFAULT_BRAND_SIDEBAR);
  root.setProperty("--user-brand-accent", normalizeHex(colors.accent) ?? DEFAULT_BRAND_ACCENT);

  writeLiveStyleSheet(colors, primaryScale);
}

/** @deprecated Usar applyAppearanceColors — se mantiene por ThemeContext legado. */
export function applyBrandColors(primary: string): void {
  const stored = readColorsFromDom();
  applyAppearanceColors({ ...stored, primary: normalizeHex(primary) ?? primary });
}

export function applyBrandSurfacesForTheme(isDark: boolean): void {
  applyAppearanceColors(readColorsFromDom(), { isDark });
}

function readColorsFromDom(): AppearanceColors {
  if (typeof document === "undefined") return { ...DEFAULT_COLORS };
  const s = document.documentElement.style;
  return {
    primary: s.getPropertyValue("--user-brand-primary").trim() || DEFAULT_BRAND_PRIMARY,
    sidebar: s.getPropertyValue("--user-brand-sidebar").trim() || DEFAULT_BRAND_SIDEBAR,
    accent: s.getPropertyValue("--user-brand-accent").trim() || DEFAULT_BRAND_ACCENT,
    pageBgLight: s.getPropertyValue("--brand-page-bg-light").trim() || DEFAULT_PAGE_BG_LIGHT,
    pageBgDark: s.getPropertyValue("--brand-page-bg-dark").trim() || DEFAULT_PAGE_BG_DARK,
    surfaceLight: s.getPropertyValue("--brand-surface-light").trim() || DEFAULT_SURFACE_LIGHT,
    surfaceDark: s.getPropertyValue("--brand-surface-dark").trim() || DEFAULT_SURFACE_DARK,
  };
}

export function applyUiDensity(density: UiDensity): void {
  document.documentElement.classList.toggle("density-compact", density === "compact");
}

/** Defaults de sidebar cuando solo había primary (usuarios viejos). */
function defaultSidebarFromPrimary(primary: string): string {
  return scaleFromPrimary(primary)[900] ?? DEFAULT_BRAND_SIDEBAR;
}

export function parseBrandAppearance(settings: Record<string, string>): BrandAppearance {
  const primary = normalizeHex(settings.brand_primary || "") ?? DEFAULT_BRAND_PRIMARY;
  const colors: AppearanceColors = {
    primary,
    sidebar:
      normalizeHex(settings.brand_sidebar || "") ?? defaultSidebarFromPrimary(primary),
    accent: normalizeHex(settings.brand_accent || "") ?? DEFAULT_BRAND_ACCENT,
    pageBgLight: normalizeHex(settings.brand_page_bg_light || "") ?? DEFAULT_PAGE_BG_LIGHT,
    pageBgDark: normalizeHex(settings.brand_page_bg_dark || "") ?? DEFAULT_PAGE_BG_DARK,
    surfaceLight: normalizeHex(settings.brand_surface_light || "") ?? DEFAULT_SURFACE_LIGHT,
    surfaceDark: normalizeHex(settings.brand_surface_dark || "") ?? DEFAULT_SURFACE_DARK,
  };

  // Colores reales mandan: si no coinciden con una paleta → Personalizada.
  const presetId = findMatchingPresetId(colors);

  return {
    ...colors,
    presetId,
    density: settings.ui_density === "compact" ? "compact" : "comfortable",
    sidebarTitle: settings.sidebar_tagline || "",
    showSidebarClock: settings.sidebar_show_clock === "1",
  };
}

export function appearanceToSettings(colors: AppearanceColors, presetId: string): Record<string, string> {
  return {
    brand_primary: normalizeHex(colors.primary) ?? colors.primary,
    brand_sidebar: normalizeHex(colors.sidebar) ?? colors.sidebar,
    brand_accent: normalizeHex(colors.accent) ?? colors.accent,
    brand_page_bg_light: normalizeHex(colors.pageBgLight) ?? colors.pageBgLight,
    brand_page_bg_dark: normalizeHex(colors.pageBgDark) ?? colors.pageBgDark,
    brand_surface_light: normalizeHex(colors.surfaceLight) ?? colors.surfaceLight,
    brand_surface_dark: normalizeHex(colors.surfaceDark) ?? colors.surfaceDark,
    brand_preset: presetId,
  };
}

export const SLOT_LABELS: Record<AppearanceSlot, string> = {
  primary: "Primario",
  sidebar: "Barra lateral",
  accent: "Acento",
  pageBg: "Fondo de pantalla",
  surface: "Superficies",
};

export const SLOT_HINTS: Record<AppearanceSlot, string> = {
  primary: "Botones principales, selección y menú activo.",
  sidebar: "Fondo del menú lateral e ítems activos.",
  accent: "Detalles decorativos e íconos secundarios. No cambia éxitos ni errores.",
  pageBg: "Fondo general de la pantalla (distinto de las tarjetas).",
  surface: "Tarjetas, paneles y campos de formulario.",
};
