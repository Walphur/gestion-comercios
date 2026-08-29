import { useEffect, useState } from "react";
import { MessageCircle, Printer, UserPlus } from "lucide-react";
import { Button, Input, Modal } from "./ui";
import { createCustomer } from "../db/customers";
import { printSaleReceipt } from "../lib/posIntegrations";
import { openWhatsApp, openWhatsAppShare } from "../lib/openExternal";
import { buildSaleWhatsAppMessage, loadSaleShareData, type SaleShareData } from "../lib/saleShare";
import { showUserError } from "../lib/notice";
import { formatMoney } from "../lib/format";
import { useAppConfig } from "../context/AppConfig";

interface Props {
  open: boolean;
  saleId: number | null;
  onClose: () => void;
}

/** Tras cobrar: enviar detalle por WhatsApp o imprimir ticket (opcional). */
export default function SaleShareModal({ open, saleId, onClose }: Props) {
  const { currency } = useAppConfig();
  const [data, setData] = useState<SaleShareData | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const linkedCustomer = data?.customer ?? null;
  const hasLinkedContact = Boolean(linkedCustomer?.phone?.trim());

  useEffect(() => {
    if (!open || saleId == null) {
      setData(null);
      setName("");
      setPhone("");
      return;
    }
    void loadSaleShareData(saleId).then((loaded) => {
      setData(loaded);
      if (loaded?.customer) {
        setName(loaded.customer.name);
        setPhone(loaded.customer.phone ?? "");
      }
    });
  }, [open, saleId]);

  async function sendWhatsApp(toPhone?: string) {
    if (!data) return;
    const msg = buildSaleWhatsAppMessage(
      data,
      name.trim() || data.sale.customer_name || linkedCustomer?.name,
    );
    const target = toPhone?.trim() || phone.trim() || linkedCustomer?.phone?.trim();
    if (target) {
      const r = await openWhatsApp(target, msg);
      if (r.copied) {
        alert("WhatsApp abierto. El mensaje está copiado: pegalo con Ctrl+V si hace falta.");
      }
    } else {
      await openWhatsAppShare(msg);
    }
    onClose();
  }

  async function saveAndSend() {
    if (!name.trim()) {
      showUserError("Escribí al menos el nombre del cliente.", "Falta un dato");
      return;
    }
    if (!phone.trim()) {
      showUserError("El celular es necesario para enviar por WhatsApp.", "Falta un dato");
      return;
    }
    setBusy(true);
    try {
      if (!linkedCustomer) {
        await createCustomer({ name: name.trim(), phone: phone.trim(), credit_limit: 0 });
      }
      await sendWhatsApp(phone);
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  async function reprint() {
    if (saleId == null) return;
    setBusy(true);
    try {
      await printSaleReceipt(saleId, false);
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Detalle para el cliente" onClose={onClose}>
      <div className="min-w-0 space-y-4">
        {data && (
          <div className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel-muted)] px-4 py-3">
            <p className="text-lg font-bold tabular-nums text-ink">
              {formatMoney(data.sale.total, currency)}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Ticket #{data.sale.id} · {data.items.length} ítem{data.items.length === 1 ? "" : "s"}
            </p>
            {linkedCustomer && (
              <p className="mt-2 text-sm font-medium text-ink">
                Cliente: {linkedCustomer.name}
                {linkedCustomer.phone ? ` · ${linkedCustomer.phone}` : ""}
              </p>
            )}
          </div>
        )}

        {hasLinkedContact ? (
          <p className="text-sm text-ink-muted">
            El cliente ya está en la venta. Podés mandarle el detalle por WhatsApp o reimprimir el
            ticket. No es factura fiscal.
          </p>
        ) : (
          <p className="text-sm text-ink-muted">
            Detalle para repartir gastos o guardar. No es factura fiscal. Si no hace falta, cerrá y
            seguí vendiendo.
          </p>
        )}

        {!hasLinkedContact && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              label="Nombre (opcional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Juan Pérez"
            />
            <Input
              label="WhatsApp (opcional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej. 11 2345 6789"
            />
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {hasLinkedContact ? (
            <Button
              type="button"
              className="flex-1"
              disabled={busy || !data}
              onClick={() => void sendWhatsApp()}
            >
              <MessageCircle size={16} />
              WhatsApp a {linkedCustomer?.name?.split(" ")[0] ?? "cliente"}
            </Button>
          ) : phone.trim() ? (
            <Button
              type="button"
              className="flex-1"
              disabled={busy}
              onClick={() => void saveAndSend()}
            >
              <UserPlus size={16} />
              Guardar y WhatsApp
            </Button>
          ) : (
            <Button
              type="button"
              className="flex-1"
              disabled={busy || !data}
              onClick={() => void sendWhatsApp()}
            >
              <MessageCircle size={16} />
              Compartir por WhatsApp
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={busy || saleId == null}
            onClick={() => void reprint()}
          >
            <Printer size={16} /> Imprimir ticket
          </Button>
        </div>

        <Button type="button" variant="ghost" className="w-full" onClick={onClose}>
          Cerrar y seguir
        </Button>
      </div>
    </Modal>
  );
}
