import { getAllSettings, setSetting } from "../db/settings";
import { getBusinessLogoUrl } from "../lib/brandingApi";

export interface PrintBrandingSettings {
  showLogo: boolean;
  phone: string;
  whatsapp: string;
  address: string;
  instagram: string;
  email: string;
  website: string;
  footer: string;
}

export interface PrintBranding extends PrintBrandingSettings {
  businessName: string;
  logoDataUrl: string | null;
}

export const PRINT_SETTING_KEYS = {
  showLogo: "print_show_logo",
  phone: "print_phone",
  whatsapp: "print_whatsapp",
  address: "print_address",
  instagram: "print_instagram",
  email: "print_email",
  website: "print_website",
  footer: "print_footer",
} as const;

export function parsePrintBrandingSettings(
  settings: Record<string, string>,
): PrintBrandingSettings {
  return {
    showLogo: settings.print_show_logo !== "0",
    phone: settings.print_phone?.trim() ?? "",
    whatsapp: settings.print_whatsapp?.trim() ?? "",
    address: settings.print_address?.trim() ?? "",
    instagram: settings.print_instagram?.trim() ?? "",
    email: settings.print_email?.trim() ?? "",
    website: settings.print_website?.trim() ?? "",
    footer: settings.print_footer?.trim() ?? "",
  };
}

export async function getPrintBrandingSettings(): Promise<PrintBrandingSettings> {
  const settings = await getAllSettings();
  return parsePrintBrandingSettings(settings);
}

export async function savePrintBrandingSettings(
  patch: Partial<PrintBrandingSettings>,
): Promise<void> {
  if (patch.showLogo !== undefined) {
    await setSetting(PRINT_SETTING_KEYS.showLogo, patch.showLogo ? "1" : "0");
  }
  if (patch.phone !== undefined) await setSetting(PRINT_SETTING_KEYS.phone, patch.phone.trim());
  if (patch.whatsapp !== undefined) {
    await setSetting(PRINT_SETTING_KEYS.whatsapp, patch.whatsapp.trim());
  }
  if (patch.address !== undefined) await setSetting(PRINT_SETTING_KEYS.address, patch.address.trim());
  if (patch.instagram !== undefined) {
    await setSetting(PRINT_SETTING_KEYS.instagram, patch.instagram.trim());
  }
  if (patch.email !== undefined) await setSetting(PRINT_SETTING_KEYS.email, patch.email.trim());
  if (patch.website !== undefined) await setSetting(PRINT_SETTING_KEYS.website, patch.website.trim());
  if (patch.footer !== undefined) await setSetting(PRINT_SETTING_KEYS.footer, patch.footer.trim());
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function loadPrintBranding(businessName: string): Promise<PrintBranding> {
  const settings = await getPrintBrandingSettings();
  let logoDataUrl: string | null = null;
  if (settings.showLogo) {
    const url = await getBusinessLogoUrl();
    if (url) logoDataUrl = await urlToDataUrl(url);
  }
  return {
    businessName: businessName.trim() || "Mi Comercio",
    logoDataUrl,
    ...settings,
  };
}
