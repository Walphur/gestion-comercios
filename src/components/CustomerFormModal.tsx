import { useEffect, useState } from "react";
import { Button, FormGrid, Input, Modal } from "./ui";
import { useAppConfig } from "../context/AppConfig";
import { createCustomer } from "../db/customers";
import { createVehicle } from "../db/vehicles";
import { getCustomerLabels } from "../config/customerLabels";
import { rubroUsesVehicles } from "../config/workshop";
import { showUserError } from "../lib/notice";
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
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, name: initialName?.trim() ?? "" });
    setPhoneManual(false);
    setVehiclePlate("");
    setVehicleBrand("");
    setVehicleModel("");
  }, [open, initialName]);

  async function handleSave() {
    if (!form.name.trim()) {
      showUserError("El nombre es obligatorio.", "Falta un dato");
      return;
    }
    setSaving(true);
    try {
      const customerId = await createCustomer(form);
      if (showVehicles && vehiclePlate.trim()) {
        await createVehicle({
          customer_id: customerId,
          plate: vehiclePlate,
          brand: vehicleBrand || null,
          model: vehicleModel || null,
        });
      }
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
          value={form.document}
          onChange={(e) => setForm({ ...form, document: e.target.value })}
          placeholder={labels.documentPlaceholder}
        />

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
