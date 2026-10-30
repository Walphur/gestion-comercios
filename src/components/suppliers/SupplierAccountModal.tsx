import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HandCoins, Handshake, MessageCircle, Pencil, ReceiptText } from "lucide-react";
import { Button, EmptyState, Input, Modal, NumericInput } from "../ui";
import {
  hasOpenCashSession,
  listSupplierMovements,
  recordSupplierPayment,
  recordSupplierPurchase,
  roundMoney,
  SUPPLIER_PAYMENT_LABELS,
  updateSupplier,
  type SupplierMovement,
  type SupplierPaymentMethod,
  type SupplierWithBalance,
} from "../../db/supplierAccounts";
import { formatDateShort, formatMoney } from "../../lib/format";
import { openWhatsApp } from "../../lib/openExternal";
import { showUserError, showUserSuccess } from "../../lib/notice";
import { SupplierBalance } from "./SupplierBalance";

export type SupplierPanel = "none" | "pay" | "charge" | "edit";
type Panel = SupplierPanel;

interface Props {
  supplier: SupplierWithBalance | null;
  initialPanel?: Panel;
  currency: string;
  userId: number | null;
  onClose: () => void;
  onChanged: () => void;
}

const METHODS: SupplierPaymentMethod[] = ["efectivo_caja", "transferencia", "otro"];

