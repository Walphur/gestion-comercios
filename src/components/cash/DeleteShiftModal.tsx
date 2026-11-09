import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Alert, Button, Input, Modal, Spinner } from "../ui";
import { useAppConfig } from "../../context/AppConfig";
import { deleteClosedCashSession, loadShiftDeletePreview, type ShiftDeletePreview } from "../../db/cashSessionDelete";
import { verifyAdminUnlockPin } from "../../db/users";
import { useSubmitLock } from "../../hooks/useSubmitLock";
import { formatMoney } from "../../lib/format";
import { showUserError, showUserSuccess } from "../../lib/notice";

interface Props {
  sessionId: number | null;
  userId: number;
  onClose: () => void;
  onDeleted: (sessionId: number) => void;
}

/** Borrar un turno cerrado: primero qué se borra, después el PIN del administrador. */
export default function DeleteShiftModal({ sessionId, userId, onClose, onDeleted }: Props) {
  const { currency } = useAppConfig();
  const [preview, setPreview] = useState<ShiftDeletePreview | null>(null);
  const [step, setStep] = useState<"confirm" | "pin">("confirm");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | undefined>();
  const { busy, run } = useSubmitLock();

  useEffect(() => {
    setPreview(null);
    setStep("confirm");
    setPin("");
    setPinError(undefined);
    if (sessionId == null) return;
    loadShiftDeletePreview(sessionId).then(setPreview).catch((e) => {
      showUserError(e);
      onClose();
    });
  }, [sessionId, onClose]);

  const money = (n: number) => formatMoney(n, currency);

  function confirmDelete() {
    return run(async () => {
      if (sessionId == null) return false;
      if (!(await verifyAdminUnlockPin(pin))) {
        setPinError("PIN incorrecto. Usá el PIN del Administrador.");
        return false;
      }
      try {
        const done = await deleteClosedCashSession(sessionId, userId);
        showUserSuccess(
          `Turno #${sessionId} borrado${done.saleCount > 0 ? ` con ${done.saleCount} ${done.saleCount === 1 ? "venta" : "ventas"}` : ""}.`,
        );
        onDeleted(sessionId);
      } catch (e) {
        showUserError(e);
        return false;
      }
    });
  }

  const blocked = (preview?.blockers.length ?? 0) > 0;
  const salesText = preview
    ? preview.saleCount === 1
      ? `la venta de ese turno (${money(preview.saleTotal)})`
      : `las ${preview.saleCount} ventas de ese turno (${money(preview.saleTotal)})`
    : "";

  return (
    <Modal
      open={sessionId != null}
      onClose={onClose}
      title={sessionId != null ? `Borrar turno #${sessionId}` : "Borrar turno"}
      icon={<Trash2 size={18} />}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          {step === "confirm" ? (
            <Button variant="danger" size="sm" disabled={!preview || blocked} onClick={() => setStep("pin")}>
              Sí, borrar
            </Button>
          ) : (
            <Button variant="danger" size="sm" disabled={!pin.trim()} loading={busy} onClick={() => confirmDelete()}>
              <Trash2 size={14} /> Borrar turno
            </Button>
          )}
        </div>
      }
    >
      {!preview ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : blocked ? (
        <div className="min-w-0 space-y-3 text-sm">
          <p className="text-ink">Este turno no se puede borrar:</p>
          <ul className="list-disc space-y-1.5 pl-5 text-ink-muted">
            {preview.blockers.map((b) => (
              <li key={b} className="break-words">
                {b}
              </li>
            ))}
          </ul>
        </div>
      ) : step === "confirm" ? (
        <div className="min-w-0 space-y-3 text-sm">
          <p className="text-ink">
            Se borran el turno, su arqueo, sus movimientos de caja
            {preview.saleCount > 0 ? <> y {salesText}</> : " (no tiene ventas)"}. No se puede deshacer.
          </p>
          {preview.saleCount > 0 && (
            <p className="text-ink-muted">Lo vendido vuelve al stock, como al anular una venta.</p>
          )}
          {preview.voidedCount > 0 && (
            <p className="text-ink-muted">
              También se borran {preview.voidedCount === 1 ? "la venta anulada" : `las ${preview.voidedCount} ventas anuladas`}{" "}
              del turno.
            </p>
          )}
          {preview.linkedOutside > 0 && (
            <Alert variant="info">
              Los gastos, pagos a proveedores o movimientos de Tesorería que salieron del cajón en este turno no se
              borran. Si eran de prueba, anulalos desde su pantalla.
            </Alert>
          )}
        </div>
      ) : (
        <div className="min-w-0 space-y-3">
          <p className="text-sm text-ink-muted">Para borrar el turno, ingresá el PIN del Administrador.</p>
          <Input
            type="password"
            label="PIN de administrador"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setPinError(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pin.trim()) {
                e.preventDefault();
                void confirmDelete();
              }
            }}
            placeholder="••••"
            error={pinError}
            autoFocus
          />
        </div>
      )}
    </Modal>
  );
}
