import { BookOpen, FileText, LifeBuoy, Shield } from "lucide-react";
import { Button } from "../ui";
import { openExternalUrl } from "../../lib/openExternal";
import { openHelpCenter, openVirtualAssist } from "../../lib/supportContact";
import {
  HELP_CENTER_URL,
  PRIVACY_POLICY_URL,
  SUPPORT_WHATSAPP_DISPLAY,
  TERMS_URL,
} from "../../config/support";

export default function AdminSupportLegalPanel() {
  function openWeb(url: string) {
    void openExternalUrl(url).catch((e) => {
      alert(e instanceof Error ? e.message : String(e));
    });
  }

  return (
    <section className="rounded-xl border border-[var(--color-panel-border)] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Shield size={16} className="text-brand-600" />
        Soporte y legal
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Centro de ayuda, videos y textos legales. Compartí los links en Mercado Libre.
      </p>
      <p className="mt-2 text-sm text-ink">WhatsApp: {SUPPORT_WHATSAPP_DISPLAY}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void openVirtualAssist()}>
          <LifeBuoy size={16} /> Asistencia virtual
        </Button>
        <Button variant="secondary" onClick={() => openHelpCenter()}>
          <BookOpen size={16} /> Centro de ayuda
        </Button>
        <Button variant="secondary" onClick={() => openWeb(PRIVACY_POLICY_URL)}>
          <FileText size={16} /> Privacidad
        </Button>
        <Button variant="secondary" onClick={() => openWeb(TERMS_URL)}>
          <FileText size={16} /> Términos
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink-muted break-all">{HELP_CENTER_URL}</p>
    </section>
  );
}
