import { useCallback, useEffect, useMemo, useState } from "react";
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

/** Rol visible en UI; `cadete` se guarda como cajero + is_cadete (sin login). */
type UiRole = UserRole | "cadete";

const ROLE_LABELS: Record<UiRole, string> = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
  cadete: "Cadete",
};

function slugUsername(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
  return `cadete_${base || "user"}`;
}

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function uiRoleOf(u: StaffUser): UiRole {
  return u.is_cadete ? "cadete" : u.role;
}

const emptyForm = (): StaffUserInput & { ui_role: UiRole } => ({
  username: "",
  display_name: "",
  role: "cashier",
  pin: "",
  phone: "",
  is_cadete: false,
  hide_stock: false,
  ui_role: "cashier",
});

export default function StaffManagementPanel() {
  const { can } = useAuth();
  const { rubroDef } = useAppConfig();
  const showCadete = rubroDef.id === "gastronomia";
  const { unlimitedStaff, maxActiveStaff } = usePlanEntitlements();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setStaff(await listStaffUsers());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const activeCount = staff.filter((u) => u.active && !u.is_cadete).length;
  const atStaffCap =
    !unlimitedStaff && maxActiveStaff != null && activeCount >= maxActiveStaff;

  const roleOptions = useMemo((): UiRole[] => {
    if (showCadete) {
      return unlimitedStaff
        ? (["admin", "manager", "cashier", "cadete"] as UiRole[])
        : (["admin", "cashier", "cadete"] as UiRole[]);
    }
    return unlimitedStaff
      ? (["admin", "manager", "cashier"] as UiRole[])
      : (["admin", "cashier"] as UiRole[]);
  }, [showCadete, unlimitedStaff]);

  const isCadeteForm = form.ui_role === "cadete";

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(u: StaffUser) {
    setEditing(u);
    const ui = uiRoleOf(u);
    setForm({
      username: u.username,
      display_name: u.display_name,
      role: u.role,
      pin: u.pin,
      phone: u.phone ?? "",
      is_cadete: Boolean(u.is_cadete),
      hide_stock: Boolean(u.hide_stock),
      ui_role: ui,
    });
    setModalOpen(true);
  }

  function setUiRole(ui: UiRole) {
    setForm((f) => ({
      ...f,
      ui_role: ui,
      is_cadete: ui === "cadete",
      role: ui === "cadete" ? "cashier" : (ui as UserRole),
      hide_stock: ui === "admin" || ui === "cadete" ? false : f.hide_stock,
    }));
  }

  async function handleSave() {
    if (!form.display_name.trim()) {
      showUserError("Completá el nombre.", "Faltan datos");
      return;
    }

    const asCadete = form.ui_role === "cadete";
    if (asCadete && !form.phone?.trim()) {
      showUserError(
        "El cadete necesita WhatsApp / celular para recibir los pedidos.",
        "Falta el teléfono",
      );
      return;
    }

    let username = form.username.trim().toLowerCase();
    let pin = form.pin.trim();
    if (asCadete) {
      if (!editing) {
        username = slugUsername(form.display_name);
        pin = randomPin();
      } else {
        username = editing.username;
        pin = editing.pin || randomPin();
      }
    } else if (!username || !pin) {
      showUserError("Completá usuario y PIN.", "Faltan datos");
      return;
    }

    if (!unlimitedStaff) {
      if (!asCadete && form.role === "manager") {
        showUserError(
          "La licencia permanente solo permite administrador y cajero. Pasate al plan mensual para encargados.",
          "Rol no disponible",
        );
        return;
      }
      const countsAsStaff = !asCadete;
      if (!editing && countsAsStaff && atStaffCap) {
        showUserError(entitlementBlockedMessage("unlimitedStaff"), "Límite del plan");
        return;
      }
      if (editing && !editing.active && countsAsStaff && atStaffCap) {
        showUserError(entitlementBlockedMessage("unlimitedStaff"), "Límite del plan");
        return;
      }
    }

    const payload: StaffUserInput = {
      username,
      display_name: form.display_name.trim(),
      role: asCadete ? "cashier" : form.role,
      pin,
      phone: form.phone?.trim() || "",
      is_cadete: asCadete,
      hide_stock: asCadete ? false : Boolean(form.hide_stock),
    };

    setSaving(true);
    try {
      if (editing) {
        await updateStaffUser(editing.id, payload);
      } else {
        // Si el username auto de cadete choca, reintentar con sufijo.
        try {
          await createStaffUser(payload);
        } catch (e) {
          if (asCadete && String(e).includes("ya existe")) {
            await createStaffUser({
              ...payload,
              username: `${payload.username}${Math.floor(Math.random() * 90 + 10)}`,
            });
          } else {
            throw e;
          }
        }
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
      ? u.is_cadete
        ? `¿Desactivar a ${u.display_name}? No aparecerá en deliveries.`
        : `¿Desactivar a ${u.display_name}? No podrá iniciar sesión.`
      : `¿Reactivar a ${u.display_name}?`;
    if (
      !(await confirmAction({
        title: u.active ? "Desactivar" : "Reactivar",
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
          {showCadete
            ? "Creá cajeros y cadetes. El cadete solo necesita nombre y WhatsApp (no entra al sistema)."
            : unlimitedStaff
              ? "Creá cajeros, encargados y administradores. Cada persona ingresa con su usuario y PIN."
              : "Licencia permanente: hasta 1 administrador y 1 cajero activos."}
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
            {staff.map((u) => {
              const ui = uiRoleOf(u);
              return (
                <tr key={u.id}>
                  <td className="font-medium text-ink">{u.display_name}</td>
                  <td className="cell-muted">{ui === "cadete" ? "—" : u.username}</td>
                  <td className="cell-muted">{ROLE_LABELS[ui]}</td>
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
              );
            })}
          </tbody>
        </table>
      </DataTableShell>

      <p className="mt-3 text-xs text-ink-muted">
        {showCadete
          ? "Los cadetes no usan PIN ni login: se eligen en pedidos pendientes para mandarles el delivery por WhatsApp."
          : "El PIN se guarda en la base local. Cambiá los PIN por defecto después de instalar."}
      </p>

      <Modal
        open={modalOpen}
        title={editing ? `Editar: ${editing.display_name}` : "Nuevo empleado"}
        onClose={() => setModalOpen(false)}
      >
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            placeholder={isCadeteForm ? "Ej: José" : undefined}
          />
          <Select
            label="Rol"
            value={form.ui_role}
            onChange={(e) => setUiRole(e.target.value as UiRole)}
            disabled={editing?.id === 1}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          {isCadeteForm ? (
            <Input
              label="WhatsApp / celular *"
              value={form.phone ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="11 2345-6789"
              hint="Con este número le llega el pedido por WhatsApp al asignarlo."
            />
          ) : (
            <>
              <Input
                label="Usuario (login)"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                disabled={editing?.id === 1}
              />
              <Input
                label="PIN"
                type="password"
                value={form.pin}
                onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
              />
              {showCadete ? (
                <Input
                  label="WhatsApp / celular (opcional)"
                  value={form.phone ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="11 2345-6789"
                />
              ) : null}
              {(form.ui_role === "cashier" || form.ui_role === "manager") && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--color-panel-border)] px-3 py-2.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-[var(--color-panel-border)]"
                    checked={Boolean(form.hide_stock)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, hide_stock: e.target.checked }))
                    }
                  />
                  <span>
                    <span className="font-medium">No ver stock del negocio</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      Oculta cantidades en Productos, Stock y punto de venta.
                    </span>
                  </span>
                </label>
              )}
            </>
          )}
          <FormActions>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </FormActions>
        </div>
      </Modal>
    </>
  );
}
