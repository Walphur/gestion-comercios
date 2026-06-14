/** Funciones del plan Pro (módulo de pago / desbloqueo). */
export type ProModuleKey =
  | "quotes"
  | "appointments"
  | "delivery_notes"
  | "service_orders";

export interface ProModuleDefinition {
  key: ProModuleKey;
  label: string;
  description: string;
  /** Ruta en el menú cuando está activo. */
  route: string;
  /** Rubros donde tiene más sentido (sugerencia al activar). */
  suggestedFor: string[];
}

export const PRO_MODULES: ProModuleDefinition[] = [
  {
    key: "quotes",
    label: "Presupuestos",
    description:
      "Cotizaciones para ventas grandes, obras, taller o clínica. Convertí a venta cuando el cliente aprueba.",
    route: "/presupuestos",
    suggestedFor: ["ferretería", "forrajería", "taller", "clínica", "estética"],
  },
  {
    key: "appointments",
    label: "Turnos / Agenda",
    description: "Reservas por día y profesional: taller, veterinaria, peluquería, barbería, estética, consultorio.",
    route: "/turnos",
    suggestedFor: ["taller", "veterinaria", "peluquería", "clínica"],
  },
  {
    key: "delivery_notes",
    label: "Remitos",
    description: "Salida de mercadería o repuestos sin factura inmediata (depósito, taller, distribución).",
    route: "/remitos",
    suggestedFor: ["repuestos", "ferretería", "taller", "distribuidor"],
  },
  {
    key: "service_orders",
    label: "Órdenes de servicio",
    description: "Trabajo en curso con estados: presupuesto → en reparación → listo → entregado.",
    route: "/ordenes",
    suggestedFor: ["taller", "tren delantero", "service mecánico"],
  },
];

export const BASIC_PLAN_FEATURES = [
  "Punto de venta y caja",
  "Productos, stock y clientes",
  "Reportes y empleados",
  "Actualizaciones y centro de ayuda",
  "Soporte por WhatsApp",
  "Rubros: kiosco, farmacia, ferretería, pet shop, etc.",
] as const;

export type ProModulesState = Record<ProModuleKey, boolean>;

export const DEFAULT_PRO_MODULES: ProModulesState = {
  quotes: false,
  appointments: false,
  delivery_notes: false,
  service_orders: false,
};

export function parseProModules(json: string | undefined): ProModulesState {
  try {
    const raw = JSON.parse(json ?? "{}") as Partial<ProModulesState>;
    return { ...DEFAULT_PRO_MODULES, ...raw };
  } catch {
    return { ...DEFAULT_PRO_MODULES };
  }
}

export function proModuleEnabled(
  proPlan: boolean,
  modules: ProModulesState,
  key: ProModuleKey,
): boolean {
  return proPlan && modules[key];
}

export function activeProModuleLabels(
  proPlan: boolean,
  modules: ProModulesState,
): string[] {
  if (!proPlan) return [];
  return PRO_MODULES.filter((m) => modules[m.key]).map((m) => m.label);
}
