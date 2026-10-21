import { NumericInput } from "./ui";

/** Precio de lista (antes): en la tienda web se ve tachado con el % OFF. No cambia lo que se cobra. */
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
  const off = value > salePrice && salePrice > 0 ? Math.round((1 - salePrice / value) * 100) : 0;
  return (
    <div className="mt-3 grid min-w-0 sm:grid-cols-2">
      <NumericInput
        label={inUsd ? "Precio de lista (antes) en US$" : "Precio de lista (antes)"}
        value={value}
        min={0}
        onChange={(v) => onChange(Math.max(0, v))}
        hint={
          off > 0
            ? `En la tienda web se ve tachado, con ${off}% OFF. Se cobra el precio de venta.`
            : value > 0
              ? "Tiene que ser mayor al precio de venta para mostrarse."
              : "Opcional: en la tienda web se ve tachado, con el % de descuento."
        }
      />
    </div>
  );
}
