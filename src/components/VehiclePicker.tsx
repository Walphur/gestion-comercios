import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button, Input, Modal, Select } from "./ui";
import { createVehicle, listVehicles } from "../db/vehicles";
import type { Vehicle } from "../types";
import { formatVehicleLabel } from "../lib/vehicleFormat";

interface Props {
  customerId: number | "";
  vehicleId: number | "";
  disabled?: boolean;
  onCustomerRequired?: () => void;
  onVehicleChange: (id: number | "") => void;
}

export default function VehiclePicker({
  customerId,
  vehicleId,
  disabled,
  onCustomerRequired,
  onVehicleChange,
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

  return (
    <div className="space-y-2">
      <Select
        label="Vehículo"
        value={vehicleId}
        disabled={disabled || customerId === ""}
        onChange={(e) => onVehicleChange(e.target.value === "" ? "" : Number(e.target.value))}
      >
        <option value="">
          {customerId === "" ? "— Elegí un cliente primero —" : "— Sin vehículo —"}
        </option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {formatVehicleLabel(v)}
          </option>
        ))}
      </Select>
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
