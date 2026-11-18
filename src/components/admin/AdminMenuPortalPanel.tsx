import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Palette,
  Printer,
  RefreshCw,
  ShoppingBag,
  Store,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  countMenuPortalProducts,
  MENU_PORTAL_MAX_PRODUCTS,
  type MenuPortalCounts,
} from "../../db/menuPortalData";
import QRCode from "qrcode";
import { Alert, Button, Input, Switch, TextArea } from "../ui";
import { useAppearance } from "../../context/AppearanceContext";
import { useAppConfig } from "../../context/AppConfig";
import { usePlanEntitlements } from "../../hooks/usePlanEntitlements";
import { useWebOrders } from "../../hooks/useWebOrders";
import { compressStoreCoverImage } from "../../lib/brandingApi";
import { getMpConfigStatus } from "../../lib/posIntegrations";
import { clearWebMpCredential, syncWebMpCredential } from "../../lib/webOrders";
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
  disabled,
  onChange,
}: {
  title: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
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
  const noun = isCarta ? "carta" : "tienda";
  const Noun = isCarta ? "Carta" : "Tienda";
  const navigate = useNavigate();
  const [counts, setCounts] = useState<MenuPortalCounts | null>(null);
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
  const { mercadoPago } = usePlanEntitlements();
  const { mpStatus } = useWebOrders();
  const [mpConnected, setMpConnected] = useState(false);
  const [mpBusy, setMpBusy] = useState(false);
  const [mpError, setMpError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMpConfigStatus()
      .then((st) => {
        if (!cancelled) setMpConnected((st.oauth_connected || st.configured) && !st.simulation);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleMpOnline(next: boolean) {
    if (!store) return;
    setMpBusy(true);
    setMpError(null);
    try {
      if (next) {
        const st = await syncWebMpCredential(true);
        if (st !== "ok") throw new Error("Mercado Pago no aceptó la conexión. Volvé a conectar Mercado Pago.");
      } else {
        await clearWebMpCredential();
      }
      await saveMenuStoreSettings({ mpOnline: next });
      setStore((cur) => (cur ? { ...cur, mpOnline: next } : cur));
      if (status?.enabled) await pushMenuPortalSnapshot();
      onFlash(next ? "Cobro online con Mercado Pago activado" : "Cobro online desactivado");
    } catch (e) {
      setMpError(e instanceof Error ? e.message : String(e));
    } finally {
      setMpBusy(false);
    }
  }

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
    setCounts(await countMenuPortalProducts().catch(() => null));
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
        onFlash(err ? err : "Cambios guardados y publicados");
      } else {
        onFlash("Cambios guardados");
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
      const previousSlug = status?.slug ?? "";
      const normalized = await setMenuPortalSlug(slugDraft);
      setSlugDraft(normalized);
      await setMenuPortalEnabled(enabled);
      if (enabled) {
        const err = await pushMenuPortalSnapshot();
        if (err && previousSlug && previousSlug !== normalized) {
          await setMenuPortalSlug(previousSlug);
          setSlugDraft(previousSlug);
        }
        await reload();
        onFlash(err ? err : `${Noun} web activada`);
      } else {
        await reload();
        onFlash(`${Noun} web desactivada`);
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
        if (err) {
          // El nombre queda guardado acá; el link público cambia recién al publicar.
          onFlash(`${err} El nombre «${normalized}» quedó guardado: tocá «Publicar ahora» cuando puedas.`);
          return;
        }
        onFlash(`Listo. Tu enlace quedó: walqo.pro/${normalized}`);
      } else {
        onFlash("Nombre del enlace guardado");
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
      const normalized = await setMenuPortalSlug(slugDraft);
      setSlugDraft(normalized);
      const err = await pushMenuPortalSnapshot();
      await reload();
      onFlash(err ? err : `${Noun} publicada en la web`);
    } finally {
      setBusy(false);
    }
  }

  function statusLabel(): string {
    if (!enabled) return "Apagada";
    if (status?.lastError) return "No se pudo publicar";
    if (!status?.lastPushAt) return "Falta publicar";
    return "Al día";
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
    printHtml(`Tarjeta QR ${noun}`, body, "@page { size: A6 portrait; margin: 12mm; }", {
      brandHeader: false,
    });
  }

  const enabled = status?.enabled ?? false;
  const waOk = whatsapp.replace(/\D/g, "").length >= 8;

  return (
    <div className="min-w-0 space-y-5">
      <div className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400">
              {isCarta ? <UtensilsCrossed size={20} /> : <ShoppingBag size={20} />}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">
                {isCarta ? "Carta para tus clientes" : "Tienda para tus clientes"}
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {isCarta
                  ? "El cliente ve tu carta en el celular, arma el pedido y te llega acá."
                  : "El cliente ve tus productos en el celular, arma el pedido y te llega acá."}
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
                ? "Cuando el cliente pide, también se abre WhatsApp con el pedido a este número."
                : "Sin WhatsApp el pedido igual te llega acá, pero el cliente no te puede escribir desde la carta."
            }
          />

          <div className="min-w-0">
            <p className="field-label">Nombre del enlace</p>
            <div className="mt-1 flex min-w-0 flex-wrap items-stretch gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  value={slugDraft}
                  onChange={(e) => setSlugDraft(e.target.value)}
                  placeholder="los-tanos"
                  className="!mt-0"
                />
              </div>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => saveSlug()}>
                Guardar
              </Button>
            </div>
            <p className="field-hint mt-1">
              Letras, números y guiones. Va después de walqo.pro/ (ej. los-tanos).
            </p>
          </div>

          <div className="min-w-0">
            <p className="field-label">Link para tus clientes</p>
            <p className="field-hint">
              Se abre en el celular, sin instalar nada.
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-stretch gap-2">
              <div className="min-w-0 flex-1 truncate rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-sm text-ink">
                {portalUrl}
              </div>
              <Button type="button" variant="secondary" onClick={() => copyLink()}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copiado" : "Copiar link"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => openExternalUrl(portalUrl).catch(() => undefined)}
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
                Los pedidos te llegan al Punto de venta. El stock se baja recién cuando cobrás.
              </p>
            </div>
          </div>

          <div className="mt-4 grid min-w-0 gap-4">
            <ToggleRow
              title="Recibir pedidos acá"
              hint="El cliente pone nombre y teléfono, y el pedido te llega para cobrarlo."
              checked={store.ordersEnabled}
              onChange={(v) => patchStore({ ordersEnabled: v })}
            />
            {store.ordersEnabled && mercadoPago ? (
              <div className="min-w-0 space-y-2">
                <ToggleRow
                  title="Cobrar online con Mercado Pago"
                  hint={
                    mpConnected
                      ? "El cliente puede pagar ahora con Mercado Pago o pagar al retirar. La plata va a tu cuenta de Mercado Pago."
                      : "Primero conectá Mercado Pago en Configuración → Mercado Pago."
                  }
                  checked={store.mpOnline}
                  disabled={mpBusy || (!mpConnected && !store.mpOnline)}
                  onChange={(v) => void toggleMpOnline(v)}
                />
                {store.mpOnline && (mpStatus === "invalid" || mpStatus === "none") ? (
                  <Alert variant="warning">
                    Volvé a conectar Mercado Pago: la conexión se cortó y no se está cobrando online.
                  </Alert>
                ) : null}
                {mpError ? <Alert variant="warning">{mpError}</Alert> : null}
              </div>
            ) : null}
            <ToggleRow
              title="Ocultar productos sin stock"
              hint="Si está apagado, se ven como «Sin stock» y no se pueden pedir."
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
                hint="Precio fijo que ve el cliente. Si lo dejás vacío, dice «a convenir»."
              />
            ) : null}
            <TextArea
              label="Horarios"
              rows={3}
              maxLength={300}
              value={store.hours}
              onChange={(e) => patchStore({ hours: e.target.value })}
              placeholder={"Lunes a sábado de 8 a 21\nDomingo de 9 a 13"}
              hint="Se muestran arriba en la carta."
            />
          </div>

          <div className="mt-6 flex min-w-0 items-start gap-3 border-t border-[var(--color-panel-border)] pt-5">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400">
              <Palette size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">Colores y foto</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                El logo es el de Configuración → Apariencia.
                {logoUrl ? "" : " Todavía no cargaste uno."}
              </p>
            </div>
          </div>

          <div className="mt-4 grid min-w-0 gap-4">
            <div className="min-w-0">
              <p className="field-label">Color</p>
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
                <label
                  className={`relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 transition ${
                    COLOR_PRESETS.every((c) => store.color.toLowerCase() !== c)
                      ? "border-ink scale-110"
                      : "border-[var(--color-panel-border)]"
                  }`}
                  style={{ backgroundColor: store.color || DEFAULT_STORE_COLOR }}
                  title="Elegir otro color"
                >
                  <input
                    type="color"
                    value={store.color}
                    onChange={(e) => patchStore({ color: e.target.value })}
                    aria-label="Elegir otro color"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <span className="sr-only">Otro</span>
                </label>
              </div>
              <p className="field-hint mt-1">Tocá un círculo o el último para elegir cualquier color.</p>
            </div>

            <div className="min-w-0">
              <p className="field-label">Foto de portada (opcional)</p>
              <div
                className="mt-1 flex h-28 min-w-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--color-panel-border)] text-sm text-ink-muted"
                style={
                  store.coverDataUrl
                    ? { backgroundImage: `url(${store.coverDataUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { backgroundColor: store.color || DEFAULT_STORE_COLOR, color: "#fff" }
                }
              >
                {store.coverDataUrl ? null : "Sin foto: se ve el color"}
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
                  {store.coverDataUrl ? "Cambiar foto" : "Elegir foto"}
                </Button>
                {store.coverDataUrl ? (
                  <Button type="button" variant="ghost" onClick={() => patchStore({ coverDataUrl: "" })}>
                    <Trash2 size={16} />
                    Quitar
                  </Button>
                ) : null}
              </div>
              <p className="field-hint mt-1">Una foto ancha del local o de tus platos.</p>
            </div>
          </div>

          <div className="mt-5 flex min-w-0 flex-wrap items-center gap-3">
            <Button type="button" disabled={busy || !storeDirty} onClick={() => saveStore()}>
              <Check size={16} />
              Guardar cambios
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
                alt={`QR ${noun}`}
                className="h-40 w-40 rounded-xl border border-[var(--color-panel-border)] bg-white p-2 sm:h-44 sm:w-44"
              />
            ) : (
              <div className="flex h-40 w-40 items-center justify-center rounded-xl border border-dashed border-[var(--color-panel-border)] text-sm text-ink-muted sm:h-44 sm:w-44">
                QR…
              </div>
            )}
            <p className="mt-2 text-center text-xs text-ink-muted">
              {isCarta ? "Para mesas o redes" : "Para el mostrador o redes"}
            </p>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-[var(--color-panel-border)] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Última publicación
                </p>
                <p className="mt-0.5 truncate text-sm font-medium text-ink">
                  {formatWhen(status?.lastPushAt ?? null)}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border border-[var(--color-panel-border)] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Estado
                </p>
                <p
                  className={`mt-0.5 truncate text-sm font-medium ${
                    status?.lastError || (enabled && !status?.lastPushAt)
                      ? "text-danger"
                      : "text-ink"
                  }`}
                >
                  {statusLabel()}
                </p>
              </div>
            </div>

            {status?.lastError ? <Alert variant="warning">{status.lastError}</Alert> : null}
            {enabled && !status?.lastPushAt && !status?.lastError ? (
              <Alert variant="warning">
                Todavía no se publicó. Tocá «Publicar ahora» para que el link muestre tus productos.
              </Alert>
            ) : null}

            {counts ? (
              <div
                className="min-w-0 space-y-1.5 rounded-lg border border-[var(--color-panel-border)] px-3 py-2.5 text-sm"
                data-testid="menu-portal-counts"
              >
                {counts.eligible === 0 ? (
                  <Alert variant="warning">
                    {isCarta
                      ? "Ningún producto está marcado para la carta. En Productos, tildá «Mostrar en carta web» y después tocá «Publicar ahora»."
                      : "Ningún producto está marcado para la tienda. En Productos, tildá «Mostrar en la tienda web» y después tocá «Publicar ahora»."}{" "}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => navigate("/productos")}
                    >
                      Ir a Productos
                    </button>
                  </Alert>
                ) : (
                  <p className="font-medium text-ink">
                    {`Listos para la ${noun}: ${Math.min(counts.eligible, MENU_PORTAL_MAX_PRODUCTS).toLocaleString("es-AR")} ` +
                      `(${counts.available.toLocaleString("es-AR")} con stock).`}
                  </p>
                )}
                {counts.eligible > MENU_PORTAL_MAX_PRODUCTS ? (
                  <p className="text-xs text-ink-muted">
                    Marcaste {counts.eligible.toLocaleString("es-AR")} y entran hasta{" "}
                    {MENU_PORTAL_MAX_PRODUCTS}: primero los que tienen stock y foto.
                  </p>
                ) : null}
                {counts.eligible > 0 && counts.available === 0 && !store?.hideOutOfStock ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Ninguno tiene stock: se ven como «Sin stock» y no se pueden pedir. Cargá el stock en
                    Productos.
                  </p>
                ) : null}
                {(isCarta && counts.hidden > 0) || counts.noPrice > 0 ? (
                  <p className="text-xs text-ink-muted">
                    {[
                      isCarta && counts.hidden > 0
                        ? `${counts.hidden.toLocaleString("es-AR")} sin «Mostrar en carta web»`
                        : "",
                      counts.noPrice > 0
                        ? `${counts.noPrice.toLocaleString("es-AR")} sin precio no se muestran`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    .
                  </p>
                ) : null}
                {counts.eligible > 0 ? (
                  <p className="text-xs text-ink-muted">
                    {isCarta
                      ? "Para sumar o sacar platos: en Productos, «Mostrar en carta web», y después «Publicar ahora»."
                      : "Para sumar o sacar productos: en Productos, «Mostrar en la tienda web», y después «Publicar ahora»."}{" "}
                    <button
                      type="button"
                      className="font-medium text-brand-700 hover:underline dark:text-brand-400"
                      onClick={() => navigate("/productos")}
                    >
                      Ir a Productos
                    </button>
                  </p>
                ) : null}
              </div>
            ) : null}

            {!waOk && enabled ? (
              <Alert variant="info">
                Cargá el WhatsApp arriba si querés que el cliente te escriba desde la {noun}.
              </Alert>
            ) : null}

            <div className="flex min-w-0 flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !enabled}
                onClick={() => pushNow()}
              >
                <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
                Publicar ahora
              </Button>
              <Button type="button" variant="secondary" disabled={!qrImage} onClick={printCard}>
                <Printer size={16} />
                Imprimir QR
              </Button>
            </div>

            <p className="text-xs text-ink-muted">
              Se actualiza sola cada 3 minutos y al guardar productos. Si cambiaste el link o cargaste
              productos, tocá «Publicar ahora».
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
