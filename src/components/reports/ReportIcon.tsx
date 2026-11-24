import type { LucideIcon } from "lucide-react";

export type ReportIconSize = "sm" | "md" | "lg";
export type ReportIconTone = "brand" | "green" | "amber" | "rose" | "blue" | "muted";

const SIZE_PX: Record<ReportIconSize, number> = { sm: 14, md: 16, lg: 18 };

const TONE_CLS: Record<ReportIconTone, string> = {
  brand: "bg-brand-500/12 text-brand-600 dark:text-brand-300",
  green: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
  amber: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  rose: "bg-rose-500/12 text-rose-600 dark:text-rose-300",
  blue: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  muted: "bg-[var(--color-panel-muted)] text-ink-muted",
};

type IconProps = {
  icon: LucideIcon;
  size?: ReportIconSize;
  className?: string;
  /** Decorativo por defecto (aria-hidden). */
  label?: string;
};

/** Icono Lucide unificado para Reportes: stroke y tamaño consistentes. */
export function ReportIcon({ icon: Icon, size = "md", className = "", label }: IconProps) {
  const px = SIZE_PX[size];
  return (
    <Icon
      size={px}
      strokeWidth={1.75}
      className={`shrink-0 ${className}`.trim()}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}

type BadgeProps = IconProps & {
  tone?: ReportIconTone;
  badgeClassName?: string;
};

/** Pastilla con fondo sutil para KPIs e insights. */
export function ReportIconBadge({
  icon,
  size = "md",
  tone = "brand",
  className = "",
  badgeClassName = "",
  label,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md p-1.5 ${TONE_CLS[tone]} ${badgeClassName}`.trim()}
    >
      <ReportIcon icon={icon} size={size} className={className} label={label} />
    </span>
  );
}
