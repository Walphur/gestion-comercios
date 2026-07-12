import type { ReactNode } from "react";

interface KeyCapProps {
  children: ReactNode;
  className?: string;
}

/** Tecla estilo teclado (SVG-like con bordes y sombra). */
export function KeyCap({ children, className = "" }: KeyCapProps) {
  return (
    <kbd
      className={`inline-flex h-5 min-w-[1.35rem] items-center justify-center rounded border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-1 font-mono text-[10px] font-bold leading-none text-ink shadow-[0_1px_0_0_var(--color-panel-border)] ${className}`}
    >
      {children}
    </kbd>
  );
}

interface ShortcutHintProps {
  keys: string[];
  label?: string;
  separator?: "+" | "·" | "–";
}

/** Atajo visual: teclas + descripción corta. */
export function ShortcutHint({ keys, label, separator = "+" }: ShortcutHintProps) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key, i) => (
        <span key={`${key}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && (
            <span className="text-[10px] font-medium text-ink-muted">{separator}</span>
          )}
          <KeyCap>{key}</KeyCap>
        </span>
      ))}
      {label ? <span className="text-ink-muted">{label}</span> : null}
    </span>
  );
}

interface ShortcutBarProps {
  items: { keys: string[]; label: string; separator?: "+" | "·" | "–" }[];
}

export function ShortcutBar({ items }: ShortcutBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-ink-muted/50">·</span>}
          <ShortcutHint keys={item.keys} label={item.label} separator={item.separator} />
        </span>
      ))}
    </div>
  );
}
