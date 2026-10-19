import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Lightbulb, MessageCircle, Play, Search, Smartphone, Users } from "lucide-react";
import { Button, Card, PageContent, PageHeader } from "../components/ui";
import {
  GUIDE_VIDEOS,
  MOBILE_GUIDE_URL,
  visibleHelpTopics,
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

  const services = rubroDef.group === "servicios";
  const isFree = status?.billing === "free";
  const isTrial = Boolean(status?.is_trial);

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
                      onClick={() => void openExternalUrl(topic.video!)}
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
                    ? `Estás probando Pro: te ${status?.trial_days_left === 1 ? "queda 1 día" : `quedan ${status?.trial_days_left ?? 7} días`}. Después seguís gratis con 25 productos y 50 ventas por mes, o elegís un plan.`
                    : "Plan gratis: hasta 25 productos y 50 ventas por mes. Si te queda chico, pasate a un plan pago."}
                </p>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => void openSalesWhatsApp("Hola! Quiero saber qué plan de WalQo me conviene.")}
                >
                  Consultar planes
                </Button>
              </Card>
            )}

            <Card variant="elevated" className="help-side__card">
              <h2 className="font-display text-base font-semibold text-ink">Videos cortos</h2>
              <div className="flex flex-col gap-1.5">
                {!services && (
                  <button type="button" className="help-side__link" onClick={() => void openExternalUrl(GUIDE_VIDEOS.producto)}>
                    <Play size={14} /> Cargar un producto
                  </button>
                )}
                {features.pos && rubroDef.id !== "clinica" && (
                  <button type="button" className="help-side__link" onClick={() => void openExternalUrl(GUIDE_VIDEOS.venta)}>
                    <Play size={14} /> Hacer una venta
                  </button>
                )}
                {!services && (
                  <button type="button" className="help-side__link" onClick={() => void openExternalUrl(GUIDE_VIDEOS.tiendanube)}>
                    <Play size={14} /> Conectar Tienda Nube
                  </button>
                )}
                <button type="button" className="help-side__link" onClick={() => void openExternalUrl(MOBILE_GUIDE_URL)}>
                  <Smartphone size={14} /> WalQo en el celular
                </button>
              </div>
            </Card>
          </aside>
        </div>
      </PageContent>
    </div>
  );
}
