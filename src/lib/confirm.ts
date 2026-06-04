import type { ConfirmDialogOptions } from "../components/ConfirmDialog";

type ConfirmInput = string | ConfirmDialogOptions;

let handler: ((options: ConfirmDialogOptions) => Promise<boolean>) | null = null;

export function registerConfirmHandler(
  fn: (options: ConfirmDialogOptions) => Promise<boolean>,
) {
  handler = fn;
}

function normalize(input: ConfirmInput): ConfirmDialogOptions {
  if (typeof input === "string") {
    return { message: input, variant: "danger" };
  }
  return {
    variant: "danger",
    ...input,
  };
}

/** Confirmación visual para borrar, anular, vaciar, etc. */
export async function confirmAction(input: ConfirmInput): Promise<boolean> {
  if (!handler) {
    const opts = normalize(input);
    return window.confirm(
      opts.detail ? `${opts.message}\n\n${opts.detail}` : opts.message,
    );
  }
  return handler(normalize(input));
}

export async function confirmDiscard(
  message = "¿Cerrar sin guardar los cambios?",
): Promise<boolean> {
  return confirmAction({
    title: "Cambios sin guardar",
    message,
    variant: "default",
    confirmLabel: "Cerrar sin guardar",
    cancelLabel: "Seguir editando",
  });
}

/** Atajo para eliminaciones con nombre del ítem. */
export async function confirmDelete(itemLabel: string, extra?: string): Promise<boolean> {
  return confirmAction({
    title: "Eliminar",
    message: `¿Eliminar «${itemLabel}»?`,
    detail: extra ?? "Esta acción no se puede deshacer.",
    variant: "danger",
    confirmLabel: "Sí, eliminar",
  });
}
