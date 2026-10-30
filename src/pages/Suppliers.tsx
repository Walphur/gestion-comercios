import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, Handshake, PackagePlus, Plus, Search, Wallet } from "lucide-react";
import { Button, EmptyState, FormActions, Input, Modal, PageContent, PageHeader } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { listSuppliersWithBalance, type SupplierWithBalance } from "../db/supplierAccounts";
import { createSupplier } from "../db/suppliers";
import { listReorderSuggestions, type PurchaseOrder, type PurchaseOrderItem } from "../db/purchaseOrders";
import { formatDateShort, formatMoney } from "../lib/format";
import { showUserError, showUserSuccess } from "../lib/notice";
import PurchaseEntryModal, { type PurchaseEntryFromOrder } from "../components/PurchaseEntryModal";
import SupplierAccountModal, { type SupplierPanel } from "../components/suppliers/SupplierAccountModal";
import { SupplierBalance } from "../components/suppliers/SupplierBalance";
import ReorderPanel from "../components/suppliers/ReorderPanel";

type Tab = "cuentas" | "pedidos";

export default function Suppliers() {
  const { businessName, currency } = useAppConfig();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "pedidos" ? "pedidos" : "cuentas";

  const [suppliers, setSuppliers] = useState<SupplierWithBalance[]>([]);
  const [reorderCount, setReorderCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyDebt, setOnlyDebt] = useState(false);

  const [account, setAccount] = useState<{ id: number; panel: SupplierPanel } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [entryOpen, setEntryOpen] = useState(false);
  const [fromOrder, setFromOrder] = useState<PurchaseEntryFromOrder | undefined>();
  const [ordersKey, setOrdersKey] = useState(0);

  const reload = useCallback(async () => {
    const [list, reorder] = await Promise.all([listSuppliersWithBalance(), listReorderSuggestions()]);
    setSuppliers(list);
    setReorderCount(reorder.filter((r) => !r.pending_order_id).length);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload().catch(showUserError);
  }, [reload]);

  const totalDebt = useMemo(
    () => suppliers.reduce((a, s) => a + Math.max(0, s.balance), 0),
    [suppliers],
  );
  const withDebt = suppliers.filter((s) => s.balance > 0).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suppliers.filter(
      (s) =>
        (!onlyDebt || s.balance > 0) &&
        (!q || s.name.toLowerCase().includes(q) || (s.phone ?? "").includes(q)),
    );
  }, [suppliers, query, onlyDebt]);

  const selected = account ? suppliers.find((s) => s.id === account.id) ?? null : null;

  function setTab(next: Tab) {
    setParams(next === "pedidos" ? { tab: "pedidos" } : {}, { replace: true });
  }

  async function saveNew() {
    const name = newName.trim();
    if (!name) {
      showUserError("Escribí el nombre del proveedor.", "Falta el nombre");
      return;
    }
    if (suppliers.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      showUserError(`Ya tenés un proveedor llamado «${name}».`, "Nombre repetido");
      return;
    }
    setSaving(true);
    try {
      await createSupplier(name, newPhone.trim() || undefined, newNotes.trim() || undefined);
      showUserSuccess(`Proveedor «${name}» agregado.`);
      setNewOpen(false);
      setNewName("");
      setNewPhone("");
      setNewNotes("");
      await reload();
    } catch (e) {
      showUserError(e);
    } finally {
      setSaving(false);
    }
  }

  function receiveOrder(order: PurchaseOrder, items: PurchaseOrderItem[]) {
    setFromOrder({
      id: order.id,
      supplierId: order.supplier_id,
      lines: items
        .filter((i) => i.product_id != null)
        .map((i) => ({
          productId: i.product_id as number,
          name: i.name,
          qty: i.qty,
          unitCost: i.unit_cost,
          salePrice: i.price ?? 0,
          barcode: i.barcode,
        })),
    });
    setEntryOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Lo que les debés, lo que les pagaste y lo que hay que pedir"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setNewOpen(true)}>
              <Plus size={16} /> Nuevo proveedor
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setFromOrder(undefined);
                setEntryOpen(true);
              }}
            >
              <PackagePlus size={16} /> Ingreso compra
            </Button>
          </div>
        }
      />
      <PageContent>
        <div className="supplier-summary">
          <div className="supplier-summary__card">
            <Wallet size={18} aria-hidden />
            <div className="min-w-0">
              <p className="supplier-summary__label">Le debés en total</p>
              <p className={`supplier-summary__value tabular-nums${totalDebt > 0 ? " is-debt" : ""}`}>
                {formatMoney(totalDebt, currency)}
              </p>
            </div>
          </div>
          <div className="supplier-summary__card">
            <Handshake size={18} aria-hidden />
            <div className="min-w-0">
              <p className="supplier-summary__label">Proveedores con deuda</p>
              <p className="supplier-summary__value tabular-nums">
                {withDebt} <span className="text-sm font-normal text-ink-muted">de {suppliers.length}</span>
              </p>
            </div>
          </div>
          <button type="button" className="supplier-summary__card supplier-summary__card--link" onClick={() => setTab("pedidos")}>
            <ClipboardList size={18} aria-hidden />
            <div className="min-w-0 text-left">
              <p className="supplier-summary__label">Productos para reponer</p>
              <p className="supplier-summary__value tabular-nums">{reorderCount}</p>
            </div>
          </button>
        </div>

        <div className="supplier-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "cuentas"}
            className={`supplier-tabs__tab${tab === "cuentas" ? " is-on" : ""}`}
            onClick={() => setTab("cuentas")}
          >
            Cuentas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pedidos"}
            className={`supplier-tabs__tab${tab === "pedidos" ? " is-on" : ""}`}
            onClick={() => setTab("pedidos")}
          >
            Pedidos para reponer
            {reorderCount > 0 && <span className="supplier-tabs__count">{reorderCount}</span>}
          </button>
        </div>

        {tab === "pedidos" ? (
          <ReorderPanel
            businessName={businessName}
            currency={currency}
            userId={user?.id ?? null}
            onReceive={receiveOrder}
            refreshKey={ordersKey}
            onChanged={() => void reload().catch(showUserError)}
          />
        ) : !loaded ? null : suppliers.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="Todavía no cargaste proveedores"
            description="Agregá a quién le comprás para anotar compras a cuenta, registrar pagos y mandarle pedidos por WhatsApp."
            action={
              <Button onClick={() => setNewOpen(true)}>
                <Plus size={16} /> Agregar el primero
              </Button>
            }
          />
        ) : (
          <>
            <div className="supplier-toolbar">
              <label className="supplier-toolbar__search">
                <Search size={16} aria-hidden />
                <input
                  type="search"
                  placeholder="Buscar por nombre o teléfono"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`supplier-chip${!onlyDebt ? " supplier-chip--on" : ""}`}
                  onClick={() => setOnlyDebt(false)}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`supplier-chip${onlyDebt ? " supplier-chip--on" : ""}`}
                  onClick={() => setOnlyDebt(true)}
                >
                  Les debo
                </button>
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">
                {onlyDebt ? "No le debés a ningún proveedor." : "Ningún proveedor coincide con la búsqueda."}
              </p>
            ) : (
              <ul className="supplier-list">
                {visible.map((s) => (
                  <li key={s.id} className="supplier-list__row">
                    <button
                      type="button"
                      className="supplier-list__main"
                      onClick={() => setAccount({ id: s.id, panel: "none" })}
                    >
                      <span className="truncate font-medium text-ink" title={s.name}>
                        {s.name}
                      </span>
                      <span className="truncate text-xs text-ink-muted">
                        {[
                          s.phone,
                          `${s.product_count} producto${s.product_count === 1 ? "" : "s"}`,
                          s.last_movement_at ? `último mov. ${formatDateShort(s.last_movement_at)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                    <SupplierBalance balance={s.balance} currency={currency} />
                    <div className="supplier-list__actions">
                      {s.balance > 0 && (
                        <Button size="sm" onClick={() => setAccount({ id: s.id, panel: "pay" })}>
                          Pagar
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => setAccount({ id: s.id, panel: "none" })}>
                        Ver cuenta
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </PageContent>

      <SupplierAccountModal
        supplier={selected}
        initialPanel={account?.panel ?? "none"}
        currency={currency}
        userId={user?.id ?? null}
        onClose={() => setAccount(null)}
        onChanged={() => void reload().catch(showUserError)}
      />

      <Modal
        open={newOpen}
        title="Nuevo proveedor"
        icon={<Handshake size={20} />}
        onClose={() => setNewOpen(false)}
        footer={
          <FormActions>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveNew()} loading={saving}>
              Guardar
            </Button>
          </FormActions>
        }
      >
        <div className="space-y-3">
          <Input label="Nombre" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <Input
            label="WhatsApp"
            hint="Para mandarle los pedidos. Con característica, ej. 2664 123456."
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            inputMode="tel"
          />
          <Input
            label="Notas"
            placeholder="Días de visita, condiciones, vendedor…"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
          />
        </div>
      </Modal>

      <PurchaseEntryModal
        open={entryOpen}
        onClose={() => {
          setEntryOpen(false);
          setFromOrder(undefined);
        }}
        onDone={() => {
          setOrdersKey((k) => k + 1);
          void reload().catch(showUserError);
        }}
        userId={user?.id ?? null}
        currency={currency}
        fromOrder={fromOrder}
      />
    </div>
  );
}
