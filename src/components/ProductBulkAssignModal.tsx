import { useEffect, useState } from "react";
import { Modal, Button, Select } from "./ui";

export type BulkAssignField = "category" | "brand" | "supplier" | "unit";

interface Option {
  value: string;
  label: string;
}

interface Props {
  open: boolean;
  field: BulkAssignField | null;
  productCount: number;
  options: Option[];
  onClose: () => void;
  onConfirm: (value: string | null) => void;
}

const TITLES: Record<BulkAssignField, string> = {
  category: "Asignar categoría",
  brand: "Asignar marca",
  supplier: "Asignar proveedor",
  unit: "Cambiar unidad de medida",
};

const DESCRIPTIONS: Record<BulkAssignField, string> = {
  category: "La categoría se aplica a todos los productos seleccionados.",
  brand: "La marca se aplica a todos los productos seleccionados.",
  supplier: "El proveedor se aplica a todos los productos seleccionados.",
  unit: "Útil para pasar varios artículos a kg/g y habilitar venta a granel en el POS.",
};

export default function ProductBulkAssignModal({
  open,
  field,
  productCount,
  options,
  onClose,
  onConfirm,
}: Props) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue("");
  }, [open, field]);

  if (!field) return null;

  function submit() {
    if (!value) {
      alert("Elegí un valor para aplicar.");
      return;
    }
    onConfirm(value === "__clear__" ? null : value);
    onClose();
  }

  return (
    <Modal open={open} title={TITLES[field]} onClose={onClose}>
      <p className="mb-4 text-sm text-ink-muted">
        {productCount} producto{productCount === 1 ? "" : "s"} seleccionado
        {productCount === 1 ? "" : "s"}. {DESCRIPTIONS[field]}
      </p>
      <Select
        label={TITLES[field]}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">— Elegir —</option>
        {field !== "unit" && <option value="__clear__">— Quitar / sin asignar —</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit}>Aplicar</Button>
      </div>
    </Modal>
  );
}
