import { useEffect, useState } from "react";
import { Brain, Loader2, RefreshCw, Sparkles, WifiOff } from "lucide-react";
import { Alert, Button, Card } from "./ui";
import type { BusinessInterpretation } from "../db/intelligence/interpretationTypes";
import type { IaPayload } from "../db/intelligence/iaPayload";
import type { BusinessAction } from "../db/intelligence/actionTypes";
import {
  BiIaError,
  clearCachedInterpretation,
  interpretBusinessIntelligence,
  isOffline,
  loadCachedInterpretation,
  saveCachedInterpretation,
} from "../lib/biIaApi";

export function BusinessInterpretationPanel({
  payload,
  actions,
}: {
  payload: IaPayload;
  actions: BusinessAction[];
}) {
  const [interpretation, setInterpretation] = useState<BusinessInterpretation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(isOffline());

  useEffect(() => {
    let cancelled = false;
    void loadCachedInterpretation(payload).then((cached) => {
      if (!cancelled) setInterpretation(cached);
    });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  useEffect(() => {
    const sync = () => setOffline(isOffline());
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  async function generate(force = false) {
    if (offline) {
      setError("Sin conexión a Internet. La interpretación IA estará disponible cuando tengas conexión.");
      return;
    }
    if (force) clearCachedInterpretation();
    setLoading(true);
    setError(null);
    try {
      const result = await interpretBusinessIntelligence(payload);
      setInterpretation(result);
      await saveCachedInterpretation(payload, result);
    } catch (e) {
      const msg =
        e instanceof BiIaError
          ? e.userMessage
          : e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : "No se pudo interpretar.";
      setError(msg);
      setInterpretation(null);
    } finally {
      setLoading(false);
    }
  }

  const explanationByIndex = new Map(
    (interpretation?.action_explanations ?? []).map((e) => [e.action_index, e.explanation]),
  );

  return (
    <Card className="min-w-0">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Brain size={20} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-ink">Interpretación IA</h2>
            <p className="text-xs text-ink-muted">
              Explica lo que ya calculó WalQo — no recalcula stock, ventas ni prioridades.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {error && (
            <Button type="button" variant="secondary" disabled={loading || offline} onClick={() => generate(true)}>
              Reintentar interpretación
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={loading || offline}
            onClick={() => generate(Boolean(interpretation))}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Interpretando…
              </>
            ) : interpretation ? (
              <>
                <RefreshCw size={16} />
                Actualizar
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generar interpretación
              </>
            )}
          </Button>
        </div>
      </div>

      {offline && (
        <Alert variant="info" className="mb-3">
          <WifiOff size={16} className="shrink-0" />
          <span>
            Sin conexión a Internet. La Inteligencia y las acciones funcionan normalmente; la interpretación IA
            estará disponible cuando tengas conexión.
          </span>
        </Alert>
      )}

      {error && (
        <Alert variant="danger" className="mb-3">
          {error}
        </Alert>
      )}

      {!interpretation && !loading && !error && !offline && (
        <p className="rounded-xl border border-dashed border-[var(--color-panel-border)] px-3 py-4 text-sm text-ink-muted">
          Tocá <strong>Generar interpretación</strong> para obtener un resumen en lenguaje natural basado en tus
          métricas, alertas y acciones de hoy. Requiere conexión a Internet.
        </p>
      )}

      {interpretation && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink">{interpretation.summary}</p>

          {interpretation.action_explanations.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Explicación de tus acciones
              </h3>
              <ul className="space-y-2 text-sm">
                {actions.map((action, index) => {
                  const explanation = explanationByIndex.get(index);
                  if (!explanation) return null;
                  return (
                    <li key={action.id} className="rounded-lg border border-[var(--color-panel-border)] px-3 py-2">
                      <span className="font-semibold text-ink">
                        {index + 1}. {action.title}
                      </span>
                      <p className="mt-0.5 text-ink-muted">{explanation}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {interpretation.insights.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Observaciones
              </h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-ink-muted">
                {interpretation.insights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {interpretation.caveats.length > 0 && (
            <Alert variant="info">
              <ul className="list-inside list-disc space-y-0.5 text-sm">
                {interpretation.caveats.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Alert>
          )}

          <p className="text-[10px] text-ink-muted">
            Generado {new Date(interpretation.generated_at).toLocaleString("es-AR")}
            {interpretation.model ? ` · ${interpretation.model}` : ""}
          </p>
        </div>
      )}
    </Card>
  );
}
