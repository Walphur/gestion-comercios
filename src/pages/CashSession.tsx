import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { PageHeader, Card, Button, Input } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import {
  clearStoredCashSessionId,
  setStoredCashSessionId,
  syncCashSessionStorage,
} from "../db/cash";
import { setSetting } from "../db/settings";
import { closeCashSessionBlind, openCashSession, runBackupNow } from "../lib/tauri";

export default function CashSession() {
  const { user, can } = useAuth();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [declared, setDeclared] = useState("");
  const [backupPath, setBackupPath] = useState("");
  const [message, setMessage] = useState("");
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    syncCashSessionStorage().then(setSessionId);
  }, []);

  async function handleOpen() {
    if (!user) return;
    const id = await openCashSession(user.id);
    setSessionId(id);
    setStoredCashSessionId(id);
    setMessage(`Turno abierto (#${id})`);
    setClosed(false);
  }

  async function handleCloseBlind() {
    if (!user || sessionId == null) return;
    const amount = Number(declared);
    if (Number.isNaN(amount)) {
      setMessage("Ingresá un monto válido.");
      return;
    }
    const result = await closeCashSessionBlind(sessionId, amount, user.id);
    setClosed(true);
    clearStoredCashSessionId();
    setMessage(
      `Turno cerrado. Backup: ${result.backup_path ?? "en carpeta por defecto"}. El administrador verá la diferencia de caja.`,
    );
    setSessionId(null);
  }

  async function saveBackupPath() {
    await setSetting("backup_path", backupPath.trim());
    setMessage("Ruta de backup guardada.");
  }

  return (
    <div>
      <PageHeader
        title="Caja"
        subtitle="Apertura, cierre con arqueo ciego y backup automático al cerrar."
      />
      <div className="space-y-6 p-8">
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <Wallet className="text-brand-600" />
            <h3 className="font-semibold text-ink">Turno actual</h3>
          </div>
          {sessionId ? (
            <p className="text-sm text-slate-600">
              Sesión abierta: <strong>#{sessionId}</strong>
            </p>
          ) : (
            <p className="text-sm text-slate-500">No hay turno abierto.</p>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={handleOpen} disabled={!!sessionId}>
              Abrir turno
            </Button>
          </div>
        </Card>

        {sessionId && !closed && can("close_cash_blind") && (
          <Card>
            <h3 className="mb-2 font-semibold text-ink">Cierre con arqueo ciego</h3>
            <p className="mb-4 text-sm text-slate-500">
              Contá el efectivo físico e ingresá solo ese monto. El sistema no te muestra cuánto
              debería haber; el administrador verá la diferencia.
            </p>
            <Input
              label="Efectivo contado ($)"
              type="number"
              step="0.01"
              value={declared}
              onChange={(e) => setDeclared(e.target.value)}
            />
            <Button className="mt-4" onClick={handleCloseBlind}>
              Cerrar turno y generar backup
            </Button>
          </Card>
        )}

        <Card>
          <h3 className="mb-2 font-semibold text-ink">Backup automático</h3>
          <p className="mb-3 text-sm text-slate-500">
            Al cerrar caja se guarda un ZIP con la base SQLite. Podés indicar una carpeta (ej.
            pendrive: <code className="text-xs">E:\BackupsKiosco</code>).
          </p>
          <Input
            label="Carpeta de destino"
            value={backupPath}
            onChange={(e) => setBackupPath(e.target.value)}
            placeholder="Ej: D:\Backups o E:\BackupsKiosco"
          />
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={saveBackupPath}>
              Guardar ruta
            </Button>
            <Button variant="ghost" onClick={() => void runBackupNow(backupPath || undefined)}>
              Backup manual ahora
            </Button>
          </div>
        </Card>

        {message && (
          <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">{message}</p>
        )}
      </div>
    </div>
  );
}
