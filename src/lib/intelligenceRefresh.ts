const EVENT = "walqo:intelligence-data-changed";

/** Avisá que cambió algo relevante para el snapshot de Inteligencia (venta, stock, clientes, sync). */
export function notifyIntelligenceDataChanged(reason?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { reason } }));
}

/** Escuchá cambios de datos para refrescar /asistente sin polling agresivo. */
export function onIntelligenceDataChanged(handler: (reason?: string) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ reason?: string }>).detail;
    handler(detail?.reason);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
