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
            className="h-16 w-16 shrink-0 object-contain drop-shadow-md"
            draggable={false}
          />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/50">
              Sistema POS
            </p>
            <button
              type="button"
              onClick={openPlans}
              className="mt-1 inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-sky-100 ring-1 ring-white/15 transition hover:bg-white/15 hover:text-white"
            >
              Planes
              <span aria-hidden className="text-sky-200/90">
                &gt;
              </span>
            </button>
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
