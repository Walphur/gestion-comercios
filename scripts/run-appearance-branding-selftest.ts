/**
 * Selftest de Apariencia (tokens / migración / presets).
 * No toca DB ni UI.
 */
import assert from "node:assert/strict";
import {
  BRAND_PRESETS,
  DEFAULT_COLORS,
  appearanceToSettings,
  colorsEqual,
  findMatchingPresetId,
  normalizeHex,
  parseBrandAppearance,
} from "../src/config/branding";

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}

console.log("\n=== Appearance branding selftest ===\n");

assert.equal(normalizeHex("#2563EB"), "#2563eb");
assert.equal(normalizeHex("2563eb"), "#2563eb");
assert.equal(normalizeHex("nope"), null);
ok("normalizeHex");

assert.equal(BRAND_PRESETS.length, 6);
for (const p of BRAND_PRESETS) {
  assert.equal(findMatchingPresetId(p), p.id, `preset ${p.id} should match itself`);
}
ok("six presets self-match");

const custom = { ...DEFAULT_COLORS, primary: "#112233" };
assert.equal(findMatchingPresetId(custom), "custom");
ok("manual tweak → Personalizada");

const legacy = parseBrandAppearance({
  brand_primary: "#059669",
  brand_preset: "teal",
});
assert.equal(legacy.primary, "#059669");
assert.ok(legacy.sidebar);
assert.equal(legacy.accent, DEFAULT_COLORS.accent);
assert.ok(!colorsEqual(legacy, DEFAULT_COLORS) || legacy.primary !== DEFAULT_COLORS.primary);
ok("legacy primary-only migrates sidebar/accent defaults");

const mapped = appearanceToSettings(BRAND_PRESETS[0], "classic");
assert.equal(mapped.brand_primary, BRAND_PRESETS[0].primary);
assert.equal(mapped.brand_sidebar, BRAND_PRESETS[0].sidebar);
assert.equal(mapped.brand_accent, BRAND_PRESETS[0].accent);
assert.equal(mapped.brand_preset, "classic");
ok("appearanceToSettings round-trip keys");

const independent = parseBrandAppearance({
  brand_primary: "#2563eb",
  brand_sidebar: "#064e3b",
  brand_accent: "#0ea5e9",
  brand_page_bg_light: "#f4f4f5",
  brand_page_bg_dark: "#121212",
  brand_surface_light: "#ffffff",
  brand_surface_dark: "#1c1c1c",
});
assert.equal(independent.presetId, "custom");
assert.equal(independent.sidebar, "#064e3b");
assert.equal(independent.accent, "#0ea5e9");
ok("five slots stay independent (mixed → custom)");

console.log("\nAppearance branding selftest PASS\n");
