import { useCallback, useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, HardDrive, Wallet } from "lucide-react";
import { PageHeader, Card, Button, Input, PageContent, EmptyState, Select } from "../components/ui";
import SetupHintBanner from "../components/SetupHintBanner";
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
import { setSetting, getSetting } from "../db/settings";
import { closeCashSessionBlind, openCashSession, pickBackupFolder, runBackupNow } from "../lib/tauri";
import { formatBackupMessage } from "../lib/backupFormat";
import { formatMoney } from "../lib/format";
import { showFlash, showUserError, showUserSuccess } from "../lib/notice";

type TabId = "turno" | "copias";

export default function CashSession() {
  const { user, can } = useAuth();
  const { currency } = useAppConfig();
  const [tab, setTab] = useState<TabId>("turno");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [declared, setDeclared] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [showOpenPrompt, setShowOpenPrompt] = useState(false);
  const [backupPath, setBackupPath] = useState("");
  const [cloudBackupPath, setCloudBackupPath] = useState("");
  const [closed, setClosed] = useState(false);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [totals, setTotals] = useState({ income: 0, expense: 0 });
  const [movType, setMovType] = useState<"income" | "expense">("expense");
  const [movAmount, setMovAmount] = useState("");
  const [movConcept, setMovConcept] = useState("");
  const [movErrors, setMovErrors] = useState<{ amount?: string; concept?: string }>({});
  const [openError, setOpenError] = useState<string | undefined>();
  const [closeError, setCloseError] = useState<string | undefined>();

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
    Promise.all([getSetting("backup_path"), getSetting("cloud_backup_path")]).then(
      ([local, cloud]) => {
        if (local) setBackupPath(local);
        if (cloud) setCloudBackupPath(cloud);
      },
    );
  }, [reloadMovements]);

  async function confirmOpen() {
    if (!user) return;
    const amount = Number(openingCash);
    if (openingCash.trim() === "" || Number.isNaN(amount) || amount < 0) {
      setOpenError("Ingresá el efectivo con el que abrís (0 o más).");
      showFlash({ message: "Completá el efectivo de apertura", variant: "error" });
      return;
    }
    setOpenError(undefined);
    try {
      const id = await openCashSession(user.id);
      setSessionId(id);
      setStoredCashSessionId(id);
      setClosed(false);
      setShowOpenPrompt(false);
      if (amount > 0) {
        await addCashMovement(id, user.id, "income", amount, "Efectivo de apertura");
      }
      setOpeningCash("");
      await reloadMovements(id);
      showUserSuccess("Turno abierto con éxito");
    } catch (e) {
      showUserError(e);
    }
  }

  async function handleCloseBlind() {
    if (!user || sessionId == null) return;
    const amount = Number(declared);
    if (declared.trim() === "" || Number.isNaN(amount) || amount < 0) {
      setCloseError("Ingresá el efectivo contado.");
      showFlash({ message: "Falta el efectivo contado", variant: "error" });
      return;
    }
    setCloseError(undefined);
    try {
      const result = await closeCashSessionBlind(sessionId, amount, user.id);
      setClosed(true);
      clearStoredCashSessionId();
      setSessionId(null);
      setDeclared("");
      showUserSuccess(
        result.backup_path
          ? "Turno cerrado. Copia de seguridad guardada."
          : "Turno cerrado con éxito",
      );
    } catch (e) {
      showUserError(e);
    }
  }

  async function handleAddMovement() {
    if (!user || sessionId == null) return;
    const amount = Number(movAmount);
    const nextErrors: { amount?: string; concept?: string } = {};
    if (movAmount.trim() === "" || Number.isNaN(amount) || amount <= 0) {
      nextErrors.amount = "Ingresá un monto válido";
    }
    if (!movConcept.trim()) {
      nextErrors.concept = "Ingresá el concepto";
    }
    if (nextErrors.amount || nextErrors.concept) {
      setMovErrors(nextErrors);
      showFlash({ message: "Completá los campos obligatorios", variant: "error" });
      return;
    }
    setMovErrors({});
    try {
      await addCashMovement(sessionId, user.id, movType, amount, movConcept.trim());
      setMovAmount("");
      setMovConcept("");
      await reloadMovements(sessionId);
      showUserSuccess(movType === "income" ? "Ingreso registrado con éxito" : "Egreso registrado con éxito");
    } catch (e) {
      showUserError(e);
    }
  }

  async function saveBackupPaths() {
    await setSetting("backup_path", backupPath.trim());
    await setSetting("cloud_backup_path", cloudBackupPath.trim());
    showUserSuccess("Rutas guardadas");
  }

  async function pickCloudFolder() {
    const path = await pickBackupFolder();
    if (path) setCloudBackupPath(path);
  }

  async function pickLocalFolder() {
    const path = await pickBackupFolder();
    if (path) setBackupPath(path);
  }

  return (
    <div>
      <PageHeader title="Caja" subtitle="Turno del día y copias de seguridad." />

      <div className="border-b border-[var(--color-panel-border)] px-8">
        <div className="inline-flex gap-1 rounded-xl bg-brand-50/80 p-1 dark:bg-brand-900/30">
          <button
            type="button"
            onClick={() => setTab("turno")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === "turno" ? "bg-white text-ink shadow-sm dark:bg-brand-950" : "text-ink-muted"
            }`}
          >
            Turno
          </button>
          <button
            type="button"
            onClick={() => setTab("copias")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === "copias" ? "bg-white text-ink shadow-sm dark:bg-brand-950" : "text-ink-muted"
            }`}
          >
            Copias de seguridad
          </button>
        </div>
      </div>

      <PageContent className="space-y-6">
        {tab === "turno" && (
          <>
            <Card variant="elevated">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900/40">
                  <Wallet className="text-brand-600" size={22} />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-ink">Turno actual</h3>
                  {sessionId ? (
                    <p className="text-sm text-ink-muted">
                      Turno abierto: <strong className="text-ink">#{sessionId}</strong>
                    </p>
                  ) : (
                    <p className="text-sm text-ink-muted">Sin turno activo</p>
                  )}
                </div>
              </div>
              {!sessionId && !showOpenPrompt && (
                <EmptyState
                  compact
                  icon={Wallet}
                  title="Caja cerrada"
                  description="Abrí un turno antes de vender en el punto de venta."
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setShowOpenPrompt(true);
                        setOpenError(undefined);
                      }}
                    >
                      Abrir turno
                    </Button>
                  }
                />
              )}
              {!sessionId && showOpenPrompt && (
                <div className="space-y-3 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)]/40 p-4">
                  <p className="text-sm text-ink-muted">
                    ¿Cuánto efectivo tenés en el negocio al abrir?
                  </p>
                  <Input
                    label="Efectivo de apertura"
                    type="number"
                    min={0}
                    value={openingCash}
                    onChange={(e) => {
                      setOpeningCash(e.target.value);
                      setOpenError(undefined);
                    }}
                    placeholder="Ej: 50000"
                    error={openError}
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void confirmOpen()}>Confirmar apertura</Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowOpenPrompt(false);
                        setOpeningCash("");
                        setOpenError(undefined);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
              {sessionId && (
                <p className="text-xs text-ink-muted">El turno queda vinculado a tus ventas del día.</p>
              )}
              {!sessionId && !showOpenPrompt && (
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowOpenPrompt(true);
                      setOpenError(undefined);
                    }}
                  >
                    Abrir turno
                  </Button>
                </div>
              )}
            </Card>

            {sessionId && !closed && (
              <Card>
                <h3 className="mb-2 font-semibold text-ink">Movimientos del turno</h3>
                <p className="mb-4 text-sm text-ink-muted">
                  Registrá ingresos o egresos de efectivo durante el día.
                </p>
                <div className="mb-4 flex flex-wrap gap-4 text-sm">
                  <span className="text-emerald-700">
                    Ingresos: <strong>{formatMoney(totals.income, currency)}</strong>
                  </span>
                  <span className="text-red-600">
                    Egresos: <strong>{formatMoney(totals.expense, currency)}</strong>
                  </span>
                </div>
                <div className="grid min-w-0 grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,7.5rem)_minmax(0,8.5rem)_minmax(0,1fr)]">
                  <Select
                    label="Tipo"
                    value={movType}
                    onChange={(e) => setMovType(e.target.value as "income" | "expense")}
                  >
                    <option value="expense">Egreso</option>
                    <option value="income">Ingreso</option>
                  </Select>
                  <Input
                    label="Monto"
                    type="number"
                    value={movAmount}
                    onChange={(e) => {
                      setMovAmount(e.target.value);
                      setMovErrors((prev) => ({ ...prev, amount: undefined }));
                    }}
                    error={movErrors.amount}
                  />
                  <Input
                    label="Concepto"
                    value={movConcept}
                    onChange={(e) => {
                      setMovConcept(e.target.value);
                      setMovErrors((prev) => ({ ...prev, concept: undefined }));
                    }}
                    placeholder="Ej: Pago proveedor"
                    error={movErrors.concept}
                  />
                </div>
                <Button className="mt-4" onClick={() => void handleAddMovement()}>
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
                        <span className="min-w-0 truncate text-ink-muted">
                          {m.created_at} · {m.concept}
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
                <h3 className="mb-2 font-semibold text-ink">Cerrar turno</h3>
                <p className="mb-4 text-sm text-ink-muted">
                  Contá el efectivo e ingresá el monto. El sistema guarda una copia de seguridad al
                  cerrar.
                </p>
                {!backupPath.trim() && !cloudBackupPath.trim() && (
                  <SetupHintBanner
                    className="mb-4"
                    icon={HardDrive}
                    title="Todavía no configuraste dónde guardar las copias"
                    description="Elegí una carpeta local o de Google Drive / OneDrive para que al cerrar el turno quede respaldado fuera de esta PC."
                    to="/admin?section=system"
                    linkLabel="Configurar guardado"
                    tone="sky"
                    collapsible
                    storageKey="caja-backup-hint"
                  />
                )}
                {(backupPath.trim() || cloudBackupPath.trim()) && (
                  <p className="mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100">
                    Al cerrar se guardará copia
                    {cloudBackupPath.trim()
                      ? ` también en: ${cloudBackupPath.trim()}`
                      : backupPath.trim()
                        ? ` en: ${backupPath.trim()}`
                        : "."}
                    {" · "}
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => setTab("copias")}
                    >
                      Cambiar carpetas
                    </button>
                  </p>
                )}
                <Input
                  label="Efectivo contado"
                  type="number"
                  value={declared}
                  onChange={(e) => {
                    setDeclared(e.target.value);
                    setCloseError(undefined);
                  }}
                  error={closeError}
                />
                <Button className="mt-4" onClick={() => void handleCloseBlind()}>
                  Cerrar turno
                </Button>
              </Card>
            )}
          </>
        )}

        {tab === "copias" && (
          <Card>
            <h3 className="mb-2 font-semibold text-ink">Copias de seguridad</h3>
            <p className="mb-3 text-sm text-ink-muted">
              Al cerrar caja se guarda una copia automática. También podés elegir carpetas extra
              (pendrive, disco o Google Drive / OneDrive en la PC).
            </p>
            {!backupPath.trim() && !cloudBackupPath.trim() && (
              <SetupHintBanner
                className="mb-4"
                icon={HardDrive}
                title="Sin carpeta de respaldo"
                description="Elegí al menos una carpeta abajo o en Configuración → Sistema para no perder datos."
                to="/admin?section=system"
                linkLabel="Ver en Configuración"
                collapsible
                storageKey="caja-backup-hint-tab"
              />
            )}
            <Input
              label="Carpeta local (opcional)"
              value={backupPath}
              onChange={(e) => setBackupPath(e.target.value)}
              placeholder="Ej: pendrive o disco de respaldo"
            />
            <div className="mt-2">
              <Button variant="ghost" className="!py-1.5 !text-xs" onClick={() => void pickLocalFolder()}>
                Elegir carpeta…
              </Button>
            </div>
            <Input
              label="Carpeta en la nube (opcional)"
              value={cloudBackupPath}
              onChange={(e) => setCloudBackupPath(e.target.value)}
              placeholder="Ej: Google Drive o OneDrive"
              className="mt-4"
            />
            <div className="mt-2">
              <Button variant="ghost" className="!py-1.5 !text-xs" onClick={() => void pickCloudFolder()}>
                Elegir carpeta nube…
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void saveBackupPaths()}>
                Guardar rutas
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    const result = await runBackupNow(backupPath || undefined);
                    showUserSuccess(formatBackupMessage(result));
                  } catch (e) {
                    showUserError(e);
                  }
                }}
              >
                Guardar copia ahora
              </Button>
            </div>
          </Card>
        )}
      </PageContent>
    </div>
  );
}
