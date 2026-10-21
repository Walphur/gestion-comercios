import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Pencil, Plus, Search, ShieldCheck, Smartphone } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Modal, PageContent, PageHeader, Select } from "../components/ui";
import AddUnitsModal from "../components/phone/AddUnitsModal";
import ReserveUnitModal from "../components/phone/ReserveUnitModal";
import UsdRateCard from "../components/phone/UsdRateCard";
import PhoneTrialNotice, { usePhoneUnitQuota } from "../components/phone/PhoneTrialNotice";
import UnitDetailFields, { parseBattery, type UnitDetailDraft } from "../components/phone/UnitDetailFields";
import { unitSummary } from "../components/phone/UnitPickerModal";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import {
  findUnitsByIdentifier,
  listSerializedProducts,
  listSerializedStockGaps,
  listUnitEvents,
  listUnits,
  markUnitReturned,
  matchStockToUnits,
  releaseReservation,
  removeUnit,
  returnUnitToStock,
  updateUnitDetails,
  type ProductUnit,
  type ProductUnitEvent,
  type SerializedStockGap,
  type UnitStatus,
} from "../db/phoneUnits";
import { listSuppliers } from "../db/suppliers";
import { checkUnitCode, daysUntilYmd, normalizeUnitCode, UNIT_STATUS_LABELS, unitCodeWarning } from "../lib/imei";
import { formatDateShort, formatMoney, todayYmd } from "../lib/format";
import { confirmAction } from "../lib/confirm";
import { showUserError, showUserSuccess } from "../lib/notice";
import type { Product, Supplier } from "../types";

const STATUS_VARIANT: Record<UnitStatus, "success" | "warning" | "danger" | "neutral"> = {
  in_stock: "success",
  reserved: "warning",
  sold: "neutral",
  returned: "danger",
  cancelled: "neutral",
};

const STATUS_FILTERS: { id: UnitStatus | ""; label: string }[] = [
  { id: "in_stock", label: "En stock" },
  { id: "reserved", label: "Reservadas" },
  { id: "sold", label: "Vendidas" },
  { id: "returned", label: "Devueltas" },
  { id: "", label: "Todas" },
];

function eventText(e: ProductUnitEvent, currency: string): string {
  const who = e.customer_name ? ` ${e.customer_name}` : "";
  switch (e.kind) {
    case "entered":
      return "Entró al stock";
    case "trade_in":
      return `Entró como parte de pago${who ? ` de${who}` : ""}`;
    case "reserved":
      return `Reservada${who ? ` para${who}` : ""}${e.amount ? ` · seña ${formatMoney(e.amount, currency)}` : ""}`;
    case "reservation_released":
      return "Se liberó la reserva";
    case "sold":
      return `Vendida${who ? ` a${who}` : ""}`;
    case "sale_voided":
      return "Se anuló la venta: volvió al stock";
    case "sale_item_removed":
      return "Se quitó de la venta: volvió al stock";
    case "returned":
      return `Devuelta por el cliente${e.detail ? `: ${e.detail}` : ""}`;
    case "restocked":
      return "Volvió a estar a la venta";
    case "trade_in_voided":
      return "Se anuló la venta en la que entró: salió del stock";
    default:
      return e.kind;
  }
}

function WarrantyLine({ unit }: { unit: ProductUnit }) {
  if (unit.status !== "sold" && unit.status !== "returned") return null;
  if (!unit.warranty_until) {
    return <p className="text-sm text-ink-muted">Sin garantía</p>;
  }
  const left = daysUntilYmd(unit.warranty_until, todayYmd());
  const ok = left >= 0;
  return (
    <p
      className={`flex min-w-0 items-center gap-1.5 text-sm font-semibold ${
        ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600"
      }`}
    >
      <ShieldCheck size={15} className="shrink-0" />
      <span className="min-w-0">
        {ok
          ? `Garantía vigente hasta ${formatDateShort(unit.warranty_until)} (${left} día${left === 1 ? "" : "s"})`
          : `Garantía vencida el ${formatDateShort(unit.warranty_until)}`}
      </span>
    </p>
  );
}

