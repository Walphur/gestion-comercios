import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Pencil, Printer } from "lucide-react";
import { Button, Input, Modal, TextArea } from "./ui";
import {
  createInspection,
  getInspection,
  listInspectionsForVehicle,
  updateInspection,
} from "../db/vehicleInspections";
import { printPeritajeDocument } from "../lib/prints/peritajeDocument";
import { formatDateShort } from "../lib/format";
import { formatVehicleLabel } from "../lib/vehicleFormat";
import type { Vehicle, VehicleInspection } from "../types";
import { useAppConfig } from "../context/AppConfig";

const FUEL_LEVELS = ["Vacío", "1/4", "1/2", "3/4", "Lleno"] as const;

interface Props {
  open: boolean;
  vehicle: Vehicle | null;
  onClose: () => void;
  /** Tras guardar, p.ej. refrescar km del vehículo. */
  onSaved?: () => void;
}

type Mode = "list" | "form";

export default function VehiclePeritajeModal({ open, vehicle, onClose, onSaved }: Props) {
  const { businessName } = useAppConfig();
  const [mode, setMode] = useState<Mode>("list");
  const [items, setItems] = useState<VehicleInspection[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [odometer, setOdometer] = useState<number | "">("");
  const [fuelLevel, setFuelLevel] = useState("");
  const [exterior, setExterior] = useState("");
  const [interior, setInterior] = useState("");
  const [belongings, setBelongings] = useState("");
  const [reported, setReported] = useState("");
  const [notes, setNotes] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!vehicle) return;
    setItems(await listInspectionsForVehicle(vehicle.id));
  }, [vehicle]);

  useEffect(() => {
    if (!open || !vehicle) return;
    setMode("list");
    setEditingId(null);
    void reload();
  }, [open, vehicle, reload]);

  function startNew() {
    if (!vehicle) return;
    setEditingId(null);
    setOdometer(vehicle.odometer_km ?? "");
    setFuelLevel("");
    setExterior("");
    setInterior("");
    setBelongings("");
    setReported("");
    setNotes("");
    setReceivedBy("");
    setMode("form");
  }

  async function startEdit(id: number) {
    const row = await getInspection(id);
    if (!row) return;
    setEditingId(id);
    setOdometer(row.odometer_km ?? "");
    setFuelLevel(row.fuel_level ?? "");
    setExterior(row.exterior_condition ?? "");
    setInterior(row.interior_condition ?? "");
    setBelongings(row.belongings ?? "");
    setReported(row.customer_reported ?? "");
    setNotes(row.notes ?? "");
    setReceivedBy(row.received_by ?? "");
    setMode("form");
  }

  async function handleSave() {
    if (!vehicle) return;
    setSaving(true);
    try {
      const payload = {
        customer_id: vehicle.customer_id,
        odometer_km: odometer === "" ? null : odometer,
        fuel_level: fuelLevel || null,
        exterior_condition: exterior || null,
        interior_condition: interior || null,
        belongings: belongings || null,
        customer_reported: reported || null,
        notes: notes || null,
        received_by: receivedBy || null,
      };
      let id: number;
      if (editingId != null) {
        await updateInspection(editingId, payload);
        id = editingId;
      } else {
        id = await createInspection({ vehicle_id: vehicle.id, ...payload });
      }
      await reload();
      onSaved?.();
      const saved = await getInspection(id);
      if (saved) await printPeritajeDocument(businessName, saved);
      setMode("list");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handlePrint(id: number) {
    const row = await getInspection(id);
    if (row) await printPeritajeDocument(businessName, row);
  }

  return (
    <Modal
      open={open}
      title={
        vehicle
          ? mode === "form"
            ? editingId
              ? `Editar peritaje · ${formatVehicleLabel(vehicle)}`
              : `Nuevo peritaje · ${formatVehicleLabel(vehicle)}`
            : `Peritajes · ${formatVehicleLabel(vehicle)}`
          : "Peritajes"
      }
      onClose={onClose}
    >
      {!vehicle ? null : mode === "list" ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Anotá el estado del auto antes de ingresarlo: km, daños, objetos y lo que reporta el
            cliente. Podés imprimirlo para dejarlo en el vehículo o dárselo al cliente.
          </p>
          <Button type="button" onClick={startNew}>
            <ClipboardCheck size={16} /> Nuevo peritaje de ingreso
          </Button>
          {items.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">Todavía no hay peritajes.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-ink">{it.inspection_number}</p>
                    <p className="text-xs text-ink-muted">
                      {formatDateShort(it.created_at)}
                      {it.odometer_km != null
                        ? ` · ${it.odometer_km.toLocaleString("es-AR")} km`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => void startEdit(it.id)}
                    >
                      <Pencil size={14} /> Editar
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-xs"
                      onClick={() => void handlePrint(it.id)}
                    >
                      <Printer size={14} /> Imprimir
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Kilometraje"
              type="number"
              min={0}
              value={odometer}
              onChange={(e) => setOdometer(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Ej. 85400"
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Combustible</label>
              <select
                value={fuelLevel}
                onChange={(e) => setFuelLevel(e.target.value)}
                className="wt-field wt-select w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-sm text-ink"
              >
                <option value="">— Sin indicar —</option>
                {FUEL_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <TextArea
            label="Exterior / daños visibles"
            value={exterior}
            onChange={(e) => setExterior(e.target.value)}
            placeholder="Rayones, golpes, faros, parachoques…"
            rows={2}
          />
          <TextArea
            label="Interior"
            value={interior}
            onChange={(e) => setInterior(e.target.value)}
            placeholder="Tapizados, tablero, olor, etc."
            rows={2}
          />
          <TextArea
            label="Objetos personales / pertenencias"
            value={belongings}
            onChange={(e) => setBelongings(e.target.value)}
            placeholder="Documentación, herramientas, carga…"
            rows={2}
          />
          <TextArea
            label="Problemas que reporta el cliente"
            value={reported}
            onChange={(e) => setReported(e.target.value)}
            placeholder="Ruidos, fallas, luces, etc."
            rows={2}
          />
          <TextArea
            label="Observaciones del taller"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
          <Input
            label="Recibido por"
            value={receivedBy}
            onChange={(e) => setReceivedBy(e.target.value)}
            placeholder="Nombre de quien recibe el auto"
          />
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setMode("list")} disabled={saving}>
              Volver
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar e imprimir"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
