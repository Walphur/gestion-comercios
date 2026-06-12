import { FileText, MessageCircle } from "lucide-react";
import { openExternalUrl, openWhatsApp } from "../lib/openExternal";
import {
  PRIVACY_POLICY_URL,
  supportWhatsAppMessage,
  SUPPORT_WHATSAPP,
  TERMS_URL,
} from "../config/support";

interface Props {
  className?: string;
  /** En pantallas oscuras (sidebar). */
  variant?: "default" | "muted";
}

export default function SupportLegalLinks({ className = "", variant = "default" }: Props) {
  const linkClass =
    variant === "muted"
      ? "text-white/55 hover:text-white/90 underline-offset-2 hover:underline"
      : "text-ink-muted hover:text-brand-700 dark:hover:text-brand-300 underline-offset-2 hover:underline";

  async function openSupport() {
    try {
      await openWhatsApp(SUPPORT_WHATSAPP, supportWhatsAppMessage());
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs ${className}`}>
      <button type="button" onClick={() => void openSupport()} className={`inline-flex items-center gap-1 ${linkClass}`}>
        <MessageCircle size={12} />
        Soporte
      </button>
      <span className={variant === "muted" ? "text-white/30" : "text-ink-muted/40"}>·</span>
      <button
        type="button"
        onClick={() => void openExternalUrl(PRIVACY_POLICY_URL)}
        className={`inline-flex items-center gap-1 ${linkClass}`}
      >
        <FileText size={12} />
        Privacidad
      </button>
      <span className={variant === "muted" ? "text-white/30" : "text-ink-muted/40"}>·</span>
      <button
        type="button"
        onClick={() => void openExternalUrl(TERMS_URL)}
        className={`inline-flex items-center gap-1 ${linkClass}`}
      >
        <FileText size={12} />
        Términos
      </button>
    </div>
  );
}
