import { formatUserError } from "./userError";

export interface UserNoticeOptions {
  title?: string;
  message: string;
  variant?: "error" | "info" | "success";
  confirmLabel?: string;
  onConfirm?: () => void;
}

type NoticeHandler = (options: UserNoticeOptions) => void;

let handler: NoticeHandler | null = null;

export function registerNoticeHandler(fn: NoticeHandler | null): void {
  handler = fn;
}

export function showNotice(options: UserNoticeOptions): void {
  if (handler) {
    handler(options);
    return;
  }
  alert(options.message);
}

export function showUserError(e: unknown, title = "Algo salió mal"): void {
  showNotice({
    title,
    message: formatUserError(e),
    variant: "error",
    confirmLabel: "Entendido",
  });
}

export function showUserSuccess(message: string, title = "Listo"): void {
  showNotice({
    title,
    message,
    variant: "success",
    confirmLabel: "Entendido",
  });
}
