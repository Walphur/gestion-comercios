import { Users } from "lucide-react";
import { openCommunityGroup } from "../lib/supportContact";

interface Props {
  variant?: "sidebar" | "card";
  className?: string;
}

export default function CommunityGroupButton({ variant = "sidebar", className = "" }: Props) {
  if (variant === "card") {
    return (
      <button
        type="button"
        onClick={() => openCommunityGroup()}
        className={`flex w-full items-center gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-left transition hover:border-sky-500/50 hover:bg-sky-500/15 ${className}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
          <Users size={22} />
        </span>
        <span>
          <span className="block text-sm font-semibold text-ink">Grupo comerciantes</span>
          <span className="block text-xs text-ink-muted">
            Precios, tips y novedades — Argentina
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openCommunityGroup()}
      className={`flex w-full items-center gap-3 rounded-xl border border-white/25 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 active:scale-[0.98] ${className}`}
    >
      <Users size={18} />
      Grupo comerciantes
    </button>
  );
}
