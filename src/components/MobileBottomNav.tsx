import { NavLink } from "react-router-dom";
import { Menu } from "lucide-react";
import { useNavModel } from "./Sidebar";

/** Orden de preferencia; se muestran las primeras 4 que el usuario puede ver. */
const PREFERRED = ["/", "/pos", "/productos", "/caja", "/clientes", "/ventas", "/stock", "/turnos"];

const SHORT_LABEL: Record<string, string> = {
  "/pos": "Vender",
};

interface Props {
  onMenu: () => void;
}

export default function MobileBottomNav({ onMenu }: Props) {
  const { mainMenu, proVisible, isItemActive } = useNavModel();
  const all = [...mainMenu, ...proVisible];
  const picks = PREFERRED.flatMap((to) => all.filter((item) => item.to === to)).slice(0, 4);

  return (
    <nav
      aria-label="Secciones principales"
      className="mobile-bottom-nav grid shrink-0 border-t border-[var(--color-panel-border)] bg-[var(--color-panel)]"
      style={{ gridTemplateColumns: `repeat(${picks.length + 1}, minmax(0, 1fr))` }}
    >
      {picks.map(({ to, label, icon: Icon }) => {
        const active = isItemActive(to);
        return (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={`flex min-w-0 flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[11px] font-semibold ${
              active ? "text-brand-600 dark:text-brand-300" : "text-ink-muted"
            }`}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
            <span className="w-full truncate text-center">{SHORT_LABEL[to] ?? label}</span>
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={onMenu}
        className="flex min-w-0 flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[11px] font-semibold text-ink-muted"
      >
        <Menu size={22} strokeWidth={2} className="shrink-0" />
        <span className="w-full truncate text-center">Menú</span>
      </button>
    </nav>
  );
}
