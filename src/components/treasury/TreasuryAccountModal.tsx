import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { Button, FormActions, Input, Modal, NumericInput, Select } from "../ui";
import {
  ACCOUNT_KIND_LABELS,
  saveTreasuryAccount,
  type TreasuryAccount,
  type TreasuryAccountKind,
} from "../../db/treasury";
import { todayYmd } from "../../lib/format";
import { showUserError, showUserSuccess } from "../../lib/notice";

const NEW_KINDS: TreasuryAccountKind[] = ["banco", "mercadopago", "guardado", "otra"];

export default function TreasuryAccountModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: TreasuryAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TreasuryAccountKind>("banco");
  const [balance, setBalance] = useState(0);
  const [ymd, setYmd] = useState(todayYmd());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setKind(editing?.kind ?? "banco");
    setBalance(editing?.opening_balance ?? 0);
    setYmd(editing ? editing.opening_date.slice(0, 10) : todayYmd());
  }, [open, editing]);

  const isDrawer = editing?.kind === "cajon";

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await saveTreasuryAccount({ id: editing?.id ?? null, name, kind, openingBalance: balance, openingYmd: ymd });
      showUserSuccess(editing ? "Cuenta guardada." : "Cuenta agregada.");
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
      title={editing ? "Editar cuenta" : "Agregar cuenta"}
      subtitle="Por ejemplo «Banco Nación» o «Cuenta DNI»"
      icon={<Landmark size={18} />}
      onClose={onClose}
      footer={
        <FormActions>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => save()} loading={busy}>
            Guardar
          </Button>
        </FormActions>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Banco Nación" />
          {editing ? (
            <Input label="Tipo" value={ACCOUNT_KIND_LABELS[editing.kind]} disabled readOnly />
          ) : (
            <Select label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as TreasuryAccountKind)}>
              {NEW_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ACCOUNT_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
          <NumericInput label="¿Cuánto había en esta cuenta?" value={balance} min={0} onChange={setBalance} />
          <Input label="¿Desde qué día?" type="date" value={ymd} max={todayYmd()} onChange={(e) => setYmd(e.target.value)} />
        </div>
        <p className="text-xs text-ink-muted">
          {isDrawer
            ? "El cajón sigue a la caja: este saldo solo se usa hasta que abras o cierres la caja."
            : ymd === todayYmd()
              ? "Poné lo que hay hoy. WalQo suma y resta lo que entre y salga desde ahora."
              : "Poné lo que había al empezar ese día. WalQo suma y resta lo que entró y salió desde entonces."}
        </p>
      </form>
    </Modal>
  );
}
