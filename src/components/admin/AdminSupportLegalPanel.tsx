import { FileText, MessageCircle, Shield } from "lucide-react";
import { Button } from "../ui";
import { openExternalUrl, openWhatsApp } from "../../lib/openExternal";
import {
  PRIVACY_POLICY_URL,
  supportWhatsAppMessage,
  SUPPORT_WHATSAPP,
  SUPPORT_WHATSAPP_DISPLAY,
  TERMS_URL,
} from "../../config/support";

export default function AdminSupportLegalPanel() {
  return (
    <section className="rounded-xl border border-[var(--color-panel-border)] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Shield size={16} className="text-brand-600" />
        Soporte y legal
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        WhatsApp oficial y textos de privacidad / términos para compartir en Mercado Libre o con
        clientes.
      </p>
      <p className="mt-2 text-sm text-ink">{SUPPORT_WHATSAPP_DISPLAY}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => void openWhatsApp(SUPPORT_WHATSAPP, supportWhatsAppMessage())}
        >
          <MessageCircle size={16} /> Abrir WhatsApp
        </Button>
        <Button variant="secondary" onClick={() => void openExternalUrl(PRIVACY_POLICY_URL)}>
          <FileText size={16} /> Política de privacidad
        </Button>
        <Button variant="secondary" onClick={() => void openExternalUrl(TERMS_URL)}>
          <FileText size={16} /> Términos de uso
        </Button>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Los datos del negocio (ventas, clientes, stock) quedan en la PC del comercio. Solo la
        activación de licencia consulta internet (ID de equipo + clave).
      </p>
    </section>
  );
}
