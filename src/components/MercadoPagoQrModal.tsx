import { useCallback, useEffect, useState } from "react";
import { Loader2, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { Button, Modal } from "./ui";
import { formatMoney } from "../lib/format";
import {
  checkMpOrderStatus,
  createMpQrOrder,
  type MpQrOrderResult,
} from "../lib/posIntegrations";

interface Props {
  open: boolean;
  amount: number;
  currency: string;
  description: string;
  onApproved: () => void;
  onClose: () => void;
}

export default function MercadoPagoQrModal({
  open,
  amount,
  currency,
  description,
  onApproved,
  onClose,
}: Props) {
  const [order, setOrder] = useState<MpQrOrderResult | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("Generando código QR…");
  const [busy, setBusy] = useState(false);

  const startOrder = useCallback(async () => {
    setBusy(true);
    setError("");
    setOrder(null);
    setQrImage(null);
    setStatusText("Generando código QR…");
    try {
      const ref = `pos-${Date.now()}`;
      const created = await createMpQrOrder(amount, description, ref);
      setOrder(created);
      const dataUrl = await QRCode.toDataURL(created.qr_data, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      setQrImage(dataUrl);
      setStatusText(
        created.simulated
          ? "Modo prueba: se aprueba solo en unos segundos."
          : "Pedile al cliente que escanee con Mercado Pago o su banco.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [amount, description]);

  useEffect(() => {
    if (open) void startOrder();
    else {
      setOrder(null);
      setQrImage(null);
      setError("");
    }
  }, [open, startOrder]);

  useEffect(() => {
    if (!open || !order) return;

    const id = setInterval(async () => {
      try {
        const st = await checkMpOrderStatus(order.order_id, order.simulated);
        if (st.status === "approved") {
          clearInterval(id);
          onApproved();
        } else if (st.status === "rejected" || st.status === "cancelled") {
          setStatusText(`Pago ${st.status}. Generá un nuevo QR o cancelá.`);
        } else {
          setStatusText(
            order.simulated
              ? "Esperando pago de prueba…"
              : "Esperando que el cliente pague…",
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 2000);

    return () => clearInterval(id);
  }, [open, order, onApproved]);

  return (
    <Modal open={open} title="Cobrar con Mercado Pago" onClose={onClose} wide>
      <div className="text-center">
        <p className="text-sm text-ink-muted">
          Total a cobrar:{" "}
          <strong className="text-lg text-ink">{formatMoney(amount, currency)}</strong>
        </p>

        {busy && (
          <div className="my-8 flex justify-center text-ink-muted">
            <Loader2 className="animate-spin" size={32} />
          </div>
        )}

        {error && (
          <div className="my-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {qrImage && !busy && (
          <div className="mx-auto my-4 inline-block rounded-2xl border border-[var(--color-panel-border)] bg-white p-4">
            <img src={qrImage} alt="QR Mercado Pago" className="h-[280px] w-[280px]" />
          </div>
        )}

        {!qrImage && !busy && !error && (
          <div className="my-8 flex justify-center text-ink-muted">
            <QrCode size={48} className="opacity-40" />
          </div>
        )}

        <p className="text-sm text-ink-muted">{statusText}</p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={() => void startOrder()} disabled={busy}>
            Nuevo QR
          </Button>
        </div>
      </div>
    </Modal>
  );
}
