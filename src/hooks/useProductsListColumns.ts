import { useCallback, useMemo, useState } from "react";
import {
  buildProductsListGridTemplate,
  clampProductsListColWidth,
  loadProductsListColPrefs,
  saveProductsListColPrefs,
  type ProductsListColContext,
  type ProductsListColId,
} from "../lib/productsListColumns";

export function useProductsListColumns(ctx: ProductsListColContext) {
  const [prefs, setPrefs] = useState(() => loadProductsListColPrefs());

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

  const gridTemplate = useMemo(
    () => buildProductsListGridTemplate(prefs.widths, ctx),
    [prefs.widths, ctx],
  );

  const colOn = useCallback(
    (id: "code" | "category" | "brand" | "unit" | "cost" | "product" | "price" | "stock") => {
      if (id === "code") return ctx.hasBarcode;
      if (id === "unit") return ctx.hasUnit;
      if (id === "stock") return ctx.hasStock !== false;
      if (id === "brand") return ctx.hasBrand !== false;
      if (id === "cost") return ctx.hasCost !== false;
      return true;
    },
    [ctx.hasBarcode, ctx.hasUnit, ctx.hasStock, ctx.hasBrand, ctx.hasCost],
  );

  return {
    widths: prefs.widths,
    gridTemplate,
    setColWidthLive,
    commitWidths,
    colOn,
  };
}
