import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  message: string;
}

/** Busca actualización en GitHub Releases y la instala en silencio si hay internet. */
export async function checkAndInstallUpdate(
  silent = false,
): Promise<UpdateInfo> {
  let currentVersion = "0.0.0";
  try {
    currentVersion = await getVersion();
  } catch {
    /* fuera de Tauri */
  }

  try {
    const update = await check();
    if (!update) {
      return {
        available: false,
        currentVersion,
        message: silent ? "" : "Ya tenés la última versión instalada.",
      };
    }

    if (!silent) {
      const ok = confirm(
        `Hay una actualización disponible (v${update.version}).\n\n¿Descargar e instalar ahora? La app se reiniciará.`,
      );
      if (!ok) {
        return {
          available: true,
          currentVersion,
          latestVersion: update.version,
          message: "Actualización disponible (instalación cancelada).",
        };
      }
    }

    await update.downloadAndInstall();
    await relaunch();

    return {
      available: true,
      currentVersion,
      latestVersion: update.version,
      message: `Actualizado a v${update.version}. Reiniciando…`,
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
