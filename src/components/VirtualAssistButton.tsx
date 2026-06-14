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
        className={`flex w-full items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-left transition hover:border-emerald-500/50 hover:bg-emerald-500/15 ${className}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
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
      className={`flex w-full items-center gap-3 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98] ${className}`}
    >
      <MessageCircle size={18} />
      Asistencia virtual
    </button>
  );
}
