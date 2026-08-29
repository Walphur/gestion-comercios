import { getSetting, setSetting } from "../db/settings";

export interface QrPaymentProvider {
  id: string;
  label: string;
  active: boolean;
}

export const POS_QR_PROVIDERS_SETTING = "pos_qr_providers";

export const DEFAULT_QR_PROVIDERS: QrPaymentProvider[] = [
  { id: "qr", label: "QR (otro)", active: true },
  { id: "qr_bna", label: "QR BNA", active: false },
  { id: "qr_santander", label: "QR Santander", active: false },
  { id: "qr_brubank", label: "QR Brubank", active: false },
  { id: "qr_uala", label: "QR Ualá", active: false },
  { id: "qr_naranjax", label: "QR Naranja X", active: false },
];

export function parseQrProviders(raw: string | null | undefined): QrPaymentProvider[] {
  if (!raw?.trim()) return [...DEFAULT_QR_PROVIDERS];
  try {
    const parsed = JSON.parse(raw) as QrPaymentProvider[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_QR_PROVIDERS];
    return parsed
      .filter((p) => p?.id && p?.label)
      .map((p) => ({
        id: String(p.id),
        label: String(p.label).trim(),
        active: Boolean(p.active),
      }));
  } catch {
    return [...DEFAULT_QR_PROVIDERS];
  }
}

export async function loadQrProviders(): Promise<QrPaymentProvider[]> {
  return parseQrProviders(await getSetting(POS_QR_PROVIDERS_SETTING));
}

export async function saveQrProviders(providers: QrPaymentProvider[]): Promise<void> {
  await setSetting(POS_QR_PROVIDERS_SETTING, JSON.stringify(providers));
}

export function activeQrPaymentIds(providers: QrPaymentProvider[]): string[] {
  const active = providers.filter((p) => p.active).map((p) => p.id);
  return active.length ? active : ["qr"];
}

export function qrProviderLabel(providers: QrPaymentProvider[], id: string): string {
  return providers.find((p) => p.id === id)?.label ?? id;
}
