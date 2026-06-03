import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getCatalogImportStatus, type CatalogImportStatus } from "../lib/tauri";

export default function CatalogImportOverlay() {
  const [status, setStatus] = useState<CatalogImportStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await getCatalogImportStatus();
        if (alive) setStatus(s);
      } catch {
        if (alive) setStatus(null);
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!status?.importing) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-950/75 p-6 backdrop-blur-sm">
      <div className="max-w-md rounded-2xl border border-brand-700/40 bg-white p-8 text-center shadow-xl">
        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-brand-600" />
        <h2 className="font-display text-lg font-semibold text-ink">
          Preparando catálogo de productos
        </h2>
        <p className="mt-3 text-sm text-ink-muted">{status.message}</p>
        <p className="mt-4 text-xs text-ink-muted">
          Es la primera instalación. Podés dejar la app abierta; cuando termine podés vender con normalidad.
        </p>
      </div>
    </div>
  );
}
