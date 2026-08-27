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

/** Tras cobrar: enviar detalle por WhatsApp o guardar cliente rápido. */
export default function SaleShareModal({ open, saleId, onClose }: Props) {
  const { currency } = useAppConfig();
  const [data, setData] = useState<SaleShareData | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || saleId == null) {
      setData(null);
      setName("");
      setPhone("");
      return;
    }
    void loadSaleShareData(saleId).then(setData);
  }, [open, saleId]);

  async function sendWhatsApp(toPhone?: string) {
    if (!data) return;
    const msg = buildSaleWhatsAppMessage(data, name.trim() || data.sale.customer_name || undefined);
    const target = toPhone?.trim() || phone.trim();
    if (target) {
      const r = await openWhatsApp(target, msg);
      if (r.copied) {
        alert("WhatsApp abierto. El mensaje está copiado: pegalo con Ctrl+V si hace falta.");
      }
    } else {
      await openWhatsAppShare(msg);
    }
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
      await createCustomer({ name: name.trim(), phone: phone.trim(), credit_limit: 0 });
      await sendWhatsApp(phone);
      onClose();
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
      <div className="space-y-4 min-w-0">
        <p className="text-sm text-ink-muted leading-relaxed">
          Si el cliente quiere el detalle para repartir gastos o guardarlo, podés mandárselo por
          WhatsApp o imprimir el ticket. No es factura fiscal.
        </p>

        {data && (
          <div className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel-muted)] px-3 py-2 text-sm">
            <p className="font-semibold text-ink">{formatMoney(data.sale.total, currency)}</p>
            <p className="text-xs text-ink-muted mt-1">
              {data.items.length} ítem{data.items.length === 1 ? "" : "s"} · Ticket #{data.sale.id}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-ink-muted">Cliente nuevo (opcional)</p>
          <Input
            label="Nombre y apellido"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Juan Pérez"
          />
          <Input
            label="Celular / WhatsApp"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej. 11 2345 6789"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="flex-1 min-w-[140px]"
            disabled={busy || !phone.trim()}
            onClick={() => void saveAndSend()}
          >
            <UserPlus size={16} />
            Guardar y WhatsApp
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1 min-w-[140px]"
            disabled={busy || !data}
            onClick={() => void sendWhatsApp()}
          >
            <MessageCircle size={16} />
            Solo WhatsApp
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || saleId == null}
            onClick={() => void reprint()}
          >
            <Printer size={16} /> Imprimir ticket
          </Button>
        </div>

        <Button type="button" variant="ghost" className="w-full" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
