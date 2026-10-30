import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { Button, FormActions, Modal, NumericInput } from "../ui";
import { setOpeningBalancesNow, type AccountBalance } from "../../db/treasury";
import { showUserError, showUserSuccess } from "../../lib/notice";

/** Primera vez: «¿Cuánto tenés hoy en cada cuenta?». */
export default function TreasuryStartModal({
  open,
  balances,
  cashUsed,
  onClose,
  onSaved,
}: {
  open: boolean;
  balances: AccountBalance[];
  /** Si ya se usó la caja, el cajón sale de ahí y no se pregunta. */
  cashUsed: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const rows = balances.filter((b) => !(cashUsed && b.account.kind === "cajon"));

  useEffect(() => {
    if (!open) return;
    setValues(Object.fromEntries(rows.map((b) => [b.account.id, Math.max(0, b.balance)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await setOpeningBalancesNow(rows.map((b) => ({ id: b.account.id, balance: values[b.account.id] ?? 0 })));
      showUserSuccess("Listo. Desde ahora WalQo suma y resta solo.");
      onSaved();
      onClose();
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="¿Cuánto tenés hoy en cada cuenta?"
      subtitle="Una sola vez. Después WalQo suma las ventas y resta los gastos solo"
      icon={<Landmark size={18} />}
      onClose={onClose}
      footer={
        <FormActions>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Después
          </Button>
          <Button onClick={() => save()} loading={busy}>
            Empezar
          </Button>
        </FormActions>
      }
    >
      <div className="space-y-4">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {rows.map((b) => (
            <NumericInput
              key={b.account.id}
              label={b.account.name}
              value={values[b.account.id] ?? 0}
              min={0}
              onChange={(v) => setValues((prev) => ({ ...prev, [b.account.id]: v }))}
            />
          ))}
        </div>
        <p className="text-xs text-ink-muted">
          {cashUsed
            ? "El efectivo del cajón no se pregunta: sale de la caja (lo que contaste al cerrar o lo que debería haber si está abierta)."
            : "Si no sabés un número exacto, poné uno aproximado: después lo podés ajustar."}
        </p>
      </div>
    </Modal>
  );
}
