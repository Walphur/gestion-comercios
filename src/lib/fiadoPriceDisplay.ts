import { getSetting, setSetting } from "../db/settings";

/** «1» (o sin cargar): el cambio de precio se ve dentro de cada compra; «0»: en un renglón aparte. */
const KEY = "fiado_price_in_purchase";

export async function loadPriceInPurchase(): Promise<boolean> {
  try {
    return (await getSetting(KEY)) !== "0";
  } catch {
    return true;
  }
}

export async function savePriceInPurchase(on: boolean): Promise<void> {
  await setSetting(KEY, on ? "1" : "0");
}
