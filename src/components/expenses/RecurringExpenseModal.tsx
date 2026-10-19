import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button, FormActions, Input, Modal, NumericInput, Select } from "../ui";
import { EXPENSE_CATEGORIES, expenseCategory } from "../../config/expenseCategories";
import { saveRecurringExpense, type RecurringExpense } from "../../db/expenses";
import { showUserError, showUserSuccess } from "../../lib/notice";

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export default function RecurringExpenseModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing?: RecurringExpense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].id);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [day, setDay] = useState(10);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory(editing?.category ?? EXPENSE_CATEGORIES[0].id);
    setDescription(editing?.description ?? "");
    setAmount(editing?.amount ?? 0);
    setDay(editing?.day_of_month ?? 10);
  }, [open, editing]);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await saveRecurringExpense({ id: editing?.id, category, description, amount, dayOfMonth: day });
      showUserSuccess(editing ? "Gasto fijo actualizado." : "Gasto fijo agregado. Te lo vamos a recordar cada mes.");
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
      title={editing ? "Editar gasto fijo" : "Nuevo gasto fijo"}
      subtitle="Algo que pagás todos los meses, como el alquiler o internet"
      icon={<CalendarClock size={18} />}
      onClose={onClose}
      footer={
        <FormActions>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            Guardar
          </Button>
        </FormActions>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Select label="¿De qué es?" value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
        <Input
          label="Detalle (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={expenseCategory(category).example}
        />
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <NumericInput
            label="Monto aproximado"
            hint="Lo podés cambiar al cargarlo cada mes."
            value={amount}
            min={0}
            onChange={setAmount}
          />
          <Select label="Se paga el día" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d} de cada mes
              </option>
            ))}
          </Select>
        </div>
      </form>
    </Modal>
  );
}
