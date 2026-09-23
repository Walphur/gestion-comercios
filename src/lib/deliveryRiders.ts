import { getSetting, setSetting } from "../db/settings";

export const DELIVERY_RIDERS_KEY = "gastronomia_delivery_riders";

/** Lista de cadetes (nombres) para asignar en pedidos delivery. */
export async function loadDeliveryRiders(): Promise<string[]> {
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
