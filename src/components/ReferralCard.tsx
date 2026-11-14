import { useState } from "react";
import { Copy, Gift, Loader2, Share2 } from "lucide-react";
import { Button, Card } from "./ui";
import { getReferral, referralMessage, type ReferralInfo } from "../lib/referral";
import { copyToClipboard, openWhatsAppShare } from "../lib/openExternal";

/** «Recomendá WalQo»: 1 mes gratis por cada comercio recomendado que se suscribe. */
export default function ReferralCard() {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function load() {
    setError("");
    setLoading(true);
    try {
      setInfo(await getReferral());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function share() {
    if (!info) return;
    const { copied: wasCopied } = await openWhatsAppShare(referralMessage(info.code));
    if (wasCopied) alert("El mensaje se copió. Pegalo en WhatsApp.");
  }

  async function copy() {
    if (!info) return;
    await copyToClipboard(referralMessage(info.code));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card variant="elevated" className="help-side__card">
      <div className="flex items-center gap-2">
        <Gift size={16} className="text-brand-600" aria-hidden />
        <h2 className="font-display text-base font-semibold text-ink">Recomendá y ganá 1 mes</h2>
      </div>
      <p className="text-sm text-ink-muted">
        Pasale tu código a otro comercio. Cuando se suscribe, vos tenés 1 mes gratis de tu plan. Sin tope.
      </p>
      {!info && (
        <Button variant="secondary" className="w-full" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />}
          Ver mi código
        </Button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {info && (
        <>
          <p className="rounded-xl bg-brand-500/10 py-2 text-center font-display text-2xl font-bold tracking-widest text-ink">
            {info.code}
          </p>
          <p className="text-xs text-ink-muted">
            {info.invited === 0
              ? "Todavía nadie se registró con tu código."
              : `${info.invited} ${info.invited === 1 ? "comercio se registró" : "comercios se registraron"} con tu código. ${
                  info.paying === 0
                    ? "Cuando se suscriban, ganás tu mes."
                    : `Ganaste ${info.paying} ${info.paying === 1 ? "mes gratis" : "meses gratis"}: escribinos y te lo sumamos.`
                }`}
          </p>
          <Button className="w-full" onClick={() => void share()}>
            <Share2 size={16} />
            Compartir por WhatsApp
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => void copy()}>
            <Copy size={16} />
            {copied ? "¡Copiado!" : "Copiar mensaje"}
          </Button>
        </>
      )}
    </Card>
  );
}
