import { MessageCircle, Package } from "lucide-react";
import { catalogSupportWhatsAppMessage, CATALOG_SALES_WHATSAPP } from "../config/catalogSales";
import { openWhatsApp } from "../lib/openExternal";

interface Props {
  className?: string;
  /** Menos texto, para la barra lateral de Productos. */
  compact?: boolean;
}

export default function SupermarketCatalogOffer({ className = "", compact = false }: Props) {
  async function handleClick() {
    try {
      const { copied } = await openWhatsApp(
        CATALOG_SALES_WHATSAPP,
        catalogSupportWhatsAppMessage(),
      );
      if (copied) {
        alert("El mensaje se copió al portapapeles. Pegalo en WhatsApp al abrir el chat.");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className={`group rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-4 py-3 text-left shadow-sm transition hover:border-brand-400/80 hover:bg-brand-50/40 dark:hover:bg-brand-900/20 ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
          <Package size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight text-ink">Catálogo super</p>
          <p className="text-xs text-ink-muted">+200.000 productos · incluido en tu plan</p>
        </div>
        <MessageCircle
          size={18}
          className="shrink-0 text-brand-600 opacity-60 transition group-hover:opacity-100 dark:text-brand-400"
        />
      </div>
      {!compact && (
        <p className="mt-2 text-xs text-ink-muted">
          Importá desde Productos → Importar, o pedí ayuda por WhatsApp.
        </p>
      )}
    </button>
  );
}
