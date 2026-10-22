import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { Copy, MessageCircle, Smartphone, Unlink } from "lucide-react";
import { Button, Input, Modal, Select } from "../ui";
import TablesTrialNotice from "./TablesTrialNotice";
import type { StaffUser } from "../../db/users";
import { getMenuPortalStatus } from "../../lib/menuPortalPush";
import {
  allowedWaiterIds,
  createWaiterLink,
  getCachedWaiterLinks,
  listWaiterLinks,
  revokeWaiterLink,
  subscribeWaiterLinks,
  type WaiterLink,
} from "../../lib/waiterPhones";
import { FREE_MAX_WAITER_PHONES } from "../../config/pricing";
import { copyToClipboard, openWhatsApp, openWhatsAppShare } from "../../lib/openExternal";
import { confirmAction } from "../../lib/confirm";
import { showFlash, showUserError } from "../../lib/notice";

const OTHER = "other";

function seenLabel(l: WaiterLink, now: number): string {
  if (!l.last_seen_at) return "Todavía no lo abrió";
  const min = Math.max(0, Math.floor((now - Date.parse(l.last_seen_at)) / 60_000));
  if (min < 15) return "Usándolo ahora";
  if (min < 60) return `Lo usó hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `Lo usó hace ${h} h` : `Lo usó hace ${Math.floor(h / 24)} días`;
}

export default function WaiterPhonesModal({
  open,
  onClose,
  unlimited,
  staff,
  businessName,
}: {
  open: boolean;
  onClose: () => void;
  unlimited: boolean;
  staff: StaffUser[];
  businessName: string;
}) {
  const links = useSyncExternalStore(subscribeWaiterLinks, getCachedWaiterLinks);
  const [portalOn, setPortalOn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<string>("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ link: WaiterLink; url: string; qr: string; phone: string | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setPick("");
    setName("");
    let alive = true;
    void (async () => {
      const status = await getMenuPortalStatus().catch(() => null);
      if (!alive) return;
      setPortalOn(Boolean(status?.enabled));
      if (!status?.enabled) return;
      setLoading(true);
      try {
        await listWaiterLinks();
      } catch (e) {
        if (alive) showUserError(e, "No se pudieron traer los celulares vinculados");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const list = links ?? [];
  const allowed = allowedWaiterIds(list, unlimited);
  const atLimit = !unlimited && list.length >= FREE_MAX_WAITER_PHONES;
  const now = Date.now();
  const linkedUsers = new Set(list.map((l) => l.user_id).filter((id): id is number => typeof id === "number"));

  async function generate() {
    const user = pick && pick !== OTHER ? staff.find((s) => String(s.id) === pick) : undefined;
    const finalName = user ? user.display_name : name.trim();
    if (finalName.length < 2) {
      showUserError("Elegí el mozo o escribí su nombre.", "Falta el mozo");
      return;
    }
    setBusy(true);
    try {
      const { link, url } = await createWaiterLink(finalName, user?.id ?? null);
      const qr = await QRCode.toDataURL(url, { width: 320, margin: 1, errorCorrectionLevel: "M" });
      setCreated({ link, url, qr, phone: user?.phone?.trim() || null });
      setPick("");
      setName("");
    } catch (e) {
      showUserError(e, "No se pudo generar el enlace");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(l: WaiterLink) {
    const ok = await confirmAction({
      title: "Desvincular celular",
      message: `¿Desvincular el celular de ${l.name}?`,
      detail: "Deja de ver las mesas y de mandar comandas enseguida. Para volver a usarlo, generá un enlace nuevo.",
      variant: "danger",
      confirmLabel: "Sí, desvincular",
    });
    if (!ok) return;
    try {
      await revokeWaiterLink(l.id);
      if (created?.link.id === l.id) setCreated(null);
      showFlash({ message: `Listo: el celular de ${l.name} quedó desvinculado.` });
    } catch (e) {
      showUserError(e, "No se pudo desvincular");
    }
  }

  async function share() {
    if (!created) return;
    const text = `Hola ${created.link.name}! Abrí este enlace en tu celular para tomar los pedidos de las mesas de ${businessName}: ${created.url}`;
    if (created.phone) await openWhatsApp(created.phone, text);
    else await openWhatsAppShare(text);
  }

  return (
    <Modal
      open={open}
      title="Mozos desde el celular"
      subtitle="Cada mozo ve las mesas y manda los pedidos a cocina desde su celular."
      onClose={onClose}
      icon={<Smartphone size={20} />}
    >
      <div className="min-w-0 space-y-4">
        {portalOn === false ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-100">
            El celular del mozo usa la carta de tu tienda web. Prendela en Configuración → Tienda web y volvé a abrir esta
            ventana.
          </p>
        ) : null}

        {created ? (
          <div className="min-w-0 rounded-xl border border-emerald-500/40 bg-emerald-500/[0.07] p-3">
            <p className="text-sm font-semibold text-ink">Enlace de {created.link.name}</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Que lo escanee con la cámara del celular. Se muestra una sola vez: si lo pierde, desvinculalo y generá otro.
            </p>
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3">
              <img
                src={created.qr}
                alt={`QR para el celular de ${created.link.name}`}
                className="h-40 w-40 shrink-0 rounded-lg bg-white p-1.5"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="break-all rounded-lg bg-[var(--color-input-bg)] px-2 py-1.5 font-mono text-[11px] text-ink-muted">
                  {created.url}
                </p>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void copyToClipboard(created.url)
                        .then(() => showFlash({ message: "Enlace copiado" }))
                        .catch(showUserError)
                    }
                  >
                    <Copy size={14} /> Copiar enlace
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void share()}>
                    <MessageCircle size={14} /> Mandar por WhatsApp
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {portalOn ? (
          <>
            <section className="min-w-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Celulares vinculados</p>
              {loading && list.length === 0 ? (
                <p className="text-sm text-ink-muted">Cargando…</p>
              ) : list.length === 0 ? (
                <p className="text-sm text-ink-muted">Todavía no vinculaste ningún celular.</p>
              ) : (
                <ul className="min-w-0 divide-y divide-[var(--color-panel-border)] rounded-xl border border-[var(--color-panel-border)]">
                  {list.map((l) => (
                    <li key={l.id} className="flex min-w-0 items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{l.name}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {allowed.has(l.id) ? seenLabel(l, now) : "En pausa: con WalQo Completo vuelve a andar"}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => void revoke(l)}>
                        <Unlink size={14} /> Desvincular
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {atLimit ? (
              <TablesTrialNotice kind="waiterPhones" />
            ) : (
              <section className="min-w-0 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Vincular un celular</p>
                <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <Select label="Mozo" value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">Elegí…</option>
                    {staff
                      .filter((s) => !linkedUsers.has(s.id))
                      .map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.display_name}
                        </option>
                      ))}
                    <option value={OTHER}>Otro (escribo el nombre)</option>
                  </Select>
                  {pick === OTHER ? (
                    <Input
                      label="Nombre del mozo"
                      value={name}
                      maxLength={40}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void generate();
                      }}
                      autoFocus
                    />
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-xs text-ink-muted">
                    Lo que manda el mozo sale directo a cocina con su nombre. El precio es siempre el de la caja.
                  </p>
                  <Button onClick={() => void generate()} loading={busy} disabled={!pick}>
                    Generar enlace
                  </Button>
                </div>
                {!unlimited ? <TablesTrialNotice kind="waiterPhones" /> : null}
              </section>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
