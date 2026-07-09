import { useEffect, useState } from "react";
import { Button, Input, Modal } from "./ui";
import { useAppConfig } from "../context/AppConfig";
import { createWorkshopResource } from "../db/workshopResources";
import { getResourceLabels } from "../config/resourceLabels";
import { showUserError } from "../lib/notice";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (resourceId: number) => void;
  initialName?: string;
}

export default function ResourceFormModal({ open, onClose, onSaved, initialName }: Props) {
  const { rubro } = useAppConfig();
  const labels = getResourceLabels(rubro);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName?.trim() ?? "");
    setNotes("");
  }, [open, initialName]);

  async function handleSave() {
    if (!name.trim()) {
      showUserError("El nombre es obligatorio.", "Falta un dato");
      return;
    }
    setSaving(true);
    try {
      const id = await createWorkshopResource({ name, notes });
      onSaved(id);
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
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={labels.namePlaceholder}
          autoFocus
        />
        <Input
          label={labels.notesLabel}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={labels.notesPlaceholder}
        />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving || !name.trim()}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </Modal>
  );
}
