import { useState } from "react";
import { Brain, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Alert, Button, Card } from "./ui";
import type { BusinessInterpretation } from "../db/intelligence/interpretationTypes";
import {
  BiIaError,
  clearCachedInterpretation,
  interpretBusinessIntelligence,
  loadCachedInterpretation,
  saveCachedInterpretation,
} from "../lib/biIaApi";

export function BusinessInterpretationPanel({
  computedAt,
  payload,
  onGenerated,
}: {
  computedAt: string;
  payload: unknown;
  onGenerated?: (interpretation: BusinessInterpretation) => void;
}) {
  const [interpretation, setInterpretation] = useState<BusinessInterpretation | null>(() =>
    loadCachedInterpretation(computedAt),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(force = false) {
    if (force) clearCachedInterpretation();
    setLoading(true);
    setError(null);
    try {
      const result = await interpretBusinessIntelligence(payload);
      setInterpretation(result);
      saveCachedInterpretation(computedAt, result);
      onGenerated?.(result);
    } catch (e) {
      const msg =
        e instanceof BiIaError
          ? e.message
          : e instanceof Error
            ? e.message
            : "No se pudo interpretar.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="min-w-0">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Brain size={20} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-ink">Interpretación IA</h2>
            <p className="text-xs text-ink-muted">
              Explica en lenguaje simple lo que ya calculó tu comercio — la IA no recalcula stock ni ventas.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          disabled={loading}
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

      {error && (
        <Alert variant="danger" className="mb-3">
          {error}
          {error.includes("no disponible") && (
            <span className="block text-xs opacity-90">Requiere conexión a internet.</span>
          )}
        </Alert>
      )}

      {!interpretation && !loading && !error && (
        <p className="rounded-xl border border-dashed border-[var(--color-panel-border)] px-3 py-4 text-sm text-ink-muted">
          Tocá <strong>Generar interpretación</strong> para obtener un resumen en lenguaje natural basado en tus
          métricas, alertas y acciones de hoy.
        </p>
      )}

      {interpretation && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink">{interpretation.summary}</p>

          {interpretation.priorities.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Prioridades sugeridas
              </h3>
              <ul className="list-inside list-decimal space-y-1 text-sm text-ink">
                {interpretation.priorities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
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
