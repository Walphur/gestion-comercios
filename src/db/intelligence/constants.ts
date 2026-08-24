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

/** Umbrales Fase 2 — Alert Rules (fijos; configurables vía settings en futuro). */
export const ALERT_THRESHOLDS = {
  /** Caída de facturación 30d vs 30d anterior (%). */
  salesDropPct: -15,
  /** Caída de unidades vendidas (%). */
  unitsDropPct: -15,
  /** Margen estimado en ventas por debajo de este % → alerta. */
  minSoldMarginPct: 12,
  /** Diferencia catálogo vs vendido (p.p.) para margen deteriorado. */
  marginDropVsCatalogPp: 8,
  /** Cobertura estimada ≤ N días → crítico. */
  coverageCriticalDays: 3,
  /** Deuda mínima para alertar cliente. */
  customerDebtMin: 500,
  /** Diferencia de caja absoluta ($) en arqueo reciente. */
  cashDifferenceMin: 50,
  /** Máximo de alertas por producto/cliente listadas. */
  maxPerItemAlerts: 8,
} as const;