function EditUnitModal({
  unit,
  onClose,
  onSaved,
}: {
  unit: ProductUnit | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"imei" | "serial">("imei");
  const [details, setDetails] = useState<UnitDetailDraft>({ condition: "nuevo", color: "", capacity: "", battery: "" });
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!unit) return;
    setCode(unit.identifier);
    setKind(unit.identifier_kind);
    setDetails({
      condition: unit.condition,
      color: unit.color ?? "",
      capacity: unit.capacity ?? "",
      battery: unit.battery_pct != null ? String(unit.battery_pct) : "",
    });
    setCost(String(unit.cost || ""));
    setPrice(unit.price != null ? String(unit.price) : "");
    setNotes(unit.notes ?? "");
    setError("");
  }, [unit]);

  async function save() {
    if (!unit) return;
    const normalized = normalizeUnitCode(code);
    const check = checkUnitCode(normalized, kind);
    if (check === "empty") return setError("Falta el IMEI o número de serie.");
    const warning = unitCodeWarning(check);
    if (warning && normalized !== unit.identifier) {
      const ok = await confirmAction({ title: "Revisá el código", message: warning, confirmLabel: "Guardar igual" });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await updateUnitDetails(unit.id, {
        identifier: normalized,
        identifier_kind: kind,
        condition: details.condition,
        color: details.color,
        capacity: details.capacity,
        battery_pct: details.condition === "nuevo" ? null : parseBattery(details.battery),
        cost: Number(cost.replace(",", ".")) || 0,
        price: Number(price.replace(",", ".")) || null,
        supplier_id: unit.supplier_id,
        notes,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={unit !== null}
      title="Editar equipo"
      subtitle={unit?.product_name ?? undefined}
      icon={<Pencil size={18} />}
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
            <Button onClick={() => void save()} loading={busy}>
              Guardar
            </Button>
          </div>
        </div>
      }
    >
      <div className="min-w-0 space-y-4">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <Input label="IMEI o serie" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" />
          <Select value={kind} onChange={(e) => setKind(e.target.value as "imei" | "serial")} aria-label="Tipo de código">
            <option value="imei">IMEI</option>
            <option value="serial">Serie</option>
          </Select>
        </div>
        <UnitDetailFields value={details} onChange={setDetails} />
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <Input label="Costo ($)" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
          <Input
            label="Precio propio (opcional)"
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="El del modelo"
          />
        </div>
        <Input label="Nota" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </div>
    </Modal>
  );
}

export default function PhoneStore() {
  const { currency } = useAppConfig();
  const { user, can } = useAuth();
  const canManage = can("manage_products");
  const canSeeCost = can("view_profits");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const [found, setFound] = useState<ProductUnit[]>([]);
  const [events, setEvents] = useState<ProductUnitEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState<UnitStatus | "">("in_stock");
  const [listSearch, setListSearch] = useState("");
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [gaps, setGaps] = useState<SerializedStockGap[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [reserveUnit, setReserveUnit] = useState<ProductUnit | null>(null);
  const [editUnit, setEditUnit] = useState<ProductUnit | null>(null);
  const { quota } = usePhoneUnitQuota(units);

  const reloadList = useCallback(async () => {
    const [rows, g] = await Promise.all([
      listUnits({ status: statusFilter, search: listSearch }),
      listSerializedStockGaps(),
    ]);
    setUnits(rows);
    setGaps(g);
  }, [statusFilter, listSearch]);

  const runSearch = useCallback(async (raw: string) => {
    const code = normalizeUnitCode(raw);
    if (!code) {
      setSearched(null);
      setFound([]);
      setEvents([]);
      return;
    }
    const rows = await findUnitsByIdentifier(code);
    setSearched(code);
    setFound(rows);
    setEvents(await listUnitEvents(rows.map((r) => r.id)));
  }, []);

  const refreshAll = useCallback(async () => {
    await reloadList();
    if (searched) await runSearch(searched);
  }, [reloadList, runSearch, searched]);

  useEffect(() => {
    const t = setTimeout(() => void reloadList().catch(console.error), 200);
    return () => clearTimeout(t);
  }, [reloadList]);

  useEffect(() => {
    void Promise.all([listSerializedProducts(), listSuppliers()])
      .then(([p, s]) => {
        setProducts(p);
        setSuppliers(s);
      })
      .catch(console.error);
  }, [addOpen]);

  async function act(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      showUserSuccess(ok);
      await refreshAll();
    } catch (e) {
      showUserError(e);
    }
  }

  async function onReturned(u: ProductUnit) {
    const ok = await confirmAction({
      title: "Devuelta / garantía",
      message: `¿El cliente trajo ${u.identifier}? Queda fuera del stock como devuelta.`,
      confirmLabel: "Sí, marcar devuelta",
    });
    if (!ok) return;
    await act(() => markUnitReturned(u.id, "", user?.id ?? null), "Equipo marcado como devuelto.");
  }

  async function onRemove(u: ProductUnit) {
    const ok = await confirmAction({
      title: "Quitar equipo",
      message: `¿Quitar ${u.identifier}? Se usa para un IMEI cargado por error. Baja 1 el stock.`,
      variant: "danger",
      confirmLabel: "Sí, quitar",
    });
    if (!ok) return;
    await act(() => removeUnit(u.id, user?.id ?? null), "Equipo quitado.");
  }

  function unitActions(u: ProductUnit) {
    return (
      <div className="flex min-w-0 flex-wrap gap-2">
        {u.status === "in_stock" ? (
          <Button size="sm" variant="secondary" onClick={() => setReserveUnit(u)}>
            Reservar
          </Button>
        ) : null}
        {u.status === "reserved" ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void act(() => releaseReservation(u.id, user?.id ?? null), "Reserva liberada.")}
          >
            Liberar reserva
          </Button>
        ) : null}
        {canManage && u.status === "sold" ? (
          <Button size="sm" variant="secondary" onClick={() => void onReturned(u)}>
            Devuelta / garantía
          </Button>
        ) : null}
        {canManage && u.status === "returned" ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void act(() => returnUnitToStock(u.id, user?.id ?? null), "El equipo volvió a la venta.")}
          >
            Volver a la venta
          </Button>
        ) : null}
        {canManage && u.status !== "cancelled" ? (
          <Button size="sm" variant="ghost" onClick={() => setEditUnit(u)}>
            Editar
          </Button>
        ) : null}
        {canManage && u.status === "in_stock" && u.source !== "trade_in" ? (
          <Button size="sm" variant="ghost" onClick={() => void onRemove(u)}>
            Quitar
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-x-hidden">
      <PageHeader
        title="Celulares"
        subtitle="Buscá un IMEI, cargá equipos y mirá la garantía de cada uno."
        actions={
          canManage ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} /> Cargar equipos
            </Button>
          ) : undefined
        }
      />
      <PageContent>
        {canManage ? <PhoneTrialNotice quota={quota} className="mb-4" /> : null}
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card variant="elevated" className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Search size={16} className="text-brand-600 dark:text-brand-300" />
              Buscar IMEI
            </p>
            <form
              className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch(query).catch(showUserError);
              }}
            >
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="IMEI, serie o los últimos 6 números"
                className="font-mono"
              />
              <Button type="submit" className="h-[46px]">
                Buscar
              </Button>
            </form>

            {searched !== null && found.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">No hay ningún equipo con «{searched}».</p>
            ) : null}

            <div className="mt-4 min-w-0 space-y-3">
              {found.map((u) => {
                const unitEvents = events.filter((e) => e.unit_id === u.id);
                return (
                  <div
                    key={u.id}
                    className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-4"
                  >
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-ink">{u.product_name ?? "Producto"}</p>
                        <p className="truncate font-mono text-sm text-ink">
                          {u.identifier_kind === "imei" ? "IMEI" : "Serie"} {u.identifier}
                        </p>
                        <p className="truncate text-xs text-ink-muted">{unitSummary(u)}</p>
                      </div>
                      <Badge variant={STATUS_VARIANT[u.status]}>{UNIT_STATUS_LABELS[u.status] ?? u.status}</Badge>
                    </div>
                    <div className="mt-3 grid min-w-0 gap-1.5 text-sm text-ink">
                      <p className="min-w-0 break-words">
                        <span className="text-ink-muted">Entró: </span>
                        {formatDateShort(u.created_at)} ·{" "}
                        {u.source === "trade_in"
                          ? `parte de pago${u.source_customer_name ? ` de ${u.source_customer_name}` : ""}${
                              u.source_sale_doc ? ` (venta ${u.source_sale_doc})` : ""
                            }`
                          : `compra${u.supplier_name ? ` a ${u.supplier_name}` : ""}`}
                        {canSeeCost && u.cost > 0 ? ` · costo ${formatMoney(u.cost, currency)}` : ""}
                      </p>
                      {u.status === "reserved" ? (
                        <p className="min-w-0 break-words">
                          <span className="text-ink-muted">Reservada: </span>
                          {u.reserved_customer_name ?? "cliente"}
                          {u.reserved_deposit ? ` · seña ${formatMoney(u.reserved_deposit, currency)}` : ""}
                          {u.reserved_at ? ` · ${formatDateShort(u.reserved_at)}` : ""}
                        </p>
                      ) : null}
                      {u.sold_at ? (
                        <p className="min-w-0 break-words">
                          <span className="text-ink-muted">Vendida: </span>
                          {formatDateShort(u.sold_at)} · {u.sold_customer_name ?? "consumidor final"}
                          {u.sale_doc ? ` · venta ${u.sale_doc}` : ""}
                        </p>
                      ) : null}
                      <WarrantyLine unit={u} />
                    </div>
                    {unitEvents.length > 0 ? (
                      <ol className="mt-3 min-w-0 space-y-1 border-l-2 border-brand-200 pl-3 dark:border-brand-800">
                        {unitEvents.map((e) => (
                          <li key={e.id} className="min-w-0 text-xs text-ink-muted">
                            <span className="tabular-nums">{formatDateShort(e.created_at)}</span> ·{" "}
                            <span className="text-ink">{eventText(e, currency)}</span>
                            {e.user_name ? ` · ${e.user_name}` : ""}
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    <div className="mt-3">{unitActions(u)}</div>
                  </div>
                );
              })}
            </div>
          </Card>
          <UsdRateCard currency={currency} canEdit={canManage} />
        </div>

        {canManage && gaps.length > 0 ? (
          <Card className="mt-4 min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
              <AlertTriangle size={16} />
              El stock no coincide con los equipos cargados
            </p>
            <ul className="mt-2 min-w-0 space-y-2">
              {gaps.map((g) => (
                <li key={g.product_id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <span className="min-w-0 truncate text-sm text-ink">
                    {g.name}: stock {g.stock}, equipos {g.units}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void act(() => matchStockToUnits(g.product_id, user?.id ?? null), "Stock igualado a los equipos.")
                    }
                  >
                    Dejar stock en {g.units}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card className="mt-4 min-w-0">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id || "all"}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    statusFilter === f.id
                      ? "bg-brand-600 text-white"
                      : "bg-[var(--color-input-bg)] text-ink ring-1 ring-[var(--color-panel-border)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="w-full min-w-0 sm:w-64">
              <Input
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Modelo o IMEI"
                startAdornment={<Search size={16} />}
              />
            </div>
          </div>
          {units.length === 0 ? (
            <EmptyState
              compact
              icon={Smartphone}
              title="No hay equipos acá"
              description={canManage ? "Usá «Cargar equipos» para sumar IMEI." : undefined}
            />
          ) : (
            <ul className="mt-3 min-w-0 divide-y divide-[var(--color-panel-border)]">
              {units.map((u) => (
                <li
                  key={u.id}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
                >
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() => {
                      setQuery(u.identifier);
                      void runSearch(u.identifier);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <span className="block truncate text-sm font-medium text-ink">{u.product_name}</span>
                    <span className="block truncate font-mono text-xs text-ink-muted">
                      {u.identifier} · {unitSummary(u)}
                    </span>
                  </button>
                  <span className="hidden min-w-0 truncate text-xs text-ink-muted md:block">
                    {u.status === "reserved"
                      ? `Para ${u.reserved_customer_name ?? "cliente"}`
                      : u.status === "sold"
                        ? `${formatDateShort(u.sold_at ?? u.updated_at)} · ${u.sold_customer_name ?? "consumidor final"}`
                        : formatDateShort(u.created_at)}
                  </span>
                  <Badge variant={STATUS_VARIANT[u.status]}>{UNIT_STATUS_LABELS[u.status] ?? u.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageContent>

      <AddUnitsModal
        open={addOpen}
        products={products}
        suppliers={suppliers}
        userId={user?.id ?? null}
        onAdded={() => void reloadList()}
        onClose={() => setAddOpen(false)}
      />
      <ReserveUnitModal
        unit={reserveUnit}
        userId={user?.id ?? null}
        onClose={() => setReserveUnit(null)}
        onDone={() => {
          setReserveUnit(null);
          showUserSuccess("Equipo reservado.");
          void refreshAll();
        }}
      />
      <EditUnitModal
        unit={editUnit}
        onClose={() => setEditUnit(null)}
        onSaved={() => {
          setEditUnit(null);
          showUserSuccess("Equipo guardado.");
          void refreshAll();
        }}
      />
    </div>
  );
}
