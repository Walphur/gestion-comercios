import { BookOpen, FileText, LifeBuoy, MessageCircle } from "lucide-react";
import { PRIVACY_POLICY_URL, TERMS_URL } from "../config/support";
import { openHelpCenter, openSupportWhatsApp } from "../lib/supportContact";
import { openExternalUrl } from "../lib/openExternal";

interface Props {
  className?: string;
  variant?: "default" | "muted";
}

export default function SupportLegalLinks({ className = "", variant = "default" }: Props) {
  const isMuted = variant === "muted";
  const btnClass = isMuted
    ? "rounded-md px-2 py-1 text-[10px] font-medium text-white/65 transition hover:bg-white/10 hover:text-white"
    : "rounded-md px-2 py-1 text-[11px] font-medium text-ink-muted transition hover:bg-brand-50 hover:text-brand-800 dark:hover:bg-brand-900/30 dark:hover:text-brand-200";

  function openWeb(url: string) {
    void openExternalUrl(url).catch((e) => {
      alert(e instanceof Error ? e.message : String(e));
    });
  }

  return (
    <div className={`flex flex-wrap items-center justify-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => void openSupportWhatsApp()}
        className={`inline-flex items-center gap-1 ${btnClass}`}
      >
        <MessageCircle size={12} />
        Soporte
      </button>
      <button type="button" onClick={() => openHelpCenter()} className={`inline-flex items-center gap-1 ${btnClass}`}>
        <BookOpen size={12} />
        Ayuda
      </button>
      <button type="button" onClick={() => openWeb(PRIVACY_POLICY_URL)} className={`inline-flex items-center gap-1 ${btnClass}`}>
        <FileText size={12} />
        Privacidad
      </button>
      <button type="button" onClick={() => openWeb(TERMS_URL)} className={`inline-flex items-center gap-1 ${btnClass}`}>
        <LifeBuoy size={12} />
        Términos
      </button>
    </div>
  );
}
