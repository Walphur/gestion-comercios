import { useCallback, useMemo, useState } from "react";
import {
  buildProductsListGridTemplate,
  clampProductsListColWidth,
  loadProductsListColPrefs,
  resetProductsListColPrefs,
  saveProductsListColPrefs,
  type ProductsListColContext,
  type ProductsListColId,
  type ProductsListColVisibility,
  type ProductsListToggleCol,
} from "../lib/productsListColumns";

export function useProductsListColumns(ctx: ProductsListColContext) {
  const [prefs, setPrefs] = useState(() => loadProductsListColPrefs());

  const persist = useCallback((next: typeof prefs) => {
    setPrefs(next);
    saveProductsListColPrefs(next);
  }, []);

  const toggleCol = useCallback(
    (id: ProductsListToggleCol) => {
      persist({
        ...prefs,
        visible: { ...prefs.visible, [id]: !prefs.visible[id] },
      });
    },
    [persist, prefs],
  );

  const setColWidth = useCallback(
    (id: ProductsListColId, px: number) => {
      persist({
        ...prefs,
        widths: { ...prefs.widths, [id]: clampProductsListColWidth(id, px) },
      });
    },
    [persist, prefs],
  );

  /** Durante el drag: actualiza UI sin escribir localStorage en cada pixel. */
  const setColWidthLive = useCallback((id: ProductsListColId, px: number) => {
    setPrefs((prev) => ({
      ...prev,
      widths: { ...prev.widths, [id]: clampProductsListColWidth(id, px) },
    }));
  }, []);

  const commitWidths = useCallback(() => {
    setPrefs((prev) => {
      saveProductsListColPrefs(prev);
      return prev;
    });
  }, []);

  const reset = useCallback(() => {
    setPrefs(resetProductsListColPrefs());
  }, []);

  const gridTemplate = useMemo(
    () => buildProductsListGridTemplate(prefs.widths, prefs.visible, ctx),
    [prefs.widths, prefs.visible, ctx],
  );

  const isVisible = useCallback(
    (id: keyof ProductsListColVisibility | "product" | "price" | "stock") => {
      if (id === "product" || id === "price" || id === "stock") return true;
      if (id === "code" && !ctx.hasBarcode) return false;
      if (id === "unit" && !ctx.hasUnit) return false;
      return prefs.visible[id];
    },
    [ctx.hasBarcode, ctx.hasUnit, prefs.visible],
  );

  return {
    visible: prefs.visible,
    widths: prefs.widths,
    gridTemplate,
    toggleCol,
    setColWidth,
    setColWidthLive,
    commitWidths,
    reset,
    isVisible,
  };
}
