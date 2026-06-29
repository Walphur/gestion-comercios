import { Camera, FileSpreadsheet, Pencil, Sparkles, X } from "lucide-react";
import { Modal } from "./ui";

export type ProductAddChoice = "manual" | "excel" | "premium" | "invoice";

interface Props {
  open: boolean;
  onClose: () => void;
  onChoose: (choice: ProductAddChoice) => void;
}

const OPTIONS: {
  id: ProductAddChoice;
  icon: typeof Pencil;
  title: string;
  description: string;
}[] = [
  {
    id: "manual",
    icon: Pencil,
    title: "Manualmente",
    description: "Cargá un producto a la vez con nombre, precio y código.",
  },
  {
    id: "excel",
    icon: FileSpreadsheet,
    title: "Importar desde Excel",
    description: "Subí una planilla con tus productos actuales.",
  },
  {
    id: "premium",
    icon: Sparkles,
    title: "Catálogo Premium",
    description: "Miles de productos de supermercado listos para usar.",
  },
  {
    id: "invoice",
    icon: Camera,
    title: "Leer factura (IA)",
    description: "Escaneá una factura de compra y cargá el stock.",
  },
];

export default function ProductAddMenu({ open, onClose, onChoose }: Props) {
  return (
    <Modal open={open} title="Agregar producto" onClose={onClose} wide>
      <p className="mb-4 text-sm text-ink-muted">Elegí cómo querés cargar productos al catálogo.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              onChoose(opt.id);
              onClose();
            }}
            className="flex gap-3 rounded-xl border border-[var(--color-panel-border)] p-4 text-left transition hover:border-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-900/20"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/50">
              <opt.icon size={22} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{opt.title}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{opt.description}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <X size={14} /> Cancelar
        </button>
      </div>
    </Modal>
  );
}
