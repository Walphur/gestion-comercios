import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Gift, Lightbulb, MessageCircle, Play, Search, Smartphone, Users } from "lucide-react";
import { ChangeList } from "../components/WhatsNewModal";
import { notesFor } from "../lib/whatsNew";
import { formatDateShort } from "../lib/format";
import {
  ANNUAL_PAID_MONTHS,
  formatPriceArs,
  freePlanLimitsText,
  QUARTER_DISCOUNT_PCT,
  suggestedPlanFor,
} from "../config/pricing";
import { Button, Card, PageContent, PageHeader } from "../components/ui";
import GuideVideoModal, { GuideVideoThumb } from "../components/GuideVideoModal";
import {
  GUIDE_VIDEOS,
  MOBILE_GUIDE_URL,
  guideVideosFor,
  visibleHelpTopics,
  type GuideVideo,
  type HelpContext,
} from "../config/helpTopics";
import { openExternalUrl } from "../lib/openExternal";
import { openCommunityGroup, openSalesWhatsApp, openSupportWhatsApp } from "../lib/supportContact";
import { useAppConfig } from "../context/AppConfig";
import { useLicense } from "../context/LicenseContext";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function Help() {
  const { businessName, features, isProModuleActive, rubroDef } = useAppConfig();
  const { status } = useLicense();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<GuideVideo | null>(null);

  const ctx: HelpContext = useMemo(
    () => ({
      rubro: rubroDef,
      features,
      appointments: isProModuleActive("appointments"),
      pro: isProModuleActive,
    }),
    [rubroDef, features, isProModuleActive],
  );

  const topics = useMemo(
    () => visibleHelpTopics(ctx).map((t) => ({ topic: t, tips: t.tips(ctx) })),
    [ctx],
  );

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return topics;
    return topics
      .map(({ topic, tips }) => {
        if (normalize(topic.title).includes(q)) return { topic, tips };
        return { topic, tips: tips.filter((tip) => normalize(tip).includes(q)) };
      })
      .filter((row) => row.tips.length > 0);
  }, [topics, query]);

  const releases = useMemo(
    () => notesFor({ rubroId: rubroDef.id, features }).slice(0, 3),
    [rubroDef.id, features],
  );
  const newsRef = useRef<HTMLDivElement>(null);
  const [params] = useSearchParams();
  const showNews = params.get("ver") === "novedades";
  useEffect(() => {
    if (showNews) newsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showNews]);

  const services = rubroDef.group === "servicios";
  const isFree = status?.billing === "free";
  const isTrial = Boolean(status?.is_trial);
  const plan = suggestedPlanFor(rubroDef.id);

  return (
    <div className="min-h-full">
      <PageHeader
        title="Ayuda"
        subtitle={`Respuestas cortas para ${rubroDef.label.toLowerCase()}. Desde cualquier pantalla, tocá el ? de abajo a la derecha.`}
      />
      <PageContent className="space-y-6">
        <div className="help-search">
          <Search size={18} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={services ? "Ej: comisiones, turno, caja…" : "Ej: fiado, código de barras, arqueo…"}
            aria-label="Buscar en la ayuda"
          />
        </div>

        <div className="help-layout">
          <div className="help-topics">
            {filtered.length === 0 && (
              <Card className="text-sm text-ink-muted">
                No encontramos eso. Probá con otra palabra o escribinos por WhatsApp.
              </Card>
            )}
            {filtered.map(({ topic, tips }) => {
              const Icon = topic.icon;
              return (
                <Card key={topic.id} variant="elevated" className="help-topic">
                  <div className="help-topic__head">
                    <span className="help-topic__icon" aria-hidden>
                      <Icon size={17} />
                    </span>
                    <h2 className="min-w-0 flex-1 truncate font-display text-base font-semibold text-ink">
                      {topic.title}
                    </h2>
                    <Button variant="ghost" size="sm" onClick={() => navigate(topic.to)} title={`Ir a ${topic.title}`}>
                      Ir
                      <ArrowRight size={13} />
                    </Button>
                  </div>
                  <ul className="help-topic__tips">
                    {tips.map((tip) => (
                      <li key={tip}>
                        <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                  {topic.video && (
                    <button
                      type="button"
                      className="help-topic__video"
                      onClick={() => setPlaying(GUIDE_VIDEOS[topic.video!])}
                    >
                      <Play size={13} />
                      Ver el video
                    </button>
                  )}
                </Card>
              );
            })}
          </div>

          <aside className="help-side">
            {releases.length > 0 && (
              <Card variant="elevated" className="help-side__card">
                <div id="novedades" ref={newsRef} className="flex scroll-mt-6 items-center gap-2">
                  <Gift size={16} className="text-brand-600" aria-hidden />
                  <h2 className="font-display text-base font-semibold text-ink">Novedades</h2>
                </div>
                {releases.map((r) => (
                  <div key={r.version} className="min-w-0">
                    <p className="whats-new__version">
                      Versión {r.version} · {formatDateShort(r.date)}
                    </p>
                    <ChangeList compact items={r.items} onGo={(to) => navigate(to)} />
                  </div>
                ))}
              </Card>
            )}

            <Card variant="elevated" className="help-side__card">
              <h2 className="font-display text-base font-semibold text-ink">¿Te trabaste?</h2>
              <p className="text-sm text-ink-muted">
                Escribinos y te ayudamos. El mensaje ya lleva tu versión y tu plan, así vamos directo al punto.
              </p>
              <Button
                className="w-full"
                onClick={() => void openSupportWhatsApp("ayuda", { businessName })}
              >
                <MessageCircle size={16} />
                Escribir por WhatsApp
              </Button>
              <Button variant="secondary" className="w-full" onClick={openCommunityGroup}>
                <Users size={16} />
                Grupo de comerciantes
              </Button>
            </Card>

            {(isFree || isTrial) && (
              <Card variant="elevated" className="help-side__card">
                <h2 className="font-display text-base font-semibold text-ink">Tu plan</h2>
                <p className="text-sm text-ink-muted">
                  {isTrial
                    ? `Estás probando Pro: te ${status?.trial_days_left === 1 ? "queda 1 día" : `quedan ${status?.trial_days_left ?? 7} días`}. Después seguís gratis con ${freePlanLimitsText(rubroDef.id)}, o elegís un plan.`
                    : `Plan gratis: ${freePlanLimitsText(rubroDef.id)}. Si te queda chico, pasate a un plan pago.`}
                </p>
                <p className="text-sm text-ink-muted">
                  Para tu negocio: <strong className="text-ink">{plan.name}</strong>, {formatPriceArs(plan.monthly)} por mes, con{" "}
                  {plan.includes}. Pagando 3 meses juntos, {QUARTER_DISCOUNT_PCT}% menos; pagando el año, 12 meses por el
                  precio de {ANNUAL_PAID_MONTHS}.
                </p>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => void openSalesWhatsApp(`Hola! Quiero saber del plan ${plan.name} de WalQo.`)}
                >
                  Consultar planes
                </Button>
              </Card>
            )}

            <Card variant="elevated" className="help-side__card">
              <h2 className="font-display text-base font-semibold text-ink">Videos cortos</h2>
              <div className="flex min-w-0 flex-col gap-2">
                {guideVideosFor(ctx).map((video) => (
                  <GuideVideoThumb key={video.id} video={video} onPlay={setPlaying} />
                ))}
                <button type="button" className="help-side__link" onClick={() => void openExternalUrl(MOBILE_GUIDE_URL)}>
                  <Smartphone size={14} /> Guía del celular (Android y iPhone)
                </button>
              </div>
            </Card>
          </aside>
        </div>
      </PageContent>
      <GuideVideoModal video={playing} onClose={() => setPlaying(null)} />
    </div>
  );
}
