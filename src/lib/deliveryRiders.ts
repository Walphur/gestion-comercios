import { listDeliveryCadetes, type DeliveryCadete } from "../db/users";
import { getSetting, setSetting } from "../db/settings";

export const DELIVERY_RIDERS_KEY = "gastronomia_delivery_riders";

export type { DeliveryCadete };

/**
 * Cadetes para asignar en deliveries.
 * Preferencia: usuarios marcados como cadete. Si no hay, usa la lista legacy (nombres).
 */
export async function loadDeliveryCadetes(): Promise<DeliveryCadete[]> {
  try {
    const fromUsers = await listDeliveryCadetes();
    if (fromUsers.length > 0) return fromUsers;
  } catch {
    /* columna aún no migrada en sesión vieja */
  }

  const legacy = await loadLegacyRiderNames();
  return legacy.map((name, i) => ({
    id: -(i + 1),
    display_name: name,
    phone: null,
  }));
}

/** @deprecated Prefer loadDeliveryCadetes — nombres sueltos sin WhatsApp. */
export async function loadDeliveryRiders(): Promise<string[]> {
  const cadetes = await loadDeliveryCadetes();
  return cadetes.map((c) => c.display_name);
}

async function loadLegacyRiderNames(): Promise<string[]> {
  const raw = await getSetting(DELIVERY_RIDERS_KEY);
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function saveDeliveryRiders(riders: string[]): Promise<void> {
  const cleaned = riders.map((r) => r.trim()).filter(Boolean);
  await setSetting(DELIVERY_RIDERS_KEY, cleaned.join("\n"));
}
