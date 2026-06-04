import { useCallback, useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { PageHeader, Card, Button, Input } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useAppConfig } from "../context/AppConfig";
import {
  clearStoredCashSessionId,
  setStoredCashSessionId,
  syncCashSessionStorage,
} from "../db/cash";
import {
  addCashMovement,
  getCashMovementTotals,
  listCashMovements,
  type CashMovement,
} from "../db/cashMovements";
import { setSetting } from "../db/settings";
import { closeCashSessionBlind, openCashSession, runBackupNow } from "../lib/tauri";
import { formatMoney } from "../lib/format";

export default function CashSession() {
  const { user, can } = useAuth();
  const { currency } = useAppConfig();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [declared, setDeclared] = useState("");
  const [backupPath, setBackupPath] = useState("");
  const [message, setMessage] = useState("");
  const [closed, setClosed] = useState(false);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [totals, setTotals] = useState({ income: 0, expense: 0 });
  const [movType, setMovType] = useState<"income" | "expense">("expense");
  const [movAmount, setMovAmount] = useState("");
  const [movConcept, setMovConcept] = useState("");

  const reloadMovements = useCallback(async (sid: number) => {
    const [list, t] = await Promise.all([
      listCashMovements(sid),
      getCashMovementTotals(sid),
    ]);
    setMovements(list);
    setTotals(t);
  }, []);

  useEffect(() => {
    syncCashSessionStorage().then((id) => {
      setSessionId(id);
      if (id != null) void reloadMovements(id);
    });
  }, [reloadMovements]);

  async function handleOpen() {
    if (!user) return;
    const id = await openCashSession(user.id);
    setSessionId(id);
    setStoredCashSessionId(id);
    setMessage(`Turno abierto (#${id})`);
    setClosed(false);
    await reloadMovements(id);
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
    setMovements([]);
    setTotals({ income: 0, expense: 0 });
  }

  async function handleAddMovement() {
    if (!user || sessionId == null) return;
    const amount = Number(movAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      setMessage("Ingresá un monto válido.");
      return;
    }
    try {
      await addCashMovement(sessionId, user.id, movType, amount, movConcept);
      setMovAmount("");
      setMovConcept("");
      await reloadMovements(sessionId);
      setMessage(movType === "income" ? "Ingreso registrado." : "Egreso registrado.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveBackupPath() {
    await setSetting("backup_path", backupPath.trim());
    setMessage("Ruta de backup guardada.");
  }

  return (
    <div>
      <PageHeader
        title="Caja"
        subtitle="Apertura, movimientos del turno, cierre con arqueo ciego y backup."
      />
      <div className="space-y-6 p-8">
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <Wallet className="text-brand-600" />
            <h3 className="font-semibold text-ink">Turno actual</h3>
          </div>
          {sessionId ? (
            <p className="text-sm text-ink-muted">
              Sesión abierta: <strong className="text-ink">#{sessionId}</strong>
            </p>
          ) : (
            <p className="text-sm text-ink-muted">No hay turno abierto.</p>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={handleOpen} disabled={!!sessionId}>
              Abrir turno
            </Button>
          </div>
        </Card>

        {sessionId && !closed && (
          <Card>
            <h3 className="mb-2 font-semibold text-ink">Ingresos y egresos del turno</h3>
            <p className="mb-4 text-sm text-ink-muted">
              Gastos (proveedor, insumos) o ingresos extra (cambio, retiro de otro turno). Afectan
              el efectivo esperado al cerrar.
            </p>
            <div className="mb-4 flex flex-wrap gap-4 text-sm">
              <span className="text-emerald-700">
                Ingresos: <strong>{formatMoney(totals.income, currency)}</strong>
              </span>
              <span className="text-red-600">
                Egresos: <strong>{formatMoney(totals.expense, currency)}</strong>
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">Tipo</span>
                <select
                  value={movType}
                  onChange={(e) => setMovType(e.target.value as "income" | "expense")}
                  className="w-full rounded-lg border border-brand-200 bg-[var(--color-input-bg)] px-3 py-2 text-sm"
                >
                  <option value="expense">Egreso (sale plata)</option>
                  <option value="income">Ingreso (entra plata)</option>
                </select>
              </label>
              <Input
                label="Monto"
                type="number"
                step="0.01"
                value={movAmount}
                onChange={(e) => setMovAmount(e.target.value)}
              />
            </div>
            <Input
              label="Concepto"
              value={movConcept}
              onChange={(e) => setMovConcept(e.target.value)}
              placeholder="Ej: Pago proveedor, retiro cambio"
              className="mt-3"
            />
            <Button className="mt-4" onClick={handleAddMovement}>
              {movType === "income" ? (
                <>
                  <ArrowUpCircle size={16} /> Registrar ingreso
                </>
              ) : (
                <>
                  <ArrowDownCircle size={16} /> Registrar egreso
                </>
              )}
            </Button>

            {movements.length > 0 && (
              <ul className="mt-6 max-h-48 space-y-2 overflow-y-auto border-t border-brand-100 pt-4 text-sm">
                {movements.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span className="text-ink-muted">
                      {m.created_at} · {m.concept}
                      {m.user_name ? ` (${m.user_name})` : ""}
                    </span>
                    <span
                      className={`shrink-0 font-medium tabular-nums ${
                        m.type === "income" ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {m.type === "income" ? "+" : "−"}
                      {formatMoney(m.amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {sessionId && !closed && can("close_cash_blind") && (
          <Card>
            <h3 className="mb-2 font-semibold text-ink">Cierre con arqueo ciego</h3>
            <p className="mb-4 text-sm text-ink-muted">
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
          <p className="mb-3 text-sm text-ink-muted">
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
          <p className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-ink dark:bg-brand-900/40">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
