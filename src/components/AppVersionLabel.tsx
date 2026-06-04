import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { resolveAppVersion } from "../lib/appVersion";

interface Props {
  variant?: "sidebar" | "light" | "panel";
  showCopy?: boolean;
  className?: string;
}

export default function AppVersionLabel({
  variant = "sidebar",
  showCopy = false,
  className = "",
}: Props) {
  const [version, setVersion] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    resolveAppVersion().then(setVersion).catch(() => setVersion("—"));
  }, []);

  if (!version) return null;

  const label = `v${version}`;

  async function copyVersion() {
    try {
      await navigator.clipboard.writeText(version!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (variant === "sidebar") {
    return (
      <p
        className={`text-center text-[10px] font-medium tracking-wide text-brand-200/50 ${className}`}
        title="Versión instalada — pedile este número a soporte"
      >
        {label}
      </p>
    );
  }

  if (variant === "light") {
    return (
      <p className={`text-center text-[11px] text-ink-muted ${className}`} title="Versión instalada">
        {label}
      </p>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-panel-border)] bg-brand-50/40 px-4 py-3 dark:bg-brand-900/20 ${className}`}
    >
      <div>
        <p className="text-sm font-medium text-ink">Versión instalada</p>
        <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-brand-700 dark:text-brand-300">
          {label}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Pedile este número a quien te da soporte para saber si tenés la app actualizada.
        </p>
      </div>
      {showCopy && (
        <button
          type="button"
          onClick={() => void copyVersion()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-3 py-2 text-xs font-medium text-ink hover:border-brand-400"
        >
          {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      )}
    </div>
  );
}
