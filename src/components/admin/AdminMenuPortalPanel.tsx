import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Palette,
  Printer,
  RefreshCw,
  Store,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import QRCode from "qrcode";
import { Alert, Button, Input, Switch, TextArea } from "../ui";
import { useAppearance } from "../../context/AppearanceContext";
import { useAppConfig } from "../../context/AppConfig";
import { compressStoreCoverImage } from "../../lib/brandingApi";
import {
  getPrintBrandingSettings,
  savePrintBrandingSettings,
} from "../../config/printBranding";
import { copyToClipboard, openExternalUrl } from "../../lib/openExternal";
import { printHtml, escapeHtml } from "../../lib/printHtml";
import { showUserError } from "../../lib/notice";
import {
  DEFAULT_STORE_COLOR,
  getMenuPortalStatus,
  getMenuStoreSettings,
  menuPortalUrl,
  pushMenuPortalSnapshot,
  saveMenuStoreSettings,
  scheduleMenuPortalPush,
  setMenuPortalEnabled,
  setMenuPortalSlug,
  type MenuPortalStatus,
  type MenuStoreSettings,
} from "../../lib/menuPortalPush";

const COLOR_PRESETS = ["#1f6b4a", "#1d4ed8", "#b91c1c", "#c2410c", "#7c3aed", "#0f766e", "#be185d", "#111827"];

function ToggleRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

