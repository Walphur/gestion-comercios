import { MessageCircle } from "lucide-react";
import { openVirtualAssist } from "../lib/supportContact";

interface Props {
  /** Barra lateral oscura. */
  variant?: "sidebar" | "card";
  className?: string;
}

export default function VirtualAssistButton({ variant = "sidebar", className = "" }: Props) {
  if (variant === "card") {
    return (
      <button
        type="button"
        onClick={() => void openVirtualAssist()}
        className={`flex w-full items-center gap-3 rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4 text-left transition hover:border-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-900/20 ${className}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <MessageCircle size={22} />
        </span>
        <span>
          <span className="block text-sm font-semibold text-ink">Asistencia virtual</span>
          <span className="block text-xs text-ink-muted">WhatsApp directo con Waltech</span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void openVirtualAssist()}
      className={`flex w-full items-center gap-3 rounded-xl bg-brand-700 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 ${className}`}
    >
      <MessageCircle size={18} />
      Asistencia virtual
    </button>
  );
}
