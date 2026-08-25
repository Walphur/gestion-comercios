import { ArrowUpRight } from "lucide-react";
import walqoSolo from "../assets/branding/walqo-solo.png";
import { openExternalUrl } from "../lib/openExternal";

const PLANS_URL = "https://walqo.pro/#planes";

/** Marca WalQo en sidebar, login y cabeceras (logo grande, sin texto “WalQo” duplicado). */
export default function WalTechCredit({
  className = "",
  variant = "sidebar",
}: {
  className?: string;
  variant?: "sidebar" | "light" | "header";
}) {
  const isSidebar = variant === "sidebar";
  const isHeader = variant === "header";

  function openPlans() {
    void openExternalUrl(PLANS_URL).catch((e) => {
      alert(e instanceof Error ? e.message : String(e));
    });
  }

  if (isSidebar) {
    return (
      <div className={`min-w-0 select-none ${className}`} title="WalQo — Sistema POS">
        <div className="flex items-center gap-2.5">
          <img
            src={walqoSolo}
            alt="WalQo"
            className="h-11 w-11 shrink-0 object-contain drop-shadow-md"
            draggable={false}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[10px] font-medium uppercase tracking-wide text-white/55">
              <span>Sistema POS</span>
              <span aria-hidden className="text-white/30">
                ·
              </span>
              <button
                type="button"
                onClick={openPlans}
                className="inline-flex items-center gap-0.5 normal-case tracking-normal text-white/75 transition hover:text-sky-200"
              >
                Planes
                <ArrowUpRight size={11} strokeWidth={2.25} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center select-none ${className}`}
      title="WalQo — Sistema POS"
    >
      <img
        src={walqoSolo}
        alt="WalQo"
        className={`object-contain drop-shadow-sm ${isHeader ? "h-12 w-12" : "h-16 w-16"}`}
        draggable={false}
      />
      {!isHeader && (
        <p className="mt-2 text-xs text-ink-muted">Simplificá la gestión. Impulsá el crecimiento.</p>
      )}
    </div>
  );
}
