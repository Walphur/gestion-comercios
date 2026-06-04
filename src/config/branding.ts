/** Colores por defecto (teal). */
export const DEFAULT_BRAND_PRIMARY = "#14b8a6";

export const BRAND_PRESETS: { id: string; label: string; primary: string }[] = [
  { id: "teal", label: "Verde agua", primary: "#14b8a6" },
  { id: "blue", label: "Azul", primary: "#3b82f6" },
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

/** Genera escala brand-* desde un color principal. */
export function scaleFromPrimary(primary: string): Record<string, string> {
  const p = primary.startsWith("#") ? primary : `#${primary}`;
  return {
    50: mix(p, { r: 240, g: 253, b: 250 }, 0.92),
    100: mix(p, { r: 204, g: 251, b: 241 }, 0.85),
    200: mix(p, { r: 153, g: 246, b: 228 }, 0.7),
    300: mix(p, { r: 94, g: 234, b: 212 }, 0.55),
    400: mix(p, { r: 45, g: 212, b: 191 }, 0.35),
    500: p,
    600: mix(p, { r: 0, g: 0, b: 0 }, 0.12),
    700: mix(p, { r: 0, g: 0, b: 0 }, 0.22),
    800: mix(p, { r: 0, g: 0, b: 0 }, 0.32),
    900: mix(p, { r: 0, g: 0, b: 0 }, 0.42),
    950: mix(p, { r: 0, g: 0, b: 0 }, 0.52),
  };
}

export function applyBrandColors(primary: string): void {
  const scale = scaleFromPrimary(primary);
  const root = document.documentElement.style;
  for (const [shade, value] of Object.entries(scale)) {
    root.setProperty(`--color-brand-${shade}`, value);
  }
  root.setProperty("--user-brand-primary", primary);
}

export function applyUiDensity(density: UiDensity): void {
  document.documentElement.classList.toggle("density-compact", density === "compact");
}

export function parseBrandAppearance(settings: Record<string, string>): BrandAppearance {
  return {
    primary: settings.brand_primary || DEFAULT_BRAND_PRIMARY,
    presetId: settings.brand_preset || "teal",
    density: settings.ui_density === "compact" ? "compact" : "comfortable",
    sidebarTitle: settings.sidebar_tagline || "",
  };
}
