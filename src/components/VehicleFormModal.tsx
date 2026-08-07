import { useEffect, useState } from "react";
import { Button, Input, Modal, TextArea } from "./ui";
import { createVehicle, updateVehicle } from "../db/vehicles";
import type { Vehicle, VehicleInput } from "../types";

interface Props {
  open: boolean;
  customerId: number;
  vehicle?: Vehicle | null;
  onClose: () => void;
  onSaved: (id: number) => void;
}

export default function VehicleFormModal({
  open,
  customerId,
  vehicle,
  onClose,
  onSaved,
}: Props) {
  const isEdit = Boolean(vehicle);
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [odometer, setOdometer] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPlate(vehicle?.plate ?? "");
    setBrand(vehicle?.brand ?? "");
    setModel(vehicle?.model ?? "");
    setYear(vehicle?.year ?? "");
    setOdometer(vehicle?.odometer_km ?? "");
    setNotes(vehicle?.notes ?? "");
  }, [open, vehicle]);

  async function handleSave() {
    setSaving(true);
    try {
      const input: VehicleInput = {
        customer_id: customerId,
        plate,
        brand: brand || null,
        model: model || null,
        year: year === "" ? null : year,
        odometer_km: odometer === "" ? null : odometer,
        notes: notes.trim() || null,
      };
      if (isEdit && vehicle) {
        await updateVehicle(vehicle.id, input);
        onSaved(vehicle.id);
      } else {
        const id = await createVehicle(input);
        onSaved(id);
      }
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={isEdit ? "Editar vehículo" : "Nuevo vehículo"}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Patente"
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          placeholder="ABC123"
          className="sm:col-span-2"
          autoFocus
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
        <div className="sm:col-span-2">
          <TextArea
            label="Notas del vehículo"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Color, particularidades, etc."
            rows={2}
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving || !plate.trim()}>
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar vehículo"}
        </Button>
      </div>
    </Modal>
  );
}
