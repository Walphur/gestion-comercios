import { useEffect, useRef, useState } from "react";
import { Check, Smartphone } from "lucide-react";
import { Button, Input, Modal, Select } from "../ui";
import UnitDetailFields, { EMPTY_UNIT_DETAILS, parseBattery, type UnitDetailDraft } from "./UnitDetailFields";
import PhoneTrialNotice, { usePhoneUnitQuota } from "./PhoneTrialNotice";
import { addUnit } from "../../db/phoneUnits";
import { checkUnitCode, normalizeUnitCode, unitCodeWarning } from "../../lib/imei";
import type { Product, Supplier } from "../../types";

export default function AddUnitsModal({
  open,
  products,
  suppliers,
  initialProductId,
  userId,
  onAdded,
  onClose,
}: {
  open: boolean;
  products: Product[];
  suppliers: Supplier[];
  initialProductId?: number | null;
  userId: number | null;
  onAdded: () => void;
  onClose: () => void;
}) {
  const [productId, setProductId] = useState<string>("");
  const [kind, setKind] = useState<"imei" | "serial">("imei");
  const [details, setDetails] = useState<UnitDetailDraft>(EMPTY_UNIT_DETAILS);
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [code, setCode] = useState("");
  const [pendingWarning, setPendingWarning] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const { quota } = usePhoneUnitQuota(`${open}-${added.length}`);
  const trialFull = Boolean(quota?.limited && quota.left <= 0);

  useEffect(() => {
    if (!open) return;
    setProductId(initialProductId ? String(initialProductId) : "");
    setKind("imei");
    setDetails(EMPTY_UNIT_DETAILS);
    setCost("");
    setPrice("");
    setSupplierId("");
    setCode("");
    setPendingWarning(null);
    setAdded([]);
    setError("");
  }, [open, initialProductId]);

  const product = products.find((p) => String(p.id) === productId) ?? null;
  const usdProduct = Boolean(product?.price_usd && product.price_usd > 0);

  async function submit(force = false) {
    setError("");
    if (trialFull) return;
    if (!product) return setError("Elegí el modelo.");
    const normalized = normalizeUnitCode(code);
    const check = checkUnitCode(normalized, kind);
    if (check === "empty") return setError("Escaneá o escribí el IMEI.");
    const warning = unitCodeWarning(check);
    if (warning && !force) {
      setPendingWarning(warning);
      return;
    }
    setBusy(true);
    try {
      await addUnit(
        {
          product_id: product.id,
          identifier: normalized,
          identifier_kind: kind,
          condition: details.condition,
          color: details.color,
          capacity: details.capacity,
          battery_pct: details.condition === "nuevo" ? null : parseBattery(details.battery),
          cost: Number(cost.replace(",", ".")) || 0,
          price: Number(price.replace(",", ".")) || null,
          supplier_id: supplierId ? Number(supplierId) : null,
        },
        userId,
      );
      setAdded((a) => [normalized, ...a]);
      setCode("");
      setPendingWarning(null);
      onAdded();
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Cargar equipos"
      subtitle="Elegí el modelo y escaneá un IMEI por equipo. Cada uno suma 1 al stock."
      icon={<Smartphone size={18} />}
      onClose={onClose}
      size="form"
      footer={
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm text-ink-muted">
            {added.length > 0 ? `${added.length} cargado${added.length === 1 ? "" : "s"}` : ""}
          </p>
          <Button onClick={onClose}>Listo</Button>
        </div>
      }
    >
      <div className="min-w-0 space-y-4">
        <PhoneTrialNotice quota={quota} />
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Select label="Modelo" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Elegí…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select label="Proveedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Sin proveedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        {products.length === 0 ? (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            Todavía no hay modelos por IMEI. En Productos, editá el celular y marcá «Se vende por IMEI o número de
            serie».
          </p>
        ) : null}
        <UnitDetailFields value={details} onChange={setDetails} />
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <Input
            label="Costo de cada equipo ($)"
            type="number"
            min={0}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0"
          />
          <Input
            label={usdProduct ? "Precio propio (US$, opcional)" : "Precio propio ($, opcional)"}
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="El del modelo"
          />
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3 dark:border-brand-800 dark:bg-brand-950/30">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-2">
            <Input
              ref={codeRef}
              label={kind === "imei" ? "IMEI" : "Número de serie"}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setPendingWarning(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit(false);
                }
              }}
              placeholder="Escaneá y Enter"
              className="font-mono"
              autoFocus
            />
            <Select value={kind} onChange={(e) => setKind(e.target.value as "imei" | "serial")} aria-label="Tipo de código">
              <option value="imei">IMEI</option>
              <option value="serial">Serie</option>
            </Select>
            <Button onClick={() => submit(false)} loading={busy} disabled={trialFull} className="h-[46px]">
              Agregar
            </Button>
          </div>
          {pendingWarning ? (
            <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <span className="min-w-0">{pendingWarning}</span>
              <Button size="sm" variant="secondary" onClick={() => submit(true)}>
                Cargar igual
              </Button>
            </div>
          ) : null}
          {error ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {added.length > 0 ? (
          <ul className="max-h-40 min-w-0 space-y-1 overflow-y-auto">
            {added.map((c) => (
              <li key={c} className="flex min-w-0 items-center gap-2 text-sm text-ink">
                <Check size={14} className="shrink-0 text-emerald-600" />
                <span className="min-w-0 truncate font-mono">{c}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Modal>
  );
}
