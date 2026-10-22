import { useEffect, useState } from "react";
import { NumericInput } from "./ui";
import { getSetting } from "../db/settings";
import { MENU_PORTAL_ENABLED_KEY } from "../lib/menuPortalPush";

/** Precio de antes para promos: se ve tachado con el % OFF. No cambia lo que se cobra. */
export default function ListPriceField({
  value,
  onChange,
  salePrice,
  inUsd = false,
}: {
  value: number;
  onChange: (v: number) => void;
  salePrice: number;
  inUsd?: boolean;
}) {
  const [webOn, setWebOn] = useState(false);
  useEffect(() => {
    void getSetting(MENU_PORTAL_ENABLED_KEY)
      .then((v) => setWebOn(v === "1"))
      .catch(() => setWebOn(false));
  }, []);

  const off = value > salePrice && salePrice > 0 ? Math.round((1 - salePrice / value) * 100) : 0;
  const where = webOn ? "en la caja, en la etiqueta y en tu tienda web" : "en la caja y en la etiqueta";
  return (
    <div className="mt-3 grid min-w-0 sm:grid-cols-2">
      <NumericInput
        label={inUsd ? "Precio antes de la promo (US$)" : "Precio antes de la promo"}
        value={value}
        min={0}
        onChange={(v) => onChange(Math.max(0, v))}
        hint={
          off > 0
            ? `Promo ${off}% OFF: se ve tachado ${where}. Se cobra el precio de venta.`
            : value > 0
              ? "Tiene que ser mayor al precio de venta para que se vea como promo."
              : `Opcional, para promos: poné el precio de antes y bajá el de venta. Se ve tachado ${where}.`
        }
      />
    </div>
  );
}
