import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { ProductsListColId } from "../lib/productsListColumns";

type Props = {
  colId: ProductsListColId;
  onLive: (id: ProductsListColId, px: number) => void;
  onCommit: () => void;
};

/** Arrastre del borde derecho de la columna (como Excel). */
export default function ProductsListColResize({ colId, onLive, onCommit }: Props) {
  const startX = useRef(0);
  const startW = useRef(0);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const handle = e.currentTarget;
      const cell = handle.parentElement;
      if (!cell) return;
      startX.current = e.clientX;
      startW.current = cell.getBoundingClientRect().width;
      handle.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX.current;
        onLive(colId, startW.current + delta);
      };
      const onUp = (ev: PointerEvent) => {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        onCommit();
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    },
    [colId, onCommit, onLive],
  );

  return (
    <span
      className="products-list__col-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Cambiar ancho de columna"
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
