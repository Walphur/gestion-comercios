/** Ventanas temporales por dominio — Fase 1 Intelligence Foundation. */
export const INTELLIGENCE_WINDOWS = {
  salesToday: 0,
  salesComparison: 30,
  coverage: 7,
  commercial: 30,
  slowMoving: 60,
  cashRecent: 30,
} as const;

export const DEFAULT_LIST_LIMIT = 10;

/** Filtro interno: productos con cobertura estimada por debajo de N días. */
export const DEFAULT_COVERAGE_THRESHOLD_DAYS = 7;

export const PROFIT_ESTIMATION_NOTE =
  "Utiliza el costo actual del catálogo, no el costo al momento de cada venta.";
