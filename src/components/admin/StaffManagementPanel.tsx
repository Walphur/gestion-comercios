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
import { useAppConfig } from "../../context/AppConfig";
import { usePlanEntitlements } from "../../hooks/usePlanEntitlements";
import { confirmAction } from "../../lib/confirm";
import {
  createStaffUser,
  listStaffUsers,
  updateStaffUser,
  type StaffUser,
  type StaffUserInput,
  type UserRole,
} from "../../db/users";
import PlanUpsellNotice from "../PlanUpsellNotice";
import { entitlementBlockedMessage } from "../../config/planEntitlements";

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
  phone: "",
  is_cadete: false,
});

export default function StaffManagementPanel() {
  const { can } = useAuth();
  const { rubroDef } = useAppConfig();
  const showCadete = rubroDef.id === "gastronomia";
  const { unlimitedStaff, maxActiveStaff } = usePlanEntitlements();
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

  /** Cadetes no cuentan para el tope de cajeros del plan permanente. */
  const activeCount = staff.filter((u) => u.active && !u.is_cadete).length;
  const atStaffCap =
    !unlimitedStaff && maxActiveStaff != null && activeCount >= maxActiveStaff;

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
      phone: u.phone ?? "",
      is_cadete: Boolean(u.is_cadete),
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.username.trim() || !form.display_name.trim() || !form.pin.trim()) {
      showUserError("Completá usuario, nombre visible y PIN.", "Faltan datos");
      return;
    }
    if (form.is_cadete && !form.phone?.trim()) {
      showUserError(
        "El cadete necesita WhatsApp / celular para recibir los pedidos.",
        "Falta el teléfono",
      );
      return;
    }
    if (!unlimitedStaff) {
      if (form.role === "manager") {
        showUserError(
          "La licencia permanente solo permite administrador y cajero. Pasate al plan mensual para encargados.",
          "Rol no disponible",
        );
        return;
      }
      const countsAsStaff = !form.is_cadete;
      if (!editing && countsAsStaff && atStaffCap) {
        showUserError(entitlementBlockedMessage("unlimitedStaff"), "Límite del plan");
        return;
      }
      if (editing && !editing.active && countsAsStaff && atStaffCap) {
        showUserError(entitlementBlockedMessage("unlimitedStaff"), "Límite del plan");
        return;
      }
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
          {unlimitedStaff
            ? showCadete
              ? "Creá cajeros, encargados, administradores y cadetes (con WhatsApp para deliveries)."
              : "Creá cajeros, encargados y administradores. Cada persona ingresa con su usuario y PIN."
            : "Licencia permanente: hasta 1 administrador y 1 cajero activos. Los cadetes no cuentan en ese límite."}
        </p>
        <Button size="sm" onClick={openCreate}>
          <UserPlus size={16} /> Nuevo empleado
        </Button>
      </div>

      {!unlimitedStaff && <PlanUpsellNotice feature="unlimitedStaff" className="mb-4" />}

      <DataTableShell>
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Usuario</th>
              <th>Rol</th>
              {showCadete ? <th>WhatsApp</th> : null}
              <th>Estado</th>
              <th className="col-actions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id}>
                <td className="font-medium text-ink">
                  {u.display_name}
                  {u.is_cadete ? (
                    <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                      Cadete
                    </span>
                  ) : null}
                </td>
                <td className="cell-muted">{u.username}</td>
                <td className="cell-muted">{ROLE_LABELS[u.role]}</td>
                {showCadete ? (
                  <td className="cell-muted">{u.phone?.trim() || "—"}</td>
                ) : null}
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
        {showCadete
          ? " Los cadetes se eligen en pedidos pendientes para mandarles el delivery por WhatsApp."
          : ""}
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
            {(
              (unlimitedStaff
                ? (Object.keys(ROLE_LABELS) as UserRole[])
                : (["admin", "cashier"] as UserRole[]))
            ).map((r) => (
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
          {showCadete ? (
            <>
              <Input
                label="WhatsApp / celular"
                value={form.phone ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="11 2345-6789"
              />
              <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={Boolean(form.is_cadete)}
                  onChange={(e) => setForm((f) => ({ ...f, is_cadete: e.target.checked }))}
                  className="mt-0.5 rounded border-[var(--color-panel-border)]"
                />
                <span>
                  <span className="font-medium">Es cadete / delivery</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    Aparece al asignar deliveries y podés avisarle el pedido por WhatsApp.
                  </span>
                </span>
              </label>
            </>
          ) : null}
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
