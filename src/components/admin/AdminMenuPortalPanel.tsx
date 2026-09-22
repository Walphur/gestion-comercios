import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Printer, RefreshCw, UtensilsCrossed } from "lucide-react";
import QRCode from "qrcode";
import { Alert, Button, Input } from "../ui";
import { useAppearance } from "../../context/AppearanceContext";
import {
  getPrintBrandingSettings,
  savePrintBrandingSettings,
} from "../../config/printBranding";
import { copyToClipboard, openExternalUrl } from "../../lib/openExternal";
import { printHtml, escapeHtml } from "../../lib/printHtml";
import { showUserError } from "../../lib/notice";
import {
  getMenuPortalStatus,
  menuPortalUrl,
  pushMenuPortalSnapshot,
  scheduleMenuPortalPush,
  setMenuPortalEnabled,
  setMenuPortalSlug,
  type MenuPortalStatus,
} from "../../lib/menuPortalPush";

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
  const [status, setStatus] = useState<MenuPortalStatus | null>(null);
  const [slugDraft, setSlugDraft] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    const [s, print] = await Promise.all([getMenuPortalStatus(), getPrintBrandingSettings()]);
    setStatus(s);
    setSlugDraft(s.slug);
    setWhatsapp(print.whatsapp);
  }, []);

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
        <p style="font-size:13px;color:#334155">Escaneá el QR para ver la carta y pedir por WhatsApp.</p>
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
              <p className="font-semibold text-ink">Carta en walqo.pro</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                Tus productos con logo · el cliente pide por WhatsApp
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
            label="WhatsApp del negocio"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            onBlur={() => void saveWhatsApp()}
            placeholder="Ej. 11 2345-6789"
            hint={
              waOk
                ? "Con este número el cliente manda el pedido desde la carta."
                : "Sin WhatsApp la carta se ve, pero no se puede pedir."
            }
          />

          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Input
              label="Código en la URL"
              value={slugDraft}
              onChange={(e) => setSlugDraft(e.target.value)}
              placeholder="franti-comidas"
              hint="Solo letras, números y guiones"
            />
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveSlug()}>
              Guardar
            </Button>
          </div>

          <div className="min-w-0">
            <p className="field-label">Link público</p>
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
