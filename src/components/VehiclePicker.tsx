import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Button, Input, Modal } from "./ui";
import { createVehicle, listVehicles } from "../db/vehicles";
import type { Vehicle } from "../types";
import { formatVehicleLabel } from "../lib/vehicleFormat";

interface Props {
  customerId: number | "";
  vehicleId: number | "";
  disabled?: boolean;
  onCustomerRequired?: () => void;
  onVehicleChange: (id: number | "") => void;
  className?: string;
}

export default function VehiclePicker({
  customerId,
  vehicleId,
  disabled,
  onCustomerRequired,
  onVehicleChange,
  className = "",
}: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [odometer, setOdometer] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (customerId === "") {
      setVehicles([]);
      return;
    }
    setVehicles(await listVehicles(customerId));
  }, [customerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate() {
    if (customerId === "") {
      onCustomerRequired?.();
      return;
    }
    setSaving(true);
    try {
      const id = await createVehicle({
        customer_id: customerId,
        plate,
        brand: brand || null,
        model: model || null,
        year: year === "" ? null : year,
        odometer_km: odometer === "" ? null : odometer,
      });
      await reload();
      onVehicleChange(id);
      setAddOpen(false);
      setPlate("");
      setBrand("");
      setModel("");
      setYear("");
      setOdometer("");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const emptyLabel =
    customerId === "" ? "— Elegí un cliente primero —" : "— Sin vehículo —";

  return (
    <div className={`space-y-2.5 ${className}`.trim()}>
      <label className="block text-sm font-medium text-ink" htmlFor="vehicle-picker">
        Vehículo
      </label>
      <div className="relative">
        <select
          id="vehicle-picker"
          value={vehicleId}
          disabled={disabled || customerId === ""}
          onChange={(e) => onVehicleChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="wt-field wt-select w-full appearance-none rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-3 pl-3.5 text-sm text-ink shadow-sm outline-none transition-[border-color,box-shadow] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-brand-500/25"
        >
          <option value="">{emptyLabel}</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {formatVehicleLabel(v)}
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
        <Button
          type="button"
          variant="secondary"
          className="text-xs"
          onClick={() => {
            if (customerId === "") {
              onCustomerRequired?.();
              return;
            }
            setAddOpen(true);
          }}
        >
          <Plus size={14} /> Nuevo vehículo
        </Button>
      )}

      <Modal open={addOpen} title="Nuevo vehículo" onClose={() => setAddOpen(false)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Patente"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="ABC123"
            className="sm:col-span-2"
          />
          <Input label="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <Input label="Modelo" value={model} onChange={(e) => setModel(e.target.value)} />
          <Input
            label="Año"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))}
          />
          <Input
            label="Km actual"
            type="number"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAddOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleCreate()} disabled={saving || !plate.trim()}>
            {saving ? "Guardando…" : "Guardar vehículo"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
