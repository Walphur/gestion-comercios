import { useEffect, useState } from "react";
import { Modal, Button, Input } from "./ui";

interface Props {
  open: boolean;
  title: string;
  description: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (value: number) => void;
}

export default function PercentPromptModal({
  open,
  title,
  description,
  label = "Porcentaje",
  placeholder = "Ej: 15 o -10",
  confirmLabel = "Aplicar",
  onClose,
  onConfirm,
}: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
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
    onConfirm(n);
    onClose();
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="mb-4 text-sm text-ink-muted">{description}</p>
      <Input
        label={label}
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
