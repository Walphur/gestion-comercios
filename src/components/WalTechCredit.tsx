import { ArrowUpRight } from "lucide-react";
import walqoSolo from "../assets/branding/walqo-solo.png";
import { openExternalUrl } from "../lib/openExternal";

const PLANS_URL = "https://walqo.pro/#planes";

/** Marca WalQo en sidebar, login y cabeceras. */
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
        <div className="flex items-center gap-2">
          <img
            src={walqoSolo}
            alt=""
            className="h-7 w-7 shrink-0 object-contain"
            draggable={false}
          />
          <div className="min-w-0">
            <p className="font-display text-[15px] font-bold leading-none tracking-tight text-white">
              WalQo
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[10px] font-medium uppercase tracking-wide text-white/50">
              <span>Sistema POS</span>
              <span aria-hidden className="text-white/30">
                ·
              </span>
              <button
                type="button"
                onClick={openPlans}
                className="inline-flex items-center gap-0.5 normal-case tracking-normal text-white/70 transition hover:text-sky-200"
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
        className={`object-contain ${isHeader ? "h-8 w-8" : "h-10 w-10"}`}
        draggable={false}
      />
      <p
        className={`mt-2 font-display font-bold leading-none ${
          isHeader ? "text-sm" : "text-lg"
        } text-ink`}
        style={{ letterSpacing: "-0.03em" }}
      >
        WalQo
      </p>
      {!isHeader && (
        <p className="mt-1 text-xs text-ink-muted">Simplificá la gestión. Impulsá el crecimiento.</p>
      )}
    </div>
  );
}
