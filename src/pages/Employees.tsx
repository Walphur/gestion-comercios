import { useCallback, useEffect, useState } from "react";
import { UserPlus, Pencil, UserX } from "lucide-react";
import { PageHeader, Card, Button, Input, Modal } from "../components/ui";
import { Link } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  createStaffUser,
  listStaffUsers,
  updateStaffUser,
  type StaffUser,
  type StaffUserInput,
  type UserRole,
} from "../db/users";

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

export default function Employees() {
  const { can, user } = useAuth();
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
      alert("Completá usuario, nombre visible y PIN.");
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
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: StaffUser) {
    if (u.id === 1) return;
    const msg = u.active
      ? `¿Desactivar a ${u.display_name}? No podrá iniciar sesión.`
      : `¿Reactivar a ${u.display_name}?`;
    if (!confirm(msg)) return;
    try {
      await updateStaffUser(u.id, { active: !u.active });
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  if (!can("manage_users")) {
    return (
      <div className="p-8 text-ink-muted">No tenés permiso para gestionar empleados.</div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Empleados"
        subtitle="Cada empleado inicia sesión con su usuario y PIN. Las ventas quedan asociadas a quien cobró."
        actions={
          <Button onClick={openCreate}>
            <UserPlus size={16} /> Nuevo empleado
          </Button>
        }
      />

      <div className="p-8">
        <Card className="mb-6 border-[var(--color-panel-border)] bg-brand-50/40 dark:bg-brand-900/20">
          <p className="text-sm font-medium text-ink">¿Quién está trabajando ahora?</p>
          <p className="mt-2 text-sm text-ink-muted">
            Es quien <strong>inició sesión</strong> con su usuario y PIN
            {user ? ` (${user.display_name})` : ""}. Las ventas y la caja quedan a su nombre.
            Para cambiar de cajero al turno siguiente, andá a{" "}
            <strong className="text-ink">Iniciar sesión</strong> en el menú e ingresá con el otro
            empleado.
          </p>
          <Link
            to="/sesion"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
          >
            <LogIn size={16} />
            Ir a Iniciar sesión
          </Link>
        </Card>

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-100 bg-brand-50/50 text-left text-xs uppercase text-ink-muted dark:bg-brand-900/40">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-brand-50 hover:bg-brand-50/30 dark:border-brand-800/50 dark:hover:bg-brand-900/30"
                >
                  <td className="px-4 py-3 font-medium text-ink">{u.display_name}</td>
                  <td className="px-4 py-3 text-ink-muted">{u.username}</td>
                  <td className="px-4 py-3 text-ink-muted">{ROLE_LABELS[u.role]}</td>
                  <td className="px-4 py-3">
                    {u.active ? (
                      <span className="text-xs font-medium text-emerald-600">Activo</span>
                    ) : (
                      <span className="text-xs font-medium text-ink-muted">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="rounded-lg p-2 text-ink-muted hover:bg-brand-50 hover:text-brand-700"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      {u.id !== 1 && (
                        <button
                          type="button"
                          onClick={() => toggleActive(u)}
                          className="rounded-lg p-2 text-ink-muted hover:bg-red-50 hover:text-red-600"
                          title={u.active ? "Desactivar" : "Reactivar"}
                        >
                          <UserX size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-4 text-xs text-ink-muted">
          El PIN se guarda en la base local (uso en mostrador). Cambiá los PIN por defecto después de
          instalar.
        </p>
      </div>

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
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Rol</span>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              disabled={editing?.id === 1}
              className="w-full rounded-lg border border-brand-200 bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-brand-700"
            >
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="PIN"
            type="password"
            value={form.pin}
            onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
          />
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
