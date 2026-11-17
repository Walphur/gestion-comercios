/**
 * Self-test: plantillas de subcategoría gastronómica (sin DB ni red).
 * Cubre matriz de presets, one-shot rewrite y resolución de ids.
 */
import {
  DEFAULT_GASTRO_SUBTYPE,
  GASTRO_SUBTYPE_IDS,
  GASTRO_SUBTYPES,
  isGastroSubtype,
  resolveGastroSubtype,
  type GastroSubtype,
} from "../src/config/gastroSubtypes.ts";
import { gastroPresetShouldRewrite } from "../src/lib/gastroPreset.ts";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

/** Matriz esperada (plan): tables / kitchen / waiters / fulfillment */
const EXPECTED: Record<
  GastroSubtype,
  { tables: boolean; kitchen: boolean; waiterPhones: boolean; posFulfillment: boolean }
> = {
  restaurante: { tables: true, kitchen: true, waiterPhones: true, posFulfillment: true },
  rotiseria: { tables: false, kitchen: true, waiterPhones: false, posFulfillment: true },
  pizzeria: { tables: false, kitchen: true, waiterPhones: false, posFulfillment: true },
  cafeteria: { tables: false, kitchen: true, waiterPhones: false, posFulfillment: true },
  bar: { tables: true, kitchen: true, waiterPhones: true, posFulfillment: true },
  comida_rapida: { tables: false, kitchen: true, waiterPhones: false, posFulfillment: true },
  delivery: { tables: false, kitchen: true, waiterPhones: false, posFulfillment: true },
  otro: { tables: true, kitchen: true, waiterPhones: true, posFulfillment: true },
};

console.log("\n=== Gastro subtype self-test ===\n");

assert(DEFAULT_GASTRO_SUBTYPE === "restaurante", "default subtype = restaurante");
assert(GASTRO_SUBTYPE_IDS.length === 8, "8 subtipos definidos");

for (const id of GASTRO_SUBTYPE_IDS) {
  const p = GASTRO_SUBTYPES[id].preset;
  const e = EXPECTED[id];
  assert(p.tables === e.tables, `${id}: tables=${e.tables}`);
  assert(p.kitchen === e.kitchen, `${id}: kitchen=${e.kitchen}`);
  assert(p.waiterPhones === e.waiterPhones, `${id}: waiterPhones=${e.waiterPhones}`);
  assert(p.posFulfillment === e.posFulfillment, `${id}: posFulfillment=${e.posFulfillment}`);
  assert(p.suggestedStations.length > 0, `${id}: tiene estaciones sugeridas`);
  assert(p.suggestedCategories.length > 0, `${id}: tiene categorías sugeridas`);
}

assert(
  GASTRO_SUBTYPES.rotiseria.preset.tables === false &&
    GASTRO_SUBTYPES.rotiseria.preset.kitchen === true,
  "rotisería: sin mesas + con cocina (KDS mostrador)",
);

assert(isGastroSubtype("pizzeria"), "isGastroSubtype pizzeria");
assert(!isGastroSubtype("kiosco"), "rechaza id inválido");
assert(resolveGastroSubtype("  bar  ") === "bar", "resolve trim");
assert(resolveGastroSubtype("") === null, "resolve vacío → null (comercio viejo)");
assert(resolveGastroSubtype("foo") === null, "resolve inválido → null");

assert(gastroPresetShouldRewrite(false, false) === true, "primera aplicación escribe");
assert(gastroPresetShouldRewrite(true, false) === false, "ya aplicada sin force → no reescribe");
assert(gastroPresetShouldRewrite(true, true) === true, "force reescribe tras confirmación");
assert(gastroPresetShouldRewrite(false, true) === true, "force en primera también escribe");

/** Defaults AppConfig (espejo lógico) para comercios viejos sin settings. */
function effectiveKitchen(
  rubro: string,
  kitchenSetting: boolean | null,
  tablesEnabled: boolean,
): boolean {
  return kitchenSetting ?? (rubro === "gastronomia" ? true : tablesEnabled);
}
function effectiveTables(rubro: string, tablesSetting: boolean | null): boolean {
  return tablesSetting ?? rubro === "gastronomia";
}
function effectiveFulfillment(rubro: string, setting: boolean | null): boolean {
  return setting ?? (rubro === "gastronomia" ? true : false);
}
function effectiveWaiters(waiterSetting: boolean | null, tablesEnabled: boolean): boolean {
  return waiterSetting ?? tablesEnabled;
}

assert(effectiveTables("gastronomia", null) === true, "viejo gastro: mesas ON por default");
assert(effectiveKitchen("gastronomia", null, false) === true, "viejo gastro: cocina ON aunque mesas OFF");
assert(effectiveKitchen("gastronomia", null, true) === true, "viejo gastro: cocina ON con mesas");
assert(effectiveKitchen("gastronomia", false, true) === false, "kitchen_enabled=0 apaga cocina");
assert(effectiveFulfillment("gastronomia", null) === true, "viejo gastro: fulfillment ON");
assert(effectiveWaiters(null, true) === true, "viejos: mozos siguen a mesas ON");
assert(effectiveWaiters(null, false) === false, "viejos: mozos OFF si mesas OFF");

/** Nav: rotisería → solo cocina; restaurante → mesas+cocina */
function navLinks(tables: boolean, kitchen: boolean): string[] {
  const out: string[] = ["/pos"];
  if (tables) out.push("/mesas");
  if (kitchen) out.push("/cocina");
  return out;
}
assert(
  JSON.stringify(navLinks(false, true)) === JSON.stringify(["/pos", "/cocina"]),
  "nav rotisería: POS + Cocina sin Mesas",
);
assert(
  JSON.stringify(navLinks(true, true)) === JSON.stringify(["/pos", "/mesas", "/cocina"]),
  "nav restaurante: POS + Mesas + Cocina",
);
assert(
  JSON.stringify(navLinks(false, false)) === JSON.stringify(["/pos"]),
  "nav ambos off: solo POS",
);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed\n`);
  process.exit(1);
}
console.log("\nGastro subtype self-test PASS\n");
