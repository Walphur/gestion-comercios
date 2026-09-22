import { useEffect, useState } from "react";
import { MessageCircle, QrCode, Scale, Share2 } from "lucide-react";
import { Button, Card, Input, SegmentToggle, Select } from "../ui";
import { getSetting, setSetting } from "../../db/settings";
import { useAppConfig } from "../../context/AppConfig";
import {
  DEFAULT_ORDER_READY_TEMPLATE,
  loadOrderReadyTemplate,
  saveOrderReadyTemplate,
} from "../../lib/orderReadyTemplate";
import {
  DEFAULT_QR_PROVIDERS,
  loadQrProviders,
  saveQrProviders,
  type QrPaymentProvider,
} from "../../lib/posQrProviders";
import {
  loadScaleBarcodeConfig,
  saveScaleBarcodeConfig,
  type ScaleBarcodeMode,
} from "../../lib/scaleBarcode";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminPosPanel({ onFlash }: Props) {
  const { rubroDef } = useAppConfig();
  const isGastronomia = rubroDef.id === "gastronomia";
  const [shareAfterSale, setShareAfterSale] = useState(false);
  const [scalePrefix, setScalePrefix] = useState("20");
  const [scaleMode, setScaleMode] = useState<ScaleBarcodeMode>("amount");
  const [qrProviders, setQrProviders] = useState<QrPaymentProvider[]>(DEFAULT_QR_PROVIDERS);
  const [orderReadyMsg, setOrderReadyMsg] = useState(DEFAULT_ORDER_READY_TEMPLATE);

  useEffect(() => {
    void getSetting("pos_share_after_sale").then((v) => setShareAfterSale(v === "1"));
    void loadScaleBarcodeConfig().then((c) => {
      setScalePrefix(c.prefix);
      setScaleMode(c.mode);
    });
    void loadQrProviders().then(setQrProviders);
    if (isGastronomia) {
      void loadOrderReadyTemplate().then(setOrderReadyMsg);
    }
  }, [isGastronomia]);

  async function saveShareAfter(v: boolean) {
    setShareAfterSale(v);
    await setSetting("pos_share_after_sale", v ? "1" : "0");
    onFlash("Guardado");
  }

  async function saveScale() {
    await saveScaleBarcodeConfig({
      prefix: scalePrefix,
      mode: scaleMode,
    });
    onFlash("Balanza guardada");
  }

  async function saveQr() {
    await saveQrProviders(qrProviders);
    onFlash("Medios QR guardados");
  }

  async function saveOrderReady() {
    await saveOrderReadyTemplate(orderReadyMsg);
    onFlash("Mensaje de pedido listo guardado");
  }

  function toggleQr(id: string) {
    setQrProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p)),
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
          <Share2 size={18} className="text-brand-600 dark:text-brand-300" />
          Detalle post-venta (WhatsApp)
        </h3>
        <p className="mb-4 text-sm text-ink-muted">
          En un super conviene no interrumpir cada venta. Podés ofrecer el detalle solo cuando el
          cajero lo marca en el cobro, o activar el aviso automático.
        </p>
        <SegmentToggle
          value={shareAfterSale}
          onChange={(v) => void saveShareAfter(v)}
          offLabel="Solo si el cajero lo pide"
          onLabel="Siempre al cobrar"
        />
      </Card>

      {isGastronomia && (
        <Card>
          <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
            <MessageCircle size={18} className="text-brand-600 dark:text-brand-300" />
            Mensaje «pedido listo» (WhatsApp)
          </h3>
          <p className="mb-3 text-sm text-ink-muted">
            Se abre WhatsApp con este texto al marcar Listo en pedidos pendientes. Usá{" "}
            <code className="rounded bg-[var(--color-input-bg)] px-1 text-xs">*negrita*</code>{" "}
            (formato WhatsApp). Placeholders:{" "}
            <code className="text-xs">{"{{nombre}}"}</code>,{" "}
            <code className="text-xs">{"{{negocio}}"}</code>,{" "}
            <code className="text-xs">{"{{pedido}}"}</code>,{" "}
            <code className="text-xs">{"{{tipo}}"}</code>,{" "}
            <code className="text-xs">{"{{items}}"}</code>,{" "}
            <code className="text-xs">{"{{total}}"}</code>.
          </p>
          <textarea
            value={orderReadyMsg}
            onChange={(e) => setOrderReadyMsg(e.target.value)}
            rows={10}
            className="w-full min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2.5 font-mono text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900"
            spellCheck={false}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void saveOrderReady()}>
              Guardar mensaje
            </Button>
            <Button
              variant="ghost"
              onClick={() => setOrderReadyMsg(DEFAULT_ORDER_READY_TEMPLATE)}
            >
              Restaurar modelo
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
          <Scale size={18} className="text-brand-600 dark:text-brand-300" />
          Códigos de balanza (Kretz)
        </h3>
        <p className="mb-4 text-sm text-ink-muted">
          Formato por defecto EAN-13 <strong>2-5-5</strong> (inicio + PLU + importe). Debe coincidir
          con iTegra. En cada producto cargá el mismo PLU que en la balanza.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Prefijo pesables (2 dígitos)"
            value={scalePrefix}
            onChange={(e) => setScalePrefix(e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="20"
          />
          <Select
            label="Campo en etiqueta"
            value={scaleMode}
            onChange={(e) => setScaleMode(e.target.value as ScaleBarcodeMode)}
          >
            <option value="amount">Importe (recomendado en caja)</option>
            <option value="weight">Peso en kg</option>
          </Select>
        </div>
        <Button variant="secondary" className="mt-3" onClick={() => void saveScale()}>
          Guardar balanza
        </Button>
      </Card>

      <Card>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
          <QrCode size={18} className="text-brand-600 dark:text-brand-300" />
          Cobro por QR (varios bancos)
        </h3>
        <p className="mb-4 text-sm text-ink-muted">
          Activá los QR que uses en caja (BNA, Brubank, Ualá, etc.). Mercado Pago con cobro
          automático se configura aparte. Cada QR es registro manual: el cajero confirma cuando el
          cliente pagó.
        </p>
        <ul className="space-y-2">
          {qrProviders.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={p.active}
                  onChange={() => toggleQr(p.id)}
                  className="rounded border-[var(--color-panel-border)]"
                />
                <span className="font-medium text-ink">{p.label}</span>
                {p.id === "mercadopago" && (
                  <span className="text-xs text-ink-muted">(usar tarjeta MP arriba)</span>
                )}
              </label>
            </li>
          ))}
        </ul>
        <Button variant="secondary" className="mt-3" onClick={() => void saveQr()}>
          Guardar medios QR
        </Button>
      </Card>
    </div>
  );
}
