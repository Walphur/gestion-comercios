import { invoke } from "@tauri-apps/api/core";
import { confirmAction } from "./confirm";
import { resolveAppVersion } from "./appVersion";
import { relaunch } from "@tauri-apps/plugin-process";
import { entitlementBlockedMessage } from "../config/planEntitlements";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  message: string;
}

interface UpdateCheck {
  update: { version: string; current_version: string; pinned: boolean } | null;
  /** Licencia Permanente: canal fijo (src-tauri/src/updates.rs → PERMANENT_UPDATE_ENDPOINT). */
  pinned: boolean;
}

/** El canal lo elige Rust según la licencia: la Permanente llega hasta la versión fija y no más. */
function checkForUpdate(): Promise<UpdateCheck> {
  return invoke<UpdateCheck>("update_check");
}

/** Solo mira si hay update (sin descargar). */
export async function peekAvailableUpdate(): Promise<{ version: string; currentVersion: string } | null> {
  const currentVersion = await resolveAppVersion();
  try {
    const { update } = await checkForUpdate();
    if (!update) return null;
    return { version: update.version, currentVersion };
  } catch {
    return null;
  }
}

/** Busca la actualización de esta licencia en GitHub Releases y la instala. */
export async function checkAndInstallUpdate(silent = false): Promise<UpdateInfo> {
  const currentVersion = await resolveAppVersion();

  try {
    const { update, pinned } = await checkForUpdate();
    if (!update) {
      return {
        available: false,
        currentVersion,
        message: silent ? "" : pinned ? entitlementBlockedMessage("autoUpdates") : "Ya tenés la última versión instalada.",
      };
    }

    if (!silent) {
      const ok = await confirmAction({
        title: "Actualización disponible",
        message: `Hay una versión nueva (v${update.version}).`,
        detail: "¿Descargar e instalar ahora? La app se reiniciará.",
        variant: "default",
        confirmLabel: "Actualizar ahora",
      });
      if (!ok) {
        return {
          available: true,
          currentVersion,
          latestVersion: update.version,
          message: "Actualización disponible (instalación cancelada).",
        };
      }
    }

    const installed = await invoke<string | null>("update_install");
    if (!installed) {
      return { available: false, currentVersion, message: silent ? "" : "Ya tenés la última versión instalada." };
    }
    await relaunch();

    return {
      available: true,
      currentVersion,
      latestVersion: installed,
      message: `Actualizado a v${installed}. Reiniciando…`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (silent && (msg.includes("Not allowed") || msg.includes("unsupported"))) {
      return { available: false, currentVersion, message: "" };
    }
    if (
      msg.includes("Could not fetch") ||
      msg.includes("valid release JSON") ||
      msg.includes("404") ||
      msg.includes("Not Found")
    ) {
      return {
        available: false,
        currentVersion,
        message:
          "No se pudo leer el release en GitHub. Si el repositorio es privado, ejecutá scripts/habilitar-releases-publicos.ps1. Si ya es público, publicá una versión con .\\scripts\\publicar.ps1.",
      };
    }
    return {
      available: false,
      currentVersion,
      message: `No se pudo buscar actualizaciones: ${msg}`,
    };
  }
}
