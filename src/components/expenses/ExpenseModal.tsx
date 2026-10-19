import { useEffect, useState } from "react";
import { ReceiptText } from "lucide-react";
import { Button, FormActions, Input, Modal, NumericInput } from "../ui";
import { EXPENSE_CATEGORIES, expenseCategory } from "../../config/expenseCategories";
import {
  createExpense,
  EXPENSE_METHOD_LABELS,
  EXPENSE_METHODS,
  type ExpenseMethod,
  type RecurringExpense,
} from "../../db/expenses";
import { hasOpenCashSession } from "../../db/supplierAccounts";
import { todayYmd } from "../../lib/format";
import { showUserError, showUserSuccess } from "../../lib/notice";

export default function ExpenseModal({
  open,
  fromRecurring,
  userId,
  onClose,
  onSaved,
}: {
  open: boolean;
  fromRecurring?: RecurringExpense | null;
  userId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [paidAt, setPaidAt] = useState(todayYmd());
  const [method, setMethod] = useState<ExpenseMethod>("transferencia");
  const [cashOpen, setCashOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory(fromRecurring?.category ?? "");
    setDescription(fromRecurring?.description ?? "");
    setAmount(fromRecurring?.amount ?? 0);
    setPaidAt(todayYmd());
    void hasOpenCashSession()
      .then((isOpen) => {
        setCashOpen(isOpen);
        setMethod(isOpen ? "efectivo_caja" : "transferencia");
      })
      .catch(() => {
        setCashOpen(false);
        setMethod("transferencia");
      });
  }, [open, fromRecurring]);

  const canSave = !(method === "efectivo_caja" && !cashOpen);

  async function save() {
    if (!canSave || busy) return;
    if (!category) {
      showUserError("Elegí de qué es el gasto.", "Falta el tipo de gasto");
      return;
    }
    if (!(amount > 0)) {
      showUserError("Poné cuánto fue el gasto.", "Falta el monto");
      return;
    }
    setBusy(true);
    try {
      await createExpense({
        category,
        description,
        amount,
        method,
        paidAt,
        recurringId: fromRecurring?.id ?? null,
        userId,
      });
      showUserSuccess(
        method === "efectivo_caja" ? "Gasto anotado. También salió como egreso de la caja." : "Gasto anotado.",
      );
      onSaved();
      onClose();
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  const example = category ? expenseCategory(category).example : "Ej. Factura de luz de octubre";

  return (
    <Modal
      open={open}
      wide
      title={fromRecurring ? "Cargar gasto fijo" : "Nuevo gasto"}
      subtitle="Las compras de mercadería se cargan en Proveedores"
      icon={<ReceiptText size={18} />}
      onClose={onClose}
      footer={
        <FormActions>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={busy} disabled={!canSave}>
            Guardar gasto
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
        <div className="min-w-0">
          <p className="field-label">¿De qué es?</p>
          <div className="expense-cats" role="radiogroup" aria-label="Tipo de gasto">
            {EXPENSE_CATEGORIES.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={category === c.id}
                  className={`expense-cats__item${category === c.id ? " is-on" : ""}`}
                  onClick={() => setCategory(c.id)}
                  title={c.label}
                >
                  <Icon size={16} aria-hidden />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <NumericInput label="¿Cuánto fue?" value={amount} min={0} onChange={setAmount} />
          <Input label="Fecha" type="date" value={paidAt} max={todayYmd()} onChange={(e) => setPaidAt(e.target.value)} />
          <div className="sm:col-span-2">
            <Input
              label="Detalle (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={example}
            />
          </div>
        </div>

        <div className="min-w-0">
          <p className="field-label">¿Cómo lo pagaste?</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Medio de pago">
            {EXPENSE_METHODS.map((m) => {
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
                  {EXPENSE_METHOD_LABELS[m]}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            {method === "efectivo_caja"
              ? "Sale como egreso de la caja abierta, así el arqueo cierra."
              : !cashOpen
                ? "Para pagar con efectivo del cajón, primero abrí la caja."
                : "No toca la caja: queda anotado solo en Gastos."}
          </p>
        </div>
      </form>
    </Modal>
  );
}
