import { AlertTriangle, HelpCircle, Trash2 } from "lucide-react";
import { Button } from "./ui";

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
}

interface Props {
  open: boolean;
  options: ConfirmDialogOptions;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, options, onConfirm, onCancel }: Props) {
  if (!open) return null;

  const isDanger = options.variant === "danger";
  const Icon = isDanger ? Trash2 : options.variant === "default" ? HelpCircle : AlertTriangle;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-brand-950/55 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] shadow-2xl shadow-brand-950/25"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-4 p-6">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              isDanger
                ? "bg-red-500/15 text-red-600 dark:text-red-400"
                : "bg-brand-500/15 text-brand-600 dark:text-brand-300"
            }`}
          >
            <Icon size={24} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="font-display text-lg font-semibold text-ink">
              {options.title ?? (isDanger ? "¿Confirmar eliminación?" : "¿Confirmar?")}
            </h2>
            <p id="confirm-message" className="mt-2 text-sm leading-relaxed text-ink">
              {options.message}
            </p>
            {options.detail && (
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">{options.detail}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-panel-border)] px-6 py-4">
          <Button
            variant="secondary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancel}
          >
            {options.cancelLabel ?? "Cancelar"}
          </Button>
          <Button
            variant={isDanger ? "danger" : "primary"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onConfirm}
          >
            {options.confirmLabel ?? (isDanger ? "Sí, eliminar" : "Aceptar")}
          </Button>
        </div>
      </div>
    </div>
  );
}
