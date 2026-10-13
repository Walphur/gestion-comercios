import { useEffect, useState } from "react";
import { Button, FormGrid, Input, Modal, Select } from "./ui";
import { useAppConfig } from "../context/AppConfig";
import { createCustomer } from "../db/customers";
import { createVehicle, findVehicleByPlate } from "../db/vehicles";
import { getCustomerLabels } from "../config/customerLabels";
import { rubroUsesVehicles } from "../config/workshop";
import { showUserError } from "../lib/notice";
import { withImmediateTransaction } from "../db/tx";
import type { CustomerInput } from "../types";
import {
  isArgentinaStoredPhone,
  phoneToLocalDisplay,
} from "../lib/phoneFormat";

const EMPTY: CustomerInput = {
  name: "",
  phone: "",
  document: "",
  email: "",
  address: "",
  birth_date: "",
  insurance: "",
  gender: "",
  affiliate_number: "",
  credit_limit: 0,
  notes: "",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (customerId: number) => void;
  /** Texto inicial para el buscador (ej. DNI tipeado antes de abrir el modal). */
  initialName?: string;
}

export default function CustomerFormModal({ open, onClose, onSaved, initialName }: Props) {
  const { rubro } = useAppConfig();
  const labels = getCustomerLabels(rubro);
  const showVehicles = rubroUsesVehicles(rubro);
  const [form, setForm] = useState<CustomerInput>(EMPTY);
  const [phoneManual, setPhoneManual] = useState(false);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleKind, setVehicleKind] = useState("");
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleKm, setVehicleKm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, name: initialName?.trim() ?? "" });
    setPhoneManual(false);
    setVehiclePlate("");
    setVehicleKind("");
    setVehicleBrand("");
    setVehicleModel("");
    setVehicleYear("");
    setVehicleKm("");
  }, [open, initialName]);

  async function handleSave() {
    if (!form.name.trim()) {
      showUserError("El nombre es obligatorio.", "Falta un dato");
      return;
    }
    setSaving(true);
    try {
      const customerId = await withImmediateTransaction(async () => {
        if (showVehicles && vehiclePlate.trim()) {
          const taken = await findVehicleByPlate(vehiclePlate);
          if (taken) {
            throw new Error("Esa patente ya está registrada.");
          }
        }
        const id = await createCustomer(form);
        if (showVehicles && vehiclePlate.trim()) {
          const year = Number(vehicleYear);
          const km = vehicleKm.trim() === "" ? null : Number(vehicleKm.replace(/\D/g, ""));
          await createVehicle({
            customer_id: id,
            plate: vehiclePlate,
            kind: vehicleKind || null,
            brand: vehicleBrand || null,
            model: vehicleModel || null,
            year: year >= 1960 ? year : null,
            odometer_km: km != null && Number.isFinite(km) ? km : null,
          });
        }
        return id;
      });
      onSaved(customerId);
      onClose();
    } catch (e) {
      showUserError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={labels.newTitle} onClose={onClose}>
      <div className="space-y-3">
        <Input
          label={labels.nameLabel}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={labels.namePlaceholder}
          autoFocus
        />
        {phoneManual ? (
          <div className="space-y-1">
            <Input
              label={`${labels.phoneLabel} (completo)`}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <button
              type="button"
              className="text-xs text-brand-600 hover:underline"
              onClick={() => {
                setPhoneManual(false);
                setForm({ ...form, phone: phoneToLocalDisplay(form.phone) });
              }}
            >
              Volver a formato Argentina (+549 automático)
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="block text-sm font-medium text-ink">{labels.phoneLabel}</label>
            <div className="flex gap-2">
              <span className="flex shrink-0 items-center rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 text-sm font-medium text-ink-muted">
                +549
              </span>
              <Input
                className="flex-1"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={labels.phonePlaceholder}
              />
            </div>
            <button
              type="button"
              className="text-xs text-brand-600 hover:underline"
              onClick={() => setPhoneManual(true)}
            >
              Otro país o número completo
            </button>
          </div>
        )}
        <Input
          label={labels.documentLabel}
          value={form.document ?? ""}
          onChange={(e) => setForm({ ...form, document: e.target.value })}
          placeholder={labels.documentPlaceholder}
        />
        <Input
          label={labels.emailLabel}
          value={form.email ?? ""}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="Opcional"
        />
        {labels.birthLabel && (
          <Input
            label={labels.birthLabel}
            type="date"
            value={form.birth_date ?? ""}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
          />
        )}
        {labels.genderLabel && (
          <Select
            label={labels.genderLabel}
            value={form.gender ?? ""}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
          >
            <option value="">Prefiero no responder</option>
            <option value="femenino">Femenino</option>
            <option value="masculino">Masculino</option>
            <option value="otro">Otro</option>
          </Select>
        )}
        {labels.insuranceLabel && (
          <Input
            label={labels.insuranceLabel}
            value={form.insurance ?? ""}
            onChange={(e) => setForm({ ...form, insurance: e.target.value })}
            placeholder="Opcional"
          />
        )}
        {labels.affiliateLabel && (
          <Input
            label={labels.affiliateLabel}
            value={form.affiliate_number ?? ""}
            onChange={(e) => setForm({ ...form, affiliate_number: e.target.value })}
            placeholder="Opcional"
          />
        )}

        {showVehicles && labels.vehicleSectionTitle && (
          <div className="rounded-xl border border-[var(--color-panel-border)] p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {labels.vehicleSectionTitle}
            </p>
            <Input
              label={labels.vehiclePlateLabel}
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
              placeholder={labels.vehiclePlatePlaceholder}
            />
            <Select
              label="Tipo"
              value={vehicleKind}
              onChange={(e) => setVehicleKind(e.target.value)}
            >
              <option value="">Sin especificar</option>
              <option value="auto">Auto</option>
              <option value="camioneta">Camioneta / chata</option>
              <option value="suv">SUV</option>
              <option value="utilitario">Utilitario</option>
              <option value="moto">Moto</option>
              <option value="otro">Otro</option>
            </Select>
            <FormGrid cols={2}>
              <Input
                label="Marca"
                value={vehicleBrand}
                onChange={(e) => setVehicleBrand(e.target.value)}
                placeholder={labels.vehicleBrandPlaceholder}
              />
              <Input
                label="Modelo"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                placeholder={labels.vehicleModelPlaceholder}
              />
            </FormGrid>
            <FormGrid cols={2}>
              <Input
                label="Año"
                inputMode="numeric"
                value={vehicleYear}
                onChange={(e) => setVehicleYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Ej. 2018"
              />
              <Input
                label="Kilometraje"
                inputMode="numeric"
                value={vehicleKm}
                onChange={(e) => setVehicleKm(e.target.value.replace(/\D/g, "").slice(0, 7))}
                placeholder="Opcional"
              />
            </FormGrid>
          </div>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving || !form.name.trim()}>
          {saving ? "Guardando…" : "Guardar cliente"}
        </Button>
      </div>
    </Modal>
  );
}

/** Etiqueta compacta para listados y selección. */
export function formatCustomerOption(c: {
  name: string;
  document?: string | null;
  phone?: string | null;
}): string {
  const parts = [c.name];
  if (c.document?.trim()) parts.push(c.document.trim());
  if (c.phone?.trim()) {
    const phone = isArgentinaStoredPhone(c.phone)
      ? phoneToLocalDisplay(c.phone)
      : c.phone;
    parts.push(phone);
  }
  return parts.join(" · ");
}
