import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Printer, RefreshCw, UtensilsCrossed } from "lucide-react";
import QRCode from "qrcode";
import { Alert, Button, Input } from "../ui";
import { useAppearance } from "../../context/AppearanceContext";
import { openExternalUrl } from "../../lib/openExternal";
import { printHtml, escapeHtml } from "../../lib/printHtml";
import {
  getMenuPortalStatus,
  menuPortalUrl,
  pushMenuPortalSnapshot,
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
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const s = await getMenuPortalStatus();
    setStatus(s);
    setSlugDraft(s.slug);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const portalUrl = menuPortalUrl(slugDraft || status?.slug || "carta");

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(portalUrl, {
      width: 280,
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
        onFlash(err ? "Activado, pero no se pudo subir aún" : "Carta web activada · productos publicados");
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
      onFlash("Código de la carta guardado");
      if (status?.enabled) {
        const err = await pushMenuPortalSnapshot();
        await reload();
        if (err) onFlash(err.slice(0, 80));
      }
    } finally {
      setBusy(false);
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

  return (
    <div className="space-y-4 min-w-0">
      <div className="wt-alert wt-alert--info min-w-0">
        <p className="m-0 leading-relaxed">
          Publicá tu carta en internet: los productos que cargás en WalQo aparecen en{" "}
          <strong>walqo.pro/carta</strong> con tu logo. El cliente arma un pedido y te lo manda por
          WhatsApp. Poné el número en Configuración → Apariencia (WhatsApp del ticket). Esta PC
          actualiza sola cada 3 minutos y al guardar productos.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--color-panel-border)] p-4 min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex items-start gap-3">
            <UtensilsCrossed className="shrink-0 mt-0.5 text-[var(--color-accent)]" size={22} />
            <div className="min-w-0">
              <p className="font-semibold text-ink">Carta web pública</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Link y QR para mesas / Instagram / WhatsApp del local.
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer select-none">
            <span className="text-sm text-ink-muted">{enabled ? "Publicada" : "Apagada"}</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--color-accent)]"
              checked={enabled}
              disabled={busy || status == null}
              onChange={(e) => void toggle(e.target.checked)}
            />
          </label>
        </div>

        <div className="grid gap-3 min-w-0 sm:grid-cols-[1fr_auto] sm:items-end">
          <Input
            label="Código de la carta (URL)"
            value={slugDraft}
            onChange={(e) => setSlugDraft(e.target.value)}
            placeholder="los-tanos"
            hint={`walqo.pro/carta/?t=${slugDraft || "los-tanos"}`}
          />
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveSlug()}>
            Guardar código
          </Button>
        </div>

        <div className="grid gap-4 min-w-0 lg:grid-cols-[auto_1fr] lg:items-start">
          <div className="flex flex-col items-center gap-2 shrink-0 mx-auto lg:mx-0">
            {qrImage ? (
              <img
                src={qrImage}
                alt="QR carta"
                className="h-[200px] w-[200px] rounded-lg border border-[var(--color-panel-border)] bg-white p-2"
              />
            ) : (
              <div className="flex h-[200px] w-[200px] items-center justify-center rounded-lg border border-dashed border-[var(--color-panel-border)] text-sm text-ink-muted">
                Generando QR…
              </div>
            )}
            <p className="max-w-[220px] break-all text-center text-xs text-ink-muted">{portalUrl}</p>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="grid min-w-0 gap-2 text-sm sm:grid-cols-2">
              <div className="min-w-0 rounded-lg bg-[var(--color-panel-muted)] px-3 py-2">
                <p className="text-xs uppercase text-ink-muted">Última subida</p>
                <p className="truncate font-medium">{formatWhen(status?.lastPushAt ?? null)}</p>
              </div>
              <div className="min-w-0 rounded-lg bg-[var(--color-panel-muted)] px-3 py-2">
                <p className="text-xs uppercase text-ink-muted">Estado</p>
                <p className="truncate font-medium">
                  {status?.lastError ? "Con error" : enabled ? "Listo" : "Inactivo"}
                </p>
              </div>
            </div>

            {status?.lastError ? <Alert variant="warning">{status.lastError}</Alert> : null}

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
              <Button
                type="button"
                variant="ghost"
                onClick={() => void openExternalUrl(portalUrl).catch(() => undefined)}
              >
                <ExternalLink size={16} />
                Abrir carta
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
