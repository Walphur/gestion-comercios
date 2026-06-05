import { invoke } from "@tauri-apps/api/core";
import { getSetting } from "../db/settings";
import {
  entityAllowedForSync,
} from "../config/multiPcSync";
import { parseProModules } from "../config/modules";
import type { Rubro } from "../types";

export type WorkshopSyncRole = "off" | "workshop" | "counter";

export type WorkshopSyncEntity =
  | "customer"
  | "vehicle"
  | "appointment"
  | "quote"
  | "service_order";

export interface WorkshopSyncStatus {
  enabled: boolean;
  role: WorkshopSyncRole;
  role_label: string;
  device_id: string;
  folder_path: string | null;
  pending_exports: number;
  last_import_count: number;
  last_import_at: string | null;
  last_export_at: string | null;
  last_error: string | null;
}

export function getWorkshopSyncStatus(): Promise<WorkshopSyncStatus> {
  return invoke<WorkshopSyncStatus>("get_workshop_sync_status_cmd");
}

export function setWorkshopSyncConfig(
  role: WorkshopSyncRole,
  folderPath?: string | null,
): Promise<void> {
  return invoke("set_workshop_sync_config", {
    role,
    folderPath: folderPath ?? null,
  });
}

export function pickWorkshopSyncFolder(): Promise<string | null> {
  return invoke<string | null>("pick_workshop_sync_folder");
}

export function queueWorkshopExport(
  entityType: WorkshopSyncEntity,
  entityId: number,
): Promise<void> {
  return invoke("queue_workshop_export", { entityType, entityId });
}

/** Encola export si falla (sync desactivada) no interrumpe el guardado. */
export async function notifyWorkshopSync(
  entityType: WorkshopSyncEntity,
  entityId: number,
): Promise<void> {
  try {
    const [rubroRaw, proPlanRaw, modulesRaw] = await Promise.all([
      getSetting("rubro"),
      getSetting("pro_plan_enabled"),
      getSetting("pro_modules"),
    ]);
    const rubro = (rubroRaw ?? "kiosco") as Rubro;
    const proPlan = proPlanRaw === "1";
    const modules = parseProModules(modulesRaw ?? undefined);
    if (!entityAllowedForSync(entityType, rubro, proPlan, modules)) {
      return;
    }
    await queueWorkshopExport(entityType, entityId);
    await runWorkshopSyncNow();
  } catch {
    /* sync desactivada o sin carpeta */
  }
}

export function runWorkshopSyncNow(): Promise<WorkshopSyncStatus> {
  return invoke<WorkshopSyncStatus>("run_workshop_sync_now");
}
