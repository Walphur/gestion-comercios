import { useEffect, useId, useState } from "react";
import { Input } from "./ui";
import { listCustomerOrganizations } from "../db/customers";

/** Organismo o empresa del cliente, con los ya cargados como sugerencia para no escribirlo distinto. */
export default function CustomerOrganizationInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    listCustomerOrganizations()
      .then((list) => {
        if (!cancelled) setOptions(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Input
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ej. Municipalidad de San Martín (opcional)"
        list={listId}
        autoComplete="off"
        hint="Sirve para agrupar el detalle de fiado. Elegí uno de la lista si ya existe."
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
