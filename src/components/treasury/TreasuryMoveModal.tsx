import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, HandCoins, PiggyBank, Scale } from "lucide-react";
import { Button, FormActions, Input, Modal, NumericInput, Select } from "../ui";
import { useAppConfig } from "../../context/AppConfig";
import { createTreasuryMovement, type AccountBalance, type TreasuryMovementType } from "../../db/treasury";
import { roundMoney } from "../../db/supplierAccounts";
import { formatMoney } from "../../lib/format";
import { showUserError, showUserSuccess } from "../../lib/notice";

const COPY: Record<
  TreasuryMovementType,
  { title: string; subtitle: string; save: string; icon: typeof Scale; placeholder: string }
> = {
  traslado: {
    title: "Mover plata",
    subtitle: "Pasar plata de una cuenta a otra (no es ganancia ni gasto)",
    save: "Anotar traslado",
    icon: ArrowLeftRight,
    placeholder: "Ej. Llevé la recaudación a la caja fuerte",
  },
  retiro: {
    title: "Retiro del dueño",
    subtitle: "Plata que te llevás para vos. No es un gasto del negocio",
    save: "Anotar retiro",
    icon: HandCoins,
    placeholder: "Ej. Retiro de la semana",
  },
  aporte: {
    title: "Aporte del dueño",
    subtitle: "Plata tuya que ponés en el negocio",
    save: "Anotar aporte",
    icon: PiggyBank,
    placeholder: "Ej. Puse cambio para la caja",
  },
  ajuste: {
    title: "Ajustar saldo",
    subtitle: "Cuando la cuenta real dice otro número (comisiones, intereses, algo que no se anotó)",
    save: "Guardar ajuste",
    icon: Scale,
    placeholder: "Ej. Comisiones de Mercado Pago del mes",
  },
};

