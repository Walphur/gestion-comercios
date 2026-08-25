import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { registerFlashHandler, type FlashOptions } from "../lib/notice";

/** Toast verde/rojo no bloqueante para “Guardado” / errores de validación. */
export default function SavedFlashHost() {
  const [flash, setFlash] = useState<FlashOptions | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    registerFlashHandler((opts) => {
      setFlash(opts);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setFlash(null), opts.durationMs ?? 2200);
    });
    return () => {
      registerFlashHandler(null);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!flash) return null;

  const ok = flash.variant !== "error";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-[200] flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-lg ${
          ok
            ? "border-emerald-500/35 bg-emerald-500 text-white"
            : "border-red-500/40 bg-red-600 text-white"
        }`}
      >
        {ok ? <Check size={18} className="shrink-0" /> : <X size={18} className="shrink-0" />}
        <span className="min-w-0">{flash.message}</span>
      </div>
    </div>
  );
}