interface Props {
  businessName: string;
  onFlash: (msg: string) => void;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Nunca";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminMenuPortalPanel({ businessName, onFlash }: Props) {
  const { logoUrl } = useAppearance();
  const { rubro } = useAppConfig();
  const isCarta = rubro === "gastronomia";
  const [status, setStatus] = useState<MenuPortalStatus | null>(null);
  const [slugDraft, setSlugDraft] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [store, setStore] = useState<MenuStoreSettings | null>(null);
  const [storeDirty, setStoreDirty] = useState(false);
  const [costDraft, setCostDraft] = useState("");
  const coverInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const [s, print, st] = await Promise.all([
      getMenuPortalStatus(),
      getPrintBrandingSettings(),
      getMenuStoreSettings(),
    ]);
    setStatus(s);
    setSlugDraft(s.slug);
    setWhatsapp(print.whatsapp);
    setStore(st);
    setCostDraft(st.deliveryCost ? String(st.deliveryCost) : "");
    setStoreDirty(false);
  }, []);

  function patchStore(patch: Partial<MenuStoreSettings>) {
    setStore((cur) => (cur ? { ...cur, ...patch } : cur));
    setStoreDirty(true);
  }

  async function pickCover(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await compressStoreCoverImage(file);
      if (!dataUrl) throw new Error("No se pudo usar esa imagen. Probá con otra (JPG o PNG).");
      patchStore({ coverDataUrl: dataUrl });
    } catch (e) {
      showUserError(e);
    } finally {
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  async function saveStore() {
    if (!store) return;
    setBusy(true);
    try {
      const cost = Number(costDraft.replace(",", "."));
      await saveMenuStoreSettings({
        ...store,
        pickup: store.pickup || !store.delivery,
        deliveryCost: Number.isFinite(cost) && cost > 0 ? cost : null,
      });
      if (status?.enabled) {
        const err = await pushMenuPortalSnapshot();
        onFlash(err ? err.slice(0, 80) : "Tienda guardada y publicada");
      } else {
        onFlash("Tienda guardada");
      }
      await reload();
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [reload]);

  const portalUrl = menuPortalUrl(slugDraft || status?.slug || "carta");

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(portalUrl, {
      width: 240,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrImage(url);
      })
      .catch(() => {
        if (!cancelled) setQrImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [portalUrl]);

  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      await setMenuPortalSlug(slugDraft);
      await setMenuPortalEnabled(enabled);
      if (enabled) {
        const err = await pushMenuPortalSnapshot();
        await reload();
        onFlash(err ? "Activado, pero no se pudo subir aún" : "Carta web activada");
      } else {
        await reload();
        onFlash("Carta web desactivada");
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveSlug() {
    setBusy(true);
    try {
      const normalized = await setMenuPortalSlug(slugDraft);
      setSlugDraft(normalized);
      if (status?.enabled) {
        const err = await pushMenuPortalSnapshot();
        await reload();
        onFlash(err ? err.slice(0, 80) : "Código guardado y carta actualizada");
      } else {
        onFlash("Código guardado");
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveWhatsApp() {
    try {
      const next = whatsapp.trim();
      const current = (await getPrintBrandingSettings()).whatsapp.trim();
      if (next === current) return;
      await savePrintBrandingSettings({ whatsapp: next });
      setWhatsapp(next);
      scheduleMenuPortalPush();
      onFlash("WhatsApp guardado");
    } catch (e) {
      showUserError(e);
    }
  }

  async function pushNow() {
    setBusy(true);
    try {
      await setMenuPortalSlug(slugDraft);
      const err = await pushMenuPortalSnapshot();
      await reload();
      onFlash(err ? err.slice(0, 80) : "Carta subida a la web");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await copyToClipboard(portalUrl);
      setCopied(true);
      onFlash("Link copiado");
      window.setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      showUserError(e);
    }
  }

  function printCard() {
    const name = businessName.trim() || "Mi local";
    const qr = qrImage ?? "";
    const logo = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="" style="max-height:80px;max-width:180px;object-fit:contain;margin:0 auto 10px;display:block"/>`
      : "";
    const body = `
      <div style="text-align:center;padding:8px 4px 4px">
        ${logo}
        <h1 style="font-size:20px;margin:0 0 10px">${escapeHtml(name)}</h1>
        <p style="font-size:13px;color:#334155">Escaneá el QR para ver los productos y hacer tu pedido.</p>
        ${qr ? `<img src="${qr}" alt="QR" style="width:220px;height:220px;margin:12px auto;display:block"/>` : "<p>QR no disponible</p>"}
        <p style="font-size:11px;color:#64748b;word-break:break-all">${escapeHtml(portalUrl)}</p>
        <p style="font-size:10px;color:#94a3b8;margin-top:16px">Powered by WalQo</p>
      </div>
    `;
    printHtml("Tarjeta QR carta", body, "@page { size: A6 portrait; margin: 12mm; }");
  }

  const enabled = status?.enabled ?? false;
  const waOk = whatsapp.replace(/\D/g, "").length >= 8;

  return (
    <div className="min-w-0 space-y-5">
      <div className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400">
              <UtensilsCrossed size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">
                {isCarta ? "Carta en walqo.pro" : "Tienda en walqo.pro"}
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">
                Tus productos con logo · el cliente arma el pedido y te llega a WalQo
              </p>
            </div>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-full border border-[var(--color-panel-border)] bg-[var(--color-panel-muted)] px-3 py-1.5">
            <span className="text-sm font-medium text-ink">{enabled ? "Publicada" : "Apagada"}</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-accent)]"
              checked={enabled}
              disabled={busy || status == null}
              onChange={(e) => void toggle(e.target.checked)}
            />
          </label>
        </div>

        <div className="mt-5 grid min-w-0 gap-4">
          <Input
            label="WhatsApp de pedidos"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            onBlur={() => void saveWhatsApp()}
            placeholder="Ej. 11 2345-6789"
            hint={
              waOk
                ? "Al enviar el pedido, también se abre WhatsApp con el resumen a este número."
                : "Sin WhatsApp el pedido igual te llega a WalQo, pero el cliente no te puede escribir desde la tienda."
            }
          />

          <div className="min-w-0">
            <p className="field-label">Código en la URL</p>
            <div className="mt-1 flex min-w-0 flex-wrap items-stretch gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  value={slugDraft}
                  onChange={(e) => setSlugDraft(e.target.value)}
                  placeholder="franti-comidas"
                  className="!mt-0"
                />
              </div>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveSlug()}>
                Guardar
              </Button>
            </div>
            <p className="field-hint mt-1">
              Solo letras, números y guiones. Es el nombre que va después de walqo.pro/.
            </p>
          </div>

          <div className="min-w-0">
            <p className="field-label">Enlace para tus clientes</p>
            <p className="field-hint">
              Se abre en el navegador. El cliente no descarga nada.
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-stretch gap-2">
              <div className="min-w-0 flex-1 truncate rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-sm text-ink">
                {portalUrl}
              </div>
              <Button type="button" variant="secondary" onClick={() => void copyLink()}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copiado" : "Copiar link"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void openExternalUrl(portalUrl).catch(() => undefined)}
              >
                <ExternalLink size={16} />
                Abrir
              </Button>
            </div>
          </div>
        </div>
      </div>

      {store ? (
        <div className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400">
              <Store size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">Pedidos y entrega</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                Los pedidos aparecen en el Punto de venta. El stock se descuenta recién cuando lo cobrás.
              </p>
            </div>
          </div>

          <div className="mt-4 grid min-w-0 gap-4">
            <ToggleRow
              title="Recibir pedidos en WalQo"
              hint="El cliente completa nombre y teléfono, y el pedido te llega acá para cobrarlo."
              checked={store.ordersEnabled}
              onChange={(v) => patchStore({ ordersEnabled: v })}
            />
            <ToggleRow
              title="Ocultar productos sin stock"
              hint="Si está apagado, se ven con «Sin stock» y no se pueden pedir. Nunca se muestra la cantidad."
              checked={store.hideOutOfStock}
              onChange={(v) => patchStore({ hideOutOfStock: v })}
            />
            <ToggleRow
              title="Retiro en el local"
              checked={store.pickup}
              onChange={(v) => patchStore({ pickup: v, ...(v ? {} : { delivery: true }) })}
            />
            <ToggleRow
              title="Envío a domicilio"
              hint="El cliente escribe la dirección."
              checked={store.delivery}
              onChange={(v) => patchStore({ delivery: v, ...(v ? {} : { pickup: true }) })}
            />
            {store.delivery ? (
              <Input
                label="Costo de envío (opcional)"
                inputMode="decimal"
                value={costDraft}
                onChange={(e) => {
                  setCostDraft(e.target.value.replace(/[^\d.,]/g, ""));
                  setStoreDirty(true);
                }}
                placeholder="Ej. 1500"
                hint="Se le muestra al cliente como un precio fijo. Vacío = a convenir."
              />
            ) : null}
            <TextArea
              label="Horarios"
              rows={3}
              maxLength={300}
              value={store.hours}
              onChange={(e) => patchStore({ hours: e.target.value })}
              placeholder={"Lunes a sábado de 8 a 21\nDomingo de 9 a 13"}
              hint="Se ven arriba de todo en la tienda."
            />
          </div>

          <div className="mt-6 flex min-w-0 items-start gap-3 border-t border-[var(--color-panel-border)] pt-5">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400">
              <Palette size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">Cómo se ve</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                El logo es el de Configuración → Apariencia.
                {logoUrl ? "" : " Todavía no cargaste uno."}
              </p>
            </div>
          </div>

          <div className="mt-4 grid min-w-0 gap-4">
            <div className="min-w-0">
              <p className="field-label">Color principal</p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    onClick={() => patchStore({ color: c })}
                    className={`h-8 w-8 shrink-0 rounded-full border-2 transition ${
                      store.color.toLowerCase() === c ? "border-ink scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
                  <input
                    type="color"
                    value={store.color}
                    onChange={(e) => patchStore({ color: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-[var(--color-panel-border)] bg-transparent"
                  />
                  Otro
                </label>
              </div>
            </div>

            <div className="min-w-0">
              <p className="field-label">Imagen de portada (opcional)</p>
              <div
                className="mt-1 flex h-28 min-w-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--color-panel-border)] text-sm text-ink-muted"
                style={
                  store.coverDataUrl
                    ? { backgroundImage: `url(${store.coverDataUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { backgroundColor: store.color || DEFAULT_STORE_COLOR, color: "#fff" }
                }
              >
                {store.coverDataUrl ? null : "Sin portada: se usa el color"}
              </div>
              <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void pickCover(e.target.files?.[0])}
                />
                <Button type="button" variant="secondary" onClick={() => coverInputRef.current?.click()}>
                  <ImagePlus size={16} />
                  {store.coverDataUrl ? "Cambiar portada" : "Elegir portada"}
                </Button>
                {store.coverDataUrl ? (
                  <Button type="button" variant="ghost" onClick={() => patchStore({ coverDataUrl: "" })}>
                    <Trash2 size={16} />
                    Quitar
                  </Button>
                ) : null}
              </div>
              <p className="field-hint mt-1">Una foto ancha del local o de tus productos. Se achica sola.</p>
            </div>
          </div>

          <div className="mt-5 flex min-w-0 flex-wrap items-center gap-3">
            <Button type="button" disabled={busy || !storeDirty} onClick={() => void saveStore()}>
              <Check size={16} />
              Guardar tienda
            </Button>
            {storeDirty ? <span className="text-xs text-ink-muted">Hay cambios sin guardar.</span> : null}
          </div>
        </div>
      ) : null}

      <div className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4 sm:p-5">
        <div className="grid min-w-0 gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          <div className="mx-auto shrink-0 sm:mx-0">
            {qrImage ? (
              <img
                src={qrImage}
                alt="QR carta"
                className="h-40 w-40 rounded-xl border border-[var(--color-panel-border)] bg-white p-2 sm:h-44 sm:w-44"
              />
            ) : (
              <div className="flex h-40 w-40 items-center justify-center rounded-xl border border-dashed border-[var(--color-panel-border)] text-sm text-ink-muted sm:h-44 sm:w-44">
                QR…
              </div>
            )}
            <p className="mt-2 text-center text-xs text-ink-muted">Para mesas / redes</p>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-[var(--color-panel-border)] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Última subida
                </p>
                <p className="mt-0.5 truncate text-sm font-medium text-ink">
                  {formatWhen(status?.lastPushAt ?? null)}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border border-[var(--color-panel-border)] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Estado
                </p>
                <p className="mt-0.5 truncate text-sm font-medium text-ink">
                  {status?.lastError ? "Con error" : enabled ? "Listo" : "Inactivo"}
                </p>
              </div>
            </div>

            {status?.lastError ? <Alert variant="warning">{status.lastError}</Alert> : null}

            {!waOk && enabled ? (
              <Alert variant="info">
                Cargá el WhatsApp arriba para que el cliente pueda pedir desde la carta.
              </Alert>
            ) : null}

            <div className="flex min-w-0 flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !enabled}
                onClick={() => void pushNow()}
              >
                <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
                Subir ahora
              </Button>
              <Button type="button" variant="secondary" disabled={!qrImage} onClick={printCard}>
                <Printer size={16} />
                Imprimir QR
              </Button>
            </div>

            <p className="text-xs text-ink-muted">
              Se actualiza sola cada 3 minutos y al guardar productos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
