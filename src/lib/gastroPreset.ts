import {
  DEFAULT_GASTRO_SUBTYPE,
  GASTRO_SUBTYPES,
  type GastroSubtype,
  resolveGastroSubtype,
} from "../config/gastroSubtypes";
import { ensureSuggestedCategories } from "../db/categories";
import { listKitchenStations, saveKitchenStation } from "../db/kitchen";
import { getSetting, setSetting } from "../db/settings";

export const GASTRO_SUBTYPE_SETTING = "gastro_subtype";
export const GASTRO_PRESET_APPLIED_SETTING = "gastro_preset_applied";
export const KITCHEN_ENABLED_SETTING = "kitchen_enabled";
export const POS_FULFILLMENT_ENABLED_SETTING = "pos_fulfillment_enabled";
export const WAITER_PHONES_ENABLED_SETTING = "waiter_phones_enabled";

export interface ApplyGastroPresetOpts {
  /** Si true, reescribe settings aunque ya haya plantilla aplicada. */
  force?: boolean;
}

/** Una sola escritura de plantilla salvo force explícito. */
export function gastroPresetShouldRewrite(
  alreadyApplied: boolean,
  force?: boolean,
): boolean {
  return !alreadyApplied || Boolean(force);
}

/**
 * Aplica la plantilla del subtipo a settings (mesas, cocina, fulfillment, carta, categorías).
 * No toca licencias ni cupos del plan.
 */
export async function applyGastroPreset(
  subtype: GastroSubtype,
  opts?: ApplyGastroPresetOpts,
): Promise<{ applied: boolean; subtype: GastroSubtype }> {
  const def = GASTRO_SUBTYPES[subtype];
  if (!def) return { applied: false, subtype };

  const already = (await getSetting(GASTRO_PRESET_APPLIED_SETTING)) === "1";
  if (!gastroPresetShouldRewrite(already, opts?.force)) {
    await setSetting(GASTRO_SUBTYPE_SETTING, subtype);
    return { applied: false, subtype };
  }

  const p = def.preset;
  await setSetting(GASTRO_SUBTYPE_SETTING, subtype);
  await setSetting("tables_enabled", p.tables ? "1" : "0");
  await setSetting(KITCHEN_ENABLED_SETTING, p.kitchen ? "1" : "0");
  await setSetting(WAITER_PHONES_ENABLED_SETTING, p.waiterPhones ? "1" : "0");
  await setSetting(POS_FULFILLMENT_ENABLED_SETTING, p.posFulfillment ? "1" : "0");
  await setSetting("menu_portal_pickup", p.menuPickup ? "1" : "0");
  await setSetting("menu_portal_delivery", p.menuDelivery ? "1" : "0");
  await setSetting(GASTRO_PRESET_APPLIED_SETTING, "1");

  if (p.suggestedCategories.length) {
    await ensureSuggestedCategories(p.suggestedCategories);
  }

  try {
    const existing = await listKitchenStations({ includeInactive: true });
    const names = new Set(existing.map((s) => s.name.trim().toLowerCase()));
    for (const name of p.suggestedStations) {
      if (names.has(name.trim().toLowerCase())) continue;
      await saveKitchenStation({ name });
    }
  } catch {
    /* estaciones opcionales al alta */
  }

  return { applied: true, subtype };
}

/** Lee el subtipo guardado; null = comercio viejo sin plantilla. */
export async function loadGastroSubtype(): Promise<GastroSubtype | null> {
  return resolveGastroSubtype(await getSetting(GASTRO_SUBTYPE_SETTING));
}

/** Subtipo efectivo para copy/UI (viejos → restaurante). */
export async function effectiveGastroSubtype(): Promise<GastroSubtype> {
  return (await loadGastroSubtype()) ?? DEFAULT_GASTRO_SUBTYPE;
}
