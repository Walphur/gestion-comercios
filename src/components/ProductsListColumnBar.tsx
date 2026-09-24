import { Columns3, RotateCcw } from "lucide-react";
import {
  PRODUCTS_LIST_TOGGLE_COLS,
  type ProductsListColContext,
  type ProductsListColVisibility,
  type ProductsListToggleCol,
} from "../lib/productsListColumns";

type Props = {
  visible: ProductsListColVisibility;
  ctx: ProductsListColContext;
  onToggle: (id: ProductsListToggleCol) => void;
  onReset: () => void;
};

/** Barra tipo Excel: mostrar/ocultar columnas del listado. */
export default function ProductsListColumnBar({ visible, ctx, onToggle, onReset }: Props) {
  const toggles = PRODUCTS_LIST_TOGGLE_COLS.filter((c) => {
    if (c.id === "code") return ctx.hasBarcode;
    if (c.id === "unit") return ctx.hasUnit;
    return true;
  });

  return (
    <div className="products-cols-bar" role="toolbar" aria-label="Columnas del listado">
      <span className="products-cols-bar__label">
        <Columns3 size={14} strokeWidth={2} aria-hidden />
        Columnas
      </span>
      <div className="products-cols-bar__chips">
        {toggles.map((c) => {
          const on = visible[c.id];
          return (
            <button
              key={c.id}
              type="button"
              className={`products-cols-bar__chip${on ? " is-on" : ""}`}
              aria-pressed={on}
              onClick={() => onToggle(c.id)}
              title={on ? `Ocultar ${c.label}` : `Mostrar ${c.label}`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="products-cols-bar__reset"
        onClick={onReset}
        title="Restablecer anchos y columnas"
      >
        <RotateCcw size={13} strokeWidth={2} aria-hidden />
        Restablecer
      </button>
    </div>
  );
}
