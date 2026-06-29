import { useCallback, useEffect, useState } from "react";
import { UserPlus, Pencil, UserX } from "lucide-react";
import {
  Button,
  Input,
  Modal,
  DataTableShell,
  IconButton,
  Badge,
  FormActions,
  Select,
} from "../ui";
import { showUserError } from "../../lib/notice";
import { useAuth } from "../../context/AuthContext";
import { confirmAction } from "../../lib/confirm";
import {
  createStaffUser,
  listStaffUsers,
  updateStaffUser,
  type StaffUser,
  type StaffUserInput,
  type UserRole,
} from "../../db/users";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
};

const emptyForm = (): StaffUserInput => ({
  username: "",
  display_name: "",
  role: "cashier",
  pin: "",
});

export default function StaffManagementPanel() {
  const { can } = useAuth();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [form, setForm] = useState<StaffUserInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setStaff(await listStaffUsers());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(u: StaffUser) {
    setEditing(u);
    setForm({
      username: u.username,
      display_name: u.display_name,
      role: u.role,
      pin: u.pin,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.username.trim() || !form.display_name.trim() || !form.pin.trim()) {
      showUserError("Completá usuario, nombre visible y PIN.", "Faltan datos");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateStaffUser(editing.id, form);
      } else {
        await createStaffUser(form);
      }
      setModalOpen(false);
      reload();
    } catch (e) {
      showUserError(e);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: StaffUser) {
    if (u.id === 1) return;
    const msg = u.active
      ? `¿Desactivar a ${u.display_name}? No podrá iniciar sesión.`
      : `¿Reactivar a ${u.display_name}?`;
    if (
      !(await confirmAction({
        title: u.active ? "Desactivar empleado" : "Reactivar empleado",
        message: msg,
        variant: u.active ? "danger" : "default",
        confirmLabel: u.active ? "Sí, desactivar" : "Sí, reactivar",
      }))
    ) {
      return;
    }
    try {
      await updateStaffUser(u.id, { active: !u.active });
      reload();
    } catch (e) {
      showUserError(e);
    }
  }

  if (!can("manage_users")) {
    return <p className="text-sm text-ink-muted">No tenés permiso para gestionar empleados.</p>;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Creá cajeros, encargados y administradores. Cada persona ingresa con su usuario y PIN.
        </p>
        <Button size="sm" onClick={openCreate}>
          <UserPlus size={16} /> Nuevo empleado
        </Button>
      </div>

      <DataTableShell>
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Estado</th>
              <th className="col-actions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id}>
                <td className="font-medium text-ink">{u.display_name}</td>
                <td className="cell-muted">{u.username}</td>
                <td className="cell-muted">{ROLE_LABELS[u.role]}</td>
                <td>
                  {u.active ? (
                    <Badge variant="success">Activo</Badge>
                  ) : (
                    <Badge variant="neutral">Inactivo</Badge>
                  )}
                </td>
                <td>
                  <div className="flex justify-end gap-0.5">
                    <IconButton label="Editar" onClick={() => openEdit(u)}>
                      <Pencil size={16} />
                    </IconButton>
                    {u.id !== 1 && (
                      <IconButton
                        label={u.active ? "Desactivar" : "Reactivar"}
                        variant="danger"
                        onClick={() => toggleActive(u)}
                      >
                        <UserX size={16} />
                      </IconButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableShell>

      <p className="mt-3 text-xs text-ink-muted">
        El PIN se guarda en la base local. Cambiá los PIN por defecto después de instalar.
      </p>

      <Modal
        open={modalOpen}
        title={editing ? `Editar: ${editing.display_name}` : "Nuevo empleado"}
        onClose={() => setModalOpen(false)}
      >
        <div className="space-y-4">
          <Input
            label="Nombre visible"
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
          />
          <Input
            label="Usuario (login)"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            disabled={editing?.id === 1}
          />
          <Select
            label="Rol"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
            disabled={editing?.id === 1}
          >
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <Input
            label="PIN"
            type="password"
            value={form.pin}
            onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
          />
          <FormActions>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </FormActions>
        </div>
      </Modal>
    </>
  );
}
