import { Droplets, Scissors, ShoppingBag, Wrench, X } from "lucide-react";
import { Modal } from "./ui";

export type ServiceItemKind = "product" | "supply" | "service";

interface Props {
  open: boolean;
  onClose: () => void;
  onChoose: (kind: ServiceItemKind) => void;
  workshop?: boolean;
}

const OPTIONS: {
  id: ServiceItemKind;
  icon: typeof Scissors;
  title: string;
  description: string;
}[] = [
  {
    id: "service",
    icon: Scissors,
    title: "Servicio",
    description: "Corte, semipermanente, tintura. Sale en la reserva. Podés sumar insumos o dejarlo solo.",
  },
  {
    id: "supply",
    icon: Droplets,
    title: "Insumo",
    description: "Esmalte, tintura, acetona. Lleva stock y se descuenta cuando está dentro de un servicio.",
  },
  {
    id: "product",
    icon: ShoppingBag,
    title: "Producto",
    description: "Shampoo o esmalte para vender en el local. Precio y stock, sin reserva.",
  },
];

const WORKSHOP_OPTIONS: {
  id: ServiceItemKind;
  icon: typeof Wrench;
  title: string;
  description: string;
}[] = [
  {
    id: "service",
    icon: Wrench,
    title: "Servicio",
    description: "Tren delantero, frenos o service. Sale en turnos y órdenes. No mueve stock.",
  },
  {
    id: "product",
    icon: ShoppingBag,
    title: "Repuesto",
    description: "Para vender en el local. Precio y stock, sin reserva.",
  },
];

export default function ServiceItemKindMenu({ open, onClose, onChoose, workshop = false }: Props) {
  const options = workshop ? WORKSHOP_OPTIONS : OPTIONS;
  return (
    <Modal open={open} title="Qué vas a cargar" onClose={onClose}>
      <p className="mb-4 text-sm text-ink-muted">
        {workshop
          ? "El servicio es la mano de obra. El repuesto queda en Productos."
          : "Si no querés controlar insumos, cargá solo el servicio."}
      </p>
      <div className="grid gap-3">
        {options.map((opt) => (
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
            <span className="min-w-0">
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