export default function SupplierAccountModal({
  supplier,
  initialPanel = "none",
  currency,
  userId,
  onClose,
  onChanged,
}: Props) {
  const [movements, setMovements] = useState<SupplierMovement[]>([]);
  const [panel, setPanel] = useState<Panel>("none");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<SupplierPaymentMethod>("transferencia");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [cashOpen, setCashOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);

  const supplierId = supplier?.id;
  const balance = useMemo(
    () => roundMoney(movements.reduce((a, m) => a + m.amount, 0)),
    [movements],
  );

  const load = useCallback(async () => {
    if (!supplierId) return;
    setMovements(await listSupplierMovements(supplierId));
  }, [supplierId]);

  function openPanel(next: Panel, currentBalance: number) {
    setPanel(next);
    setNote("");
    setAmount(next === "pay" && currentBalance > 0 ? currentBalance : 0);
  }

  useEffect(() => {
    if (!supplier) return;
    setName(supplier.name);
    setPhone(supplier.phone ?? "");
    setNotes(supplier.notes ?? "");
    setMethod("transferencia");
    openPanel(initialPanel, supplier.balance);
    void load().catch(showUserError);
    void hasOpenCashSession().then(setCashOpen).catch(() => setCashOpen(false));
  }, [supplierId]);

  /** Saldo después de cada movimiento, del más nuevo al más viejo. */
  const running = useMemo(() => {
    let acc = balance;
    return movements.map((m) => {
      const after = acc;
      acc = roundMoney(acc - m.amount);
      return after;
    });
  }, [movements, balance]);

  if (!supplier) return null;

  async function submit() {
    if (!supplier || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    try {
      if (panel === "pay") {
        await recordSupplierPayment({ supplierId: supplier.id, amount, method, note, userId });
        showUserSuccess(
          method === "efectivo_caja"
            ? "Pago anotado. Salió como egreso de la caja."
            : "Pago anotado en la cuenta del proveedor.",
        );
      } else if (panel === "charge") {
        await recordSupplierPurchase({ supplierId: supplier.id, amount, note, userId });
        showUserSuccess("Compra anotada. Suma a lo que le debés.");
      } else if (panel === "edit") {
        await updateSupplier(supplier.id, { name, phone, notes });
        showUserSuccess("Datos del proveedor guardados.");
      }
      setPanel("none");
      await load();
      onChanged();
    } catch (e) {
      showUserError(e);
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }

  async function openChat() {
    if (!supplier?.phone) return;
    try {
      await openWhatsApp(supplier.phone, `Hola ${supplier.name}!`);
    } catch (e) {
      showUserError(e);
    }
  }

  const canSubmit =
    panel === "edit" ? name.trim().length > 0 : amount > 0 && !(panel === "pay" && method === "efectivo_caja" && !cashOpen);

  return (
    <Modal
      open
      wide
      title={supplier.name}
      subtitle={supplier.phone ? `WhatsApp ${supplier.phone}` : "Sin WhatsApp cargado"}
      icon={<Handshake size={18} />}
      onClose={onClose}
    >
      <div className="supplier-account">
        <SupplierBalance balance={balance} currency={currency} large />

        <div className="supplier-account__actions">
          <Button onClick={() => openPanel("pay", balance)} variant={panel === "pay" ? "primary" : "secondary"}>
            <HandCoins size={16} /> Registrar pago
          </Button>
          <Button onClick={() => openPanel("charge", balance)} variant={panel === "charge" ? "primary" : "secondary"}>
            <ReceiptText size={16} /> Anotar compra a cuenta
          </Button>
          <Button onClick={() => openPanel("edit", balance)} variant={panel === "edit" ? "primary" : "secondary"}>
            <Pencil size={16} /> Datos
          </Button>
          {supplier.phone && (
            <Button variant="ghost" onClick={() => openChat()}>
              <MessageCircle size={16} /> WhatsApp
            </Button>
          )}
        </div>

        {panel !== "none" && (
          <form
            className="supplier-account__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit && !busy) void submit();
            }}
          >
            {panel === "edit" ? (
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <Input
                  label="WhatsApp"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="11 1234-5678"
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Notas"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej. Pasa los martes · CBU / alias"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <NumericInput
                    label={panel === "pay" ? "¿Cuánto le pagaste?" : "Importe de la compra"}
                    value={amount}
                    min={0}
                    onChange={setAmount}
                  />
                  <Input
                    label={panel === "pay" ? "Nota (opcional)" : "Factura / remito (opcional)"}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={panel === "pay" ? "Ej. Pago parcial" : "Ej. Factura A 0001-4521"}
                  />
                </div>
                {panel === "pay" && (
                  <div className="mt-3 min-w-0">
                    <p className="field-label">Medio de pago</p>
                    <div className="flex flex-wrap gap-2" role="radiogroup">
                      {METHODS.map((m) => {
                        const disabled = m === "efectivo_caja" && !cashOpen;
                        return (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={method === m}
                            disabled={disabled}
                            title={disabled ? "Abrí la caja para pagar con efectivo del cajón" : undefined}
                            className={`supplier-chip${method === m ? " supplier-chip--on" : ""}`}
                            onClick={() => setMethod(m)}
                          >
                            {SUPPLIER_PAYMENT_LABELS[m]}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-xs text-ink-muted">
                      {method === "efectivo_caja"
                        ? "Sale como egreso de la caja abierta, así el arqueo cierra."
                        : !cashOpen
                          ? "Para pagar con efectivo del cajón, primero abrí la caja."
                          : "No toca la caja: queda anotado solo en la cuenta del proveedor."}
                    </p>
                  </div>
                )}
              </>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPanel("none")} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" loading={busy} disabled={!canSubmit || busy}>
                {panel === "pay" ? "Anotar pago" : panel === "charge" ? "Anotar compra" : "Guardar"}
              </Button>
            </div>
          </form>
        )}

        <h3 className="supplier-account__title">Movimientos</h3>
        {movements.length === 0 ? (
          <EmptyState
            compact
            icon={ReceiptText}
            title="Sin movimientos todavía"
            description="Las compras que cargues con este proveedor y los pagos aparecen acá."
          />
        ) : (
          <ul className="supplier-moves">
            {movements.map((m, i) => (
              <li key={m.id} className="supplier-moves__row">
                <div className="min-w-0">
                  <p className="supplier-moves__concept">
                    {m.kind === "purchase" ? "Compra" : `Pago · ${SUPPLIER_PAYMENT_LABELS[m.payment_method ?? "otro"]}`}
                    {m.note ? <span className="text-ink-muted"> · {m.note}</span> : null}
                  </p>
                  <p className="supplier-moves__meta">
                    {formatDateShort(m.created_at)}
                    {m.user_name ? ` · ${m.user_name}` : ""}
                  </p>
                </div>
                <span
                  className={`supplier-moves__amount ${m.amount > 0 ? "is-debt" : "is-paid"}`}
                >
                  {m.amount > 0 ? "+" : "−"}
                  {formatMoney(Math.abs(m.amount), currency)}
                </span>
                <span className="supplier-moves__balance" title="Saldo después de este movimiento">
                  {formatMoney(running[i], currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
