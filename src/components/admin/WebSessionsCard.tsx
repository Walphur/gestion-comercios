import { useState } from "react";
import { LogOut } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui";
import { confirmAction } from "../../lib/confirm";
import { formatUserError } from "../../lib/userError";
import { showUserError } from "../../lib/notice";

/** Solo WalQo Web: corta todas las sesiones de la cuenta (celulares, otras PC). */
export default function WebSessionsCard() {
  const [busy, setBusy] = useState(false);

  async function handleRevokeAll() {
    const ok = await confirmAction({
      title: "Cerrar la sesión en todos los aparatos",
      message: "¿Cerrar la sesión de WalQo Web en todos los celulares y computadoras?",
      detail: "Vas a tener que entrar de nuevo con el email y la contraseña, también en este aparato.",
      variant: "danger",
      confirmLabel: "Sí, cerrar todo",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await invoke("web_sessions_revoke_all");
      const { setWebToken } = await import("../../web/api");
      setWebToken(null);
    } catch (e) {
      showUserError(formatUserError(e), "No se pudo cerrar");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--color-panel-border)] p-4">
      <p className="text-sm font-semibold text-ink">Seguridad de la cuenta</p>
      <p className="mt-1 text-xs text-ink-muted">
        Si perdiste un celular o alguien dejó de trabajar con vos, cerrá la sesión en todos lados y
        cambiá la contraseña de la cuenta.
      </p>
      <Button variant="secondary" className="mt-3" disabled={busy} onClick={() => void handleRevokeAll()}>
        <LogOut size={16} />
        Cerrar la sesión en todos los aparatos
      </Button>
    </section>
  );
}
