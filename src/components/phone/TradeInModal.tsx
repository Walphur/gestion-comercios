import { useEffect, useMemo, useState } from "react";
import { Repeat } from "lucide-react";
import { Button, Input, Modal, Select } from "../ui";
import UnitDetailFields, { EMPTY_UNIT_DETAILS, parseBattery, type UnitDetailDraft } from "./UnitDetailFields";
import PhoneTrialNotice, { usePhoneUnitQuota } from "./PhoneTrialNotice";
import {
  assertCanAddPhoneUnit,
  findSellableUnit,
  listSerializedProducts,
  saveProductPhoneFields,
  type TradeInInput,
} from "../../db/phoneUnits";
import { createProduct } from "../../db/products";
import { checkUnitCode, normalizeUnitCode, unitCodeWarning } from "../../lib/imei";
import type { Product } from "../../types";

export interface TradeInDraft extends TradeInInput {
  productName: string;
}

const NEW_MODEL = "__new__";

export default function TradeInModal({
  open,
  maxValue,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** Lo máximo que puede valer (lo que se vende). */
  maxValue: number;
  onConfirm: (draft: TradeInDraft) => void;
  onClose: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"imei" | "serial">("imei");
  const [details, setDetails] = useState<UnitDetailDraft>({ ...EMPTY_UNIT_DETAILS, condition: "usado" });
  const [value, setValue] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { quota } = usePhoneUnitQuota(open);
  const trialFull = Boolean(quota?.limited && quota.left <= 0);

  useEffect(() => {
    if (!open) return;
    setProductId("");
    setNewName("");
    setCode("");
    setKind("imei");
    setDetails({ ...EMPTY_UNIT_DETAILS, condition: "usado" });
    setValue("");
    setOverride(false);
    setError("");
    void listSerializedProducts()
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [open]);

  const normalized = normalizeUnitCode(code);
  const check = checkUnitCode(normalized, kind);
  const warning = unitCodeWarning(check);
  const amount = Number(value.replace(",", "."));
  const usedProducts = useMemo(
    () => [...products].sort((a, b) => Number(/usad/i.test(b.name)) - Number(/usad/i.test(a.name))),
    [products],
  );

  async function confirm() {
    setError("");
    if (!productId) return setError("Elegí el modelo o escribí uno nuevo.");
    if (productId === NEW_MODEL && !newName.trim()) return setError("Escribí el nombre del modelo.");
    if (check === "empty") return setError("Falta el IMEI o número de serie.");
    if (warning && !override) return setError(warning);
    if (!(amount > 0)) return setError("Cargá cuánto le tomás el equipo.");
    if (amount > maxValue + 0.001) return setError("La toma no puede superar lo que se vende.");
    setBusy(true);
    try {
      await assertCanAddPhoneUnit();
      const existing = await findSellableUnit(normalized);
      if (existing) {
        setError(`Ese código ya está en stock (${existing.product.name}).`);
        return;
      }
      let pid = Number(productId);
      let productName = products.find((p) => p.id === pid)?.name ?? "";
      if (productId === NEW_MODEL) {
        productName = newName.trim();
        pid = await createProduct({
          name: productName,
          cost: amount,
          price: 0,
          stock: 0,
          min_stock: 0,
          unit: "unidad",
          tax_rate: 21,
        });
        await saveProductPhoneFields(pid, {
          serialized: true,
          price_usd: null,
          warranty_months_new: null,
          warranty_months_used: null,
        });
      }
      onConfirm({
        productName,
        value: Math.round(amount * 100) / 100,
        unit: {
          product_id: pid,
          identifier: normalized,
          identifier_kind: kind,
          condition: details.condition,
          color: details.color,
          capacity: details.capacity,
          battery_pct: parseBattery(details.battery),
          cost: amount,
          notes: "Tomado como parte de pago",
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Toma de usado"
      subtitle="El equipo que deja el cliente baja lo que paga y entra al stock con ese costo."
      icon={<Repeat size={18} />}
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
            <Button onClick={() => confirm()} loading={busy} disabled={trialFull}>
              Tomar como parte de pago
            </Button>
          </div>
        </div>
      }
    >
      <div className="min-w-0 space-y-4">
        <PhoneTrialNotice quota={quota} />
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Select label="Modelo" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Elegí…</option>
            {usedProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={NEW_MODEL}>+ Otro modelo (lo creo)</option>
          </Select>
          {productId === NEW_MODEL ? (
            <Input
              label="Nombre del modelo"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej. iPhone 11 64 GB usado"
              autoFocus
            />
          ) : (
            <Input
              label="Valor de toma ($)"
              type="number"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
            />
          )}
        </div>
        {productId === NEW_MODEL ? (
          <Input
            label="Valor de toma ($)"
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
          />
        ) : null}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <Input
            label={kind === "imei" ? "IMEI" : "Número de serie"}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setOverride(false);
            }}
            placeholder={kind === "imei" ? "15 números (*#06#)" : "Serie"}
            className="font-mono"
          />
          <Select value={kind} onChange={(e) => setKind(e.target.value as "imei" | "serial")} aria-label="Tipo de código">
            <option value="imei">IMEI</option>
            <option value="serial">Serie</option>
          </Select>
        </div>
        {warning && check !== "empty" ? (
          <label className="flex min-w-0 items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5" />
            <span className="min-w-0">{warning} Marcá si está bien igual.</span>
          </label>
        ) : null}
        <UnitDetailFields value={details} onChange={setDetails} conditions={["usado", "reacondicionado"]} />
      </div>
    </Modal>
  );
}
