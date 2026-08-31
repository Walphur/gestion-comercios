import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Printer, QrCode, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { Alert, Button, Input } from "../ui";
import { useAppearance } from "../../context/AppearanceContext";
import { openExternalUrl } from "../../lib/openExternal";
import { printHtml, escapeHtml } from "../../lib/printHtml";
import {
  getWorkshopPortalStatus,
  pushWorkshopPortalSnapshot,
  setWorkshopPortalEnabled,
  setWorkshopPortalSlug,
  workshopPortalUrl,
  type WorkshopPortalStatus,
} from "../../lib/workshopPortalPush";

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

export default function AdminWorkshopPortalPanel({ businessName, onFlash }: Props) {
  const { logoUrl } = useAppearance();
  const [status, setStatus] = useState<WorkshopPortalStatus | null>(null);
  const [slugDraft, setSlugDraft] = useState("");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const s = await getWorkshopPortalStatus();
    setStatus(s);
    setSlugDraft(s.slug);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const portalUrl = workshopPortalUrl(slugDraft || status?.slug || "taller");

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
      await setWorkshopPortalSlug(slugDraft);
      await setWorkshopPortalEnabled(enabled);
      if (enabled) {
        const err = await pushWorkshopPortalSnapshot();
        await reload();
        onFlash(err ? "Activado, pero no se pudo subir aún" : "Portal del cliente activado · datos subidos");
      } else {
        await reload();
        onFlash("Portal del cliente desactivado");
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveSlug() {
    setBusy(true);
    try {
      const normalized = await setWorkshopPortalSlug(slugDraft);
      setSlugDraft(normalized);
      onFlash("Código del taller guardado");
      if (status?.enabled) {
        const err = await pushWorkshopPortalSnapshot();
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
      await setWorkshopPortalSlug(slugDraft);
      const err = await pushWorkshopPortalSnapshot();
      await reload();
      onFlash(err ? err.slice(0, 80) : "Historial subido al portal web");
    } finally {
      setBusy(false);
    }
  }

  function printCard() {
    const name = businessName.trim() || "Taller";
    const qr = qrImage ?? "";
    const logo = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="" style="max-height:72px;max-width:160px;object-fit:contain;margin:0 auto 10px;display:block"/>`
      : "";
    const body = `
      <div style="text-align:center;padding:8px 4px 4px">
        ${logo}
        <h1 style="font-size:20px;margin:0 0 10px">${escapeHtml(name)}</h1>
        <p style="font-size:13px;color:#334155">Escaneá el QR para ver reparaciones, presupuestos y peritaje de tu vehículo.</p>
        ${qr ? `<img src="${qr}" alt="QR" style="width:220px;height:220px;margin:12px auto;display:block"/>` : "<p>QR no disponible</p>"}
        <p style="font-size:13px">Ingresá tu <strong>patente</strong> o <strong>DNI</strong> en la web.</p>
        <p style="font-size:11px;color:#64748b;word-break:break-all">${escapeHtml(portalUrl)}</p>
        <p style="font-size:10px;color:#94a3b8;margin-top:16px">WalQo · walqo.pro</p>
      </div>
    `;
    printHtml("Tarjeta QR taller", body, "@page { size: A6 portrait; margin: 12mm; }");
  }

  const enabled = status?.enabled ?? false;

  return (
    <div className="space-y-4 min-w-0">
      <div className="wt-alert wt-alert--info min-w-0">
        <p className="m-0 leading-relaxed">
          Imprimí una tarjeta con QR para el cliente. Al escanearla entra a walqo.pro/taller,
          pone su patente o DNI y ve reparaciones, presupuestos y el peritaje de ingreso.
          Usa el logo de Configuración → Apariencia. Esta PC sube los datos sola cada 3 minutos.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--color-panel-border)] p-4 min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex items-start gap-3">
            <QrCode className="shrink-0 mt-0.5 text-[var(--color-accent)]" size={22} />
            <div className="min-w-0">
              <p className="font-semibold text-ink">Portal web del cliente</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                QR fijo para todos — cada cliente busca con su patente o documento.
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer select-none">
            <span className="text-sm text-ink-muted">{enabled ? "Activado" : "Apagado"}</span>
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
            label="Código del taller (URL)"
            value={slugDraft}
            onChange={(e) => setSlugDraft(e.target.value)}
            placeholder="mi-taller"
            hint={`walqo.pro/taller/?t=${slugDraft || "mi-taller"}`}
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
                alt="QR portal taller"
                className="h-[200px] w-[200px] rounded-lg border border-[var(--color-panel-border)] bg-white p-2"
              />
            ) : (
              <div className="h-[200px] w-[200px] rounded-lg border border-dashed border-[var(--color-panel-border)] flex items-center justify-center text-ink-muted text-sm">
                Generando QR…
              </div>
            )}
            <p className="text-xs text-ink-muted text-center max-w-[220px] break-all">{portalUrl}</p>
          </div>

          <div className="space-y-3 min-w-0">
            <div className="grid gap-2 text-sm min-w-0 sm:grid-cols-2">
              <div className="min-w-0 rounded-lg bg-[var(--color-panel-muted)] px-3 py-2">
                <p className="text-xs uppercase text-ink-muted">Última subida</p>
                <p className="font-medium truncate">{formatWhen(status?.lastPushAt ?? null)}</p>
              </div>
              <div className="min-w-0 rounded-lg bg-[var(--color-panel-muted)] px-3 py-2">
                <p className="text-xs uppercase text-ink-muted">Estado</p>
                <p className="font-medium truncate">
                  {status?.lastError ? "Con error" : enabled ? "Listo" : "Inactivo"}
                </p>
              </div>
            </div>

            {status?.lastError ? <Alert variant="warning">{status.lastError}</Alert> : null}

            <div className="flex flex-wrap gap-2 min-w-0">
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
                Imprimir tarjeta QR
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void openExternalUrl(portalUrl).catch(() => undefined)}
              >
                <ExternalLink size={16} />
                Abrir portal
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
