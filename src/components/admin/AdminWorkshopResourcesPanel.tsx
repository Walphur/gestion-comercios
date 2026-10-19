import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, UserX } from "lucide-react";
import {
  Button,
  Input,
  Modal,
  DataTableShell,
  IconButton,
  Badge,
  FormActions,
} from "../ui";
import { showUserError } from "../../lib/notice";
import { useAppConfig } from "../../context/AppConfig";
import { useLicense } from "../../context/LicenseContext";
import { getResourceLabels } from "../../config/resourceLabels";
import { confirmAction } from "../../lib/confirm";
import { canAddProfessional, professionalLimitFor } from "../../lib/professionalLimit";
import {
  createWorkshopResource,
  deactivateWorkshopResource,
  listAllWorkshopResources,
  updateWorkshopResource,
} from "../../db/workshopResources";
import type { WorkshopResource, WorkshopResourceInput } from "../../types";

const emptyForm = (): WorkshopResourceInput => ({
  name: "",
  notes: "",
  sort_order: 0,
  commission_service_pct: 0,
  commission_product_pct: 0,
});

function pctLabel(n: number): string {
  return `${Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
}

function parsePct(raw: string): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

export default function AdminWorkshopResourcesPanel() {
  const { rubro, rubroDef } = useAppConfig();
  const { status: license } = useLicense();
  const professionalLimit = professionalLimitFor(rubro, license);
  const labels = getResourceLabels(rubro);
  const showCommissions = Boolean(rubroDef.posProfessional);
  const [items, setItems] = useState<WorkshopResource[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkshopResource | null>(null);
  const [form, setForm] = useState<WorkshopResourceInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setItems(await listAllWorkshopResources());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function openNew() {
    if (!(await canAddProfessional(rubro, license))) return;
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(item: WorkshopResource) {
    setEditing(item);
    setForm({
      name: item.name,
      notes: item.notes ?? "",
      sort_order: item.sort_order,
      commission_service_pct: item.commission_service_pct ?? 0,
      commission_product_pct: item.commission_product_pct ?? 0,
    });
    setModalOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      showUserError("El nombre es obligatorio.", "Falta un dato");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateWorkshopResource(editing.id, form);
      } else {
        if (!(await canAddProfessional(rubro, license))) return;
        await createWorkshopResource(form);
      }
      setModalOpen(false);
      await reload();
    } catch (e) {
      showUserError(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(item: WorkshopResource) {
    if (
      !(await confirmAction({
        title: labels.deactivateTitle,
        message: `¿Desactivar a «${item.name}»?`,
        detail: "No se borra el historial de turnos; deja de aparecer en la lista.",
        variant: "danger",
        confirmLabel: "Sí, desactivar",
      }))
    ) {
      return;
    }
    try {
      await deactivateWorkshopResource(item.id);
      await reload();
    } catch (e) {
      showUserError(e);
    }
  }

  const activeCount = items.filter((i) => i.active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{labels.sectionTitle}</h2>
          <p className="text-sm text-ink-muted">{labels.sectionSubtitle}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {activeCount} activo{activeCount === 1 ? "" : "s"}
            {professionalLimit != null &&
              ` · WalQo Completo incluye hasta ${professionalLimit}; con más, Pro`}
          </p>
        </div>
        <Button onClick={() => void openNew()}>
          <Plus size={16} /> {labels.newButton}
        </Button>
      </div>

      <DataTableShell>
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Notas</th>
              {showCommissions && <th>Comisión</th>}
              <th>Estado</th>
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={showCommissions ? 5 : 4} className="py-8 text-center text-sm text-ink-muted">
                  {labels.listEmpty}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className={item.active ? "" : "opacity-60"}>
                  <td className="font-medium text-ink">{item.name}</td>
                  <td className="cell-muted">{item.notes || "—"}</td>
                  {showCommissions && (
                    <td className="cell-muted whitespace-nowrap">
                      Serv. {pctLabel(item.commission_service_pct)} · Prod.{" "}
                      {pctLabel(item.commission_product_pct)}
                    </td>
                  )}
                  <td>
                    <Badge variant={item.active ? "success" : "neutral"}>
                      {item.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="col-actions">
                    {item.active && (
                      <>
                        <IconButton label="Editar" onClick={() => openEdit(item)}>
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton label="Desactivar" onClick={() => void handleDeactivate(item)}>
                          <UserX size={16} />
                        </IconButton>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTableShell>

      <Modal
        open={modalOpen}
        title={editing ? labels.editTitle : labels.newTitle}
        onClose={() => setModalOpen(false)}
      >
        <div className="space-y-3">
          <Input
            label={labels.nameLabel}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={labels.namePlaceholder}
            autoFocus
          />
          <Input
            label={labels.notesLabel}
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder={labels.notesPlaceholder}
          />
          {showCommissions && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Comisión por servicios (%)"
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={String(form.commission_service_pct ?? 0)}
                onChange={(e) =>
                  setForm({ ...form, commission_service_pct: parsePct(e.target.value) })
                }
              />
              <Input
                label="Comisión por productos (%)"
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={String(form.commission_product_pct ?? 0)}
                onChange={(e) =>
                  setForm({ ...form, commission_product_pct: parsePct(e.target.value) })
                }
              />
              <p className="text-xs text-ink-muted sm:col-span-2">
                Se calcula sobre lo cobrado en las ventas donde figura como «Atendió». Lo ves en
                Comisiones.
              </p>
            </div>
          )}
        </div>
        <FormActions>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving || !form.name.trim()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </FormActions>
      </Modal>
    </div>
  );
}
