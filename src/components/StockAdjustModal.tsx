import { useEffect, useState } from "react";
import { Modal, Button, Input, Select } from "./ui";

interface Props {
  open: boolean;
  productCount: number;
  onClose: () => void;
  onConfirm: (mode: "add" | "set", value: number) => void;
}

export default function StockAdjustModal({ open, productCount, onClose, onConfirm }: Props) {
  const [mode, setMode] = useState<"add" | "set">("add");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setMode("add");
      setValue("");
      setError("");
    }
  }, [open]);

  function submit() {
    const n = Number(value.replace(",", ".").trim());
    if (Number.isNaN(n)) {
      setError("Ingresá un número válido.");
      return;
    }
    onConfirm(mode, n);
    onClose();
  }

  return (
    <Modal open={open} title="Ajustar stock en lote" onClose={onClose}>
      <p className="mb-4 text-sm text-ink-muted">
        Se aplica a {productCount} producto{productCount === 1 ? "" : "s"} seleccionado
        {productCount === 1 ? "" : "s"}.
      </p>
      <Select
        label="Modo"
        value={mode}
        onChange={(e) => setMode(e.target.value as "add" | "set")}
      >
        <option value="add">Sumar unidades al stock actual</option>
        <option value="set">Dejar stock fijo en…</option>
      </Select>
      <div className="mt-3">
        <Input
          label={mode === "add" ? "Unidades a sumar" : "Stock final"}
          type="text"
          inputMode="decimal"
          placeholder={mode === "add" ? "Ej: 10" : "Ej: 25"}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit}>Aplicar</Button>
      </div>
    </Modal>
  );
}
