/** Reemplazos de los plugins de Tauri que en el navegador no hacen falta o son triviales. */

export async function getVersion(): Promise<string> {
  return __APP_VERSION__;
}

export async function listen(): Promise<() => void> {
  return () => {};
}

export async function emit(): Promise<void> {}

export async function openUrl(url: string): Promise<void> {
  window.open(url, "_blank", "noopener");
}

export async function relaunch(): Promise<void> {
  location.reload();
}

export async function exit(): Promise<void> {}

export async function check(): Promise<null> {
  return null;
}
