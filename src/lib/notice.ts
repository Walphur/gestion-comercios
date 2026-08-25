import { formatUserError } from "./userError";

export interface UserNoticeOptions {
  title?: string;
  message: string;
  variant?: "error" | "info" | "success";
  confirmLabel?: string;
  onConfirm?: () => void;
}

export interface FlashOptions {
  message: string;
  variant?: "success" | "error";
  durationMs?: number;
}

type NoticeHandler = (options: UserNoticeOptions) => void;
type FlashHandler = (options: FlashOptions) => void;

let handler: NoticeHandler | null = null;
let flashHandler: FlashHandler | null = null;

export function registerNoticeHandler(fn: NoticeHandler | null): void {
  handler = fn;
}

export function registerFlashHandler(fn: FlashHandler | null): void {
  flashHandler = fn;
}

export function showNotice(options: UserNoticeOptions): void {
  if (handler) {
    handler(options);
    return;
  }
  alert(options.message);
}

/** Toast verde/rojo no bloqueante (guardar / registrar / validación). */
export function showFlash(options: FlashOptions): void {
  if (flashHandler) {
    flashHandler(options);
    return;
  }
  if (options.variant === "error") {
    showNotice({ title: "Revisá los datos", message: options.message, variant: "error" });
    return;
  }
  showNotice({ title: "Listo", message: options.message, variant: "success" });
}

export function showUserError(e: unknown, title = "Algo salió mal"): void {
  showNotice({
    title,
    message: formatUserError(e),
    variant: "error",
    confirmLabel: "Entendido",
  });
}

/** Éxito al guardar/registrar: toast verde (sin modal). */
export function showUserSuccess(message: string, _title = "Listo"): void {
  showFlash({ message, variant: "success" });
}
