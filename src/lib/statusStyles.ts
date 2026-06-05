/** Etiquetas y clases Tailwind reutilizables para estados Pro. */
export function statusBadgeClass(tone: "neutral" | "warn" | "ok" | "brand" | "danger"): string {
  const map = {
    neutral: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    warn: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
    ok: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
    brand: "bg-brand-500/15 text-brand-800 dark:text-brand-200",
    danger: "bg-red-500/15 text-red-700 dark:text-red-300",
  };
  return `rounded-lg px-2 py-0.5 text-xs font-semibold ${map[tone]}`;
}
