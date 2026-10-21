import { useEffect, useState } from "react";
import { BookmarkCheck } from "lucide-react";
import { Button, Input, Modal } from "../ui";
import CustomerPicker from "../CustomerPicker";
import { reserveUnit, type ProductUnit } from "../../db/phoneUnits";

export default function ReserveUnitModal({
  unit,
  userId,
  onDone,
  onClose,
}: {
  unit: ProductUnit | null;
  userId: number | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const [customerId, setCustomerId] = useState<number | "">("");
  const [deposit, setDeposit] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCustomerId("");
    setDeposit("");
    setError("");
  }, [unit?.id]);

  async function confirm() {
    if (!unit) return;
    if (customerId === "") return setError("Elegí para quién es la reserva.");
    setBusy(true);
    try {
      await reserveUnit(unit.id, customerId, Number(deposit.replace(",", ".")) || 0, userId);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={unit !== null}
      title="Reservar equipo"
      subtitle={unit ? `${unit.product_name ?? ""} · ${unit.identifier}` : undefined}
      icon={<BookmarkCheck size={18} />}
      onClose={onClose}
      footer={
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-sm text-red-600" role="alert">
            {error}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => void confirm()} loading={busy}>
              Reservar
            </Button>
          </div>
        </div>
      }
    >
      <div className="min-w-0 space-y-4">
        <CustomerPicker
          value={customerId}
          onChange={setCustomerId}
          label="Cliente"
          placeholder="Buscar cliente..."
          createLabel="Nuevo"
          inlineCreate
          panelMode="inline"
        />
        <Input
          label="Seña ($)"
          type="number"
          min={0}
          value={deposit}
          onChange={(e) => setDeposit(e.target.value)}
          placeholder="0"
          hint="Queda anotada en el equipo. La plata de la seña se registra aparte en la caja; al vender, descontala en «A cobrar»."
        />
      </div>
    </Modal>
  );
}
