import { invoke } from "@tauri-apps/api/core";

export interface WhatsAppTurnosConfig {
  enabled: boolean;
  phone_number_id: string;
  access_token_set: boolean;
  api_token_set: boolean;
  webhook_verify_token: string;
  reminder_hours: number;
  template_name: string;
  template_lang: string;
  webhook_url: string;
  registered: boolean;
}

export interface WhatsAppTurnosStatus {
  configured: boolean;
  enabled: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  pending_updates: number;
}

export function getWhatsAppTurnosConfig(): Promise<WhatsAppTurnosConfig> {
  return invoke<WhatsAppTurnosConfig>("whatsapp_turnos_get_config");
}

export function saveWhatsAppTurnosConfig(input: {
  enabled: boolean;
  phoneNumberId: string;
  accessToken?: string;
  reminderHours: number;
  templateName: string;
  templateLang: string;
}): Promise<WhatsAppTurnosConfig> {
  return invoke<WhatsAppTurnosConfig>("whatsapp_turnos_save_config", {
    enabled: input.enabled,
    phoneNumberId: input.phoneNumberId,
    accessToken: input.accessToken ?? null,
    reminderHours: input.reminderHours,
    templateName: input.templateName,
    templateLang: input.templateLang,
  });
}

export function registerWhatsAppTurnos(businessName: string): Promise<WhatsAppTurnosConfig> {
  return invoke<WhatsAppTurnosConfig>("whatsapp_turnos_register", { businessName });
}

export function getWhatsAppTurnosStatus(): Promise<WhatsAppTurnosStatus> {
  return invoke<WhatsAppTurnosStatus>("whatsapp_turnos_get_status");
}

export function syncWhatsAppTurnosNow(): Promise<WhatsAppTurnosStatus> {
  return invoke<WhatsAppTurnosStatus>("whatsapp_turnos_sync_now");
}
