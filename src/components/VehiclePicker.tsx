import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ClipboardCheck, Pencil, Plus } from "lucide-react";
import { Button } from "./ui";
import { listVehicles, listVehiclesWithoutCustomer } from "../db/vehicles";
import type { Vehicle } from "../types";
import { formatVehicleLabel } from "../lib/vehicleFormat";
import VehicleFormModal from "./VehicleFormModal";
import VehiclePeritajeModal from "./VehiclePeritajeModal";

interface Props {
  customerId: number | "";
  vehicleId: number | "";
  disabled?: boolean;
  onVehicleChange: (id: number | "") => void;
  className?: string;
}

export default function VehiclePicker({
  customerId,
  vehicleId,
  disabled,
  onVehicleChange,
  className = "",
}: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [formVehicle, setFormVehicle] = useState<Vehicle | null>(null);
  const [peritajeOpen, setPeritajeOpen] = useState(false);

  const reload = useCallback(async () => {
    setVehicles(
      customerId === "" ? await listVehiclesWithoutCustomer() : await listVehicles(customerId),
    );
  }, [customerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = vehicles.find((v) => v.id === vehicleId) ?? null;

  return (
    <div className={`space-y-2.5 ${className}`.trim()}>
      <label className="block text-sm font-medium text-ink" htmlFor="vehicle-picker">
        Vehículo
      </label>
      <div className="relative">
        <select
          id="vehicle-picker"
          value={vehicleId}
          disabled={disabled}
          onChange={(e) => onVehicleChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="wt-field wt-select w-full appearance-none rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-3 pl-3.5 text-sm text-ink shadow-sm outline-none transition-[border-color,box-shadow] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-brand-500/25"
        >
          <option value="">— Sin vehículo —</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {formatVehicleLabel(v)}
              {v.odometer_km != null ? ` · ${v.odometer_km.toLocaleString("es-AR")} km` : ""}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
          aria-hidden
        />
      </div>
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="text-xs"
            onClick={() => {
              setFormVehicle(null);
              setFormOpen(true);
            }}
          >
            <Plus size={14} /> Nuevo
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="text-xs"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              setFormVehicle(selected);
              setFormOpen(true);
            }}
          >
            <Pencil size={14} /> Editar
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="text-xs"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              setPeritajeOpen(true);
            }}
          >
            <ClipboardCheck size={14} /> Peritaje
          </Button>
        </div>
      )}

      <VehicleFormModal
        open={formOpen}
        customerId={customerId === "" ? null : customerId}
        vehicle={formVehicle}
        onClose={() => setFormOpen(false)}
        onSaved={(id) => {
          void reload().then(() => onVehicleChange(id));
        }}
      />

      <VehiclePeritajeModal
        open={peritajeOpen}
        vehicle={selected}
        onClose={() => setPeritajeOpen(false)}
        onSaved={() => void reload()}
      />
    </div>
  );
}