export default function TreasuryMoveModal({
  open,
  type,
  balances,
  cashOpen,
  userId,
  onClose,
  onSaved,
}: {
  open: boolean;
  type: TreasuryMovementType;
  balances: AccountBalance[];
  cashOpen: boolean;
  userId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currency } = useAppConfig();
  const [fromId, setFromId] = useState<number | "">("");
  const [toId, setToId] = useState<number | "">("");
  const [amount, setAmount] = useState(0);
  const [realBalance, setRealBalance] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const usable = useMemo(
    () => balances.filter((b) => (type === "ajuste" ? b.account.kind !== "cajon" : true)),
    [balances, type],
  );
  const drawer = balances.find((b) => b.account.kind === "cajon");

  useEffect(() => {
    if (!open) return;
    const firstOther = balances.find((b) => b.account.kind !== "cajon")?.account.id ?? "";
    const drawerId = cashOpen && drawer ? drawer.account.id : "";
    setAmount(0);
    setNote("");
    if (type === "traslado") {
      setFromId(drawerId || firstOther);
      const guardado = balances.find((b) => b.account.kind === "guardado")?.account.id;
      setToId(drawerId ? (guardado ?? firstOther) : "");
    } else if (type === "retiro") {
      setFromId(drawerId || firstOther);
      setToId("");
    } else if (type === "aporte") {
      setFromId("");
      setToId(drawerId || firstOther);
    } else {
      setFromId("");
      setToId(firstOther);
      const b = balances.find((x) => x.account.id === firstOther);
      setRealBalance(b?.balance ?? 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type]);

  const isDrawer = (id: number | "") => id !== "" && drawer?.account.id === id;
  const touchesDrawer = isDrawer(fromId) || isDrawer(toId);
  const adjustTarget = type === "ajuste" ? balances.find((b) => b.account.id === toId) : undefined;
  const adjustDiff = adjustTarget ? roundMoney(realBalance - adjustTarget.balance) : 0;
  const blocked = touchesDrawer && !cashOpen;

  function accountOptions(exclude: number | "") {
    return usable
      .filter((b) => b.account.id !== exclude)
      .map((b) => {
        const drawerOff = b.account.kind === "cajon" && !cashOpen;
        return (
          <option key={b.account.id} value={b.account.id} disabled={drawerOff}>
            {b.account.name}
            {drawerOff ? " (abrí la caja)" : ` · ${formatMoney(b.balance, currency)}`}
          </option>
        );
      });
  }

  async function save() {
    if (busy || blocked) return;
    setBusy(true);
    try {
      if (type === "ajuste") {
        if (!adjustTarget) throw new Error("Elegí la cuenta a ajustar.");
        if (adjustDiff === 0) {
          showUserSuccess("Ya coincide: no hace falta ajustar.");
          onClose();
          return;
        }
        await createTreasuryMovement({
          type,
          fromAccountId: adjustDiff < 0 ? adjustTarget.account.id : null,
          toAccountId: adjustDiff > 0 ? adjustTarget.account.id : null,
          amount: Math.abs(adjustDiff),
          note,
          userId,
        });
      } else {
        if (!(amount > 0)) throw new Error("Poné cuánta plata es.");
        await createTreasuryMovement({
          type,
          fromAccountId: type === "aporte" || fromId === "" ? null : fromId,
          toAccountId: type === "retiro" || toId === "" ? null : toId,
          amount,
          note,
          userId,
        });
      }
      showUserSuccess(touchesDrawer ? "Anotado. También quedó en la caja abierta." : "Anotado.");
      onSaved();
      onClose();
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  const copy = COPY[type];
  const Icon = copy.icon;

  return (
    <Modal
      open={open}
      title={copy.title}
      subtitle={copy.subtitle}
      icon={<Icon size={18} />}
      onClose={onClose}
      footer={
        <FormActions>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={busy} disabled={blocked}>
            {copy.save}
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
          {(type === "traslado" || type === "retiro") && (
            <Select
              label="¿De dónde sale?"
              value={fromId}
              onChange={(e) => setFromId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Elegí una cuenta</option>
              {accountOptions(type === "traslado" ? toId : "")}
            </Select>
          )}
          {(type === "traslado" || type === "aporte") && (
            <Select
              label="¿A dónde va?"
              value={toId}
              onChange={(e) => setToId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Elegí una cuenta</option>
              {accountOptions(type === "traslado" ? fromId : "")}
            </Select>
          )}
          {type === "ajuste" && (
            <Select
              label="Cuenta"
              value={toId}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : "";
                setToId(id);
                setRealBalance(balances.find((b) => b.account.id === id)?.balance ?? 0);
              }}
            >
              {accountOptions("")}
            </Select>
          )}
          {type === "ajuste" ? (
            <NumericInput
              label="¿Cuánto hay realmente?"
              value={realBalance}
              onChange={setRealBalance}
              hint={adjustTarget ? `WalQo calcula ${formatMoney(adjustTarget.balance, currency)}` : undefined}
            />
          ) : (
            <NumericInput label="¿Cuánto?" value={amount} min={0} onChange={setAmount} />
          )}
          <div className="sm:col-span-2">
            <Input
              label="Nota (opcional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={copy.placeholder}
            />
          </div>
        </div>
        <p className="text-xs text-ink-muted">
          {type === "ajuste"
            ? adjustDiff === 0
              ? "Si coincide, no hace falta ajustar."
              : `Se anota un ajuste de ${adjustDiff > 0 ? "+" : "−"}${formatMoney(Math.abs(adjustDiff), currency)}. El cajón no se ajusta acá: se corrige contando la plata al cerrar la caja.`
            : blocked
              ? "Para sacar o poner efectivo en el cajón, primero abrí la caja."
              : touchesDrawer
                ? "Como toca el cajón, también queda anotado en la caja abierta, así el arqueo cierra."
                : type === "retiro"
                  ? "Un retiro no baja la ganancia: es plata que te llevás."
                  : "No toca la caja ni la ganancia: solo cambia dónde está la plata."}
        </p>
      </form>
    </Modal>
  );
}
