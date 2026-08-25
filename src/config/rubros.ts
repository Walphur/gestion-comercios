import type { FeatureFlags, ProductFields, Rubro } from "../types";
import { isWeightUnit } from "../lib/weightSale";

export interface RubroDefinition {
  id: Rubro;
  label: string;
  description: string;
  icon: string;
  features: FeatureFlags;
  fields: ProductFields;
  /** Atributos de variante (ej: Talle, Color) para el modo ropa. */
  variantAttributes: string[];
  /** Unidades de medida disponibles en la venta. */
  units: string[];
  /** POS: venta por importe ($) o peso (g/kg) en productos a granel. */
  posBulkWeight?: boolean;
  /** Plan sugerido al elegir este rubro. */
  planHint: "basico" | "pro";
  /** Grupo en el selector de Administración. */
  group: "comercio" | "servicios";
}

const ALL_FEATURES: FeatureFlags = {
  pos: true,
  products: true,
  stock: true,
  customers: true,
  reports: true,
  invoicing: true,
};

export function rubroSupportsBulkWeight(rubro: RubroDefinition): boolean {
  if (rubro.posBulkWeight === true) return true;
  return rubro.fields.unitMeasure && rubro.units.some((u) => isWeightUnit(u));
}

export const RUBROS: Record<Rubro, RubroDefinition> = {
  general: {
    id: "general",
    label: "General",
    description: "Para cualquier comercio. Vendé por unidad, por peso (kg) o por monto fijo.",
    icon: "Store",
    features: ALL_FEATURES,
    fields: {
      barcode: true,
      sku: true,
      category: true,
      variants: false,
      unitMeasure: true,
      expiry: true,
      batches: false,
    },
    variantAttributes: [],
    units: ["unidad", "kg", "litro", "metro", "caja", "pack"],
    posBulkWeight: true,
    planHint: "basico",
    group: "comercio",
  },
  kiosco: {
    id: "kiosco",
    label: "Kiosco / Almacén",
    description: "Kiosco o almacén de barrio. Cobrá rápido con código de barras y controlá vencimientos.",
    icon: "Candy",
    features: ALL_FEATURES,
    fields: {
      barcode: true,
      sku: false,
      category: true,
      variants: false,
      unitMeasure: true,
      expiry: true,
      batches: false,
    },
    variantAttributes: [],
    units: ["unidad", "pack", "caja", "kg", "g"],
    posBulkWeight: true,
    planHint: "basico",
    group: "comercio",
  },
  farmacia: {
    id: "farmacia",
    label: "Farmacia",
    description: "Farmacia o droguería. Lotes, fechas de vencimiento y stock por partida.",
    icon: "Pill",
    features: ALL_FEATURES,
    fields: {
      barcode: true,
      sku: true,
      category: true,
      variants: false,
      unitMeasure: true,
      expiry: true,
      batches: true,
    },
    variantAttributes: [],
    units: ["unidad", "caja", "pack"],
    planHint: "basico",
    group: "comercio",
  },
  ropa: {
    id: "ropa",
    label: "Ropa / Indumentaria",
    description: "Tienda de ropa o calzado. Talles y colores, cada uno con su stock.",
    icon: "Shirt",
    features: ALL_FEATURES,
    fields: {
      barcode: true,
      sku: true,
      category: true,
      variants: true,
      unitMeasure: false,
      expiry: false,
      batches: false,
    },
    variantAttributes: ["Talle", "Color"],
    units: ["unidad"],
    planHint: "basico",
    group: "comercio",
  },
  ferreteria: {
    id: "ferreteria",
    label: "Ferretería / Repuestos",
    description: "Ferretería o repuestos. Vendé por unidad, peso o metro.",
    icon: "Wrench",
    features: ALL_FEATURES,
    fields: {
      barcode: true,
      sku: true,
      category: true,
      variants: false,
      unitMeasure: true,
      expiry: false,
      batches: false,
    },
    variantAttributes: [],
    units: ["unidad", "kg", "metro", "litro", "caja"],
    posBulkWeight: true,
    planHint: "basico",
    group: "comercio",
  },
  petshop: {
    id: "petshop",
    label: "Pet shop / Forrajería",
    description: "Pet shop o forrajería. Alimento por kg o por pesos, con vencimientos.",
    icon: "Dog",
    features: ALL_FEATURES,
    fields: {
      barcode: true,
      sku: true,
      category: true,
      variants: false,
      unitMeasure: true,
      expiry: true,
      batches: false,
    },
    variantAttributes: [],
    units: ["kg", "g", "unidad", "bolsa", "saco"],
    posBulkWeight: true,
    planHint: "basico",
    group: "comercio",
  },
  panaderia: {
    id: "panaderia",
    label: "Panadería / Confitería",
    description: "Panadería o confitería. Venta rápida, por unidad o peso, con fechas de elaboración.",
    icon: "Cookie",
    features: ALL_FEATURES,
    fields: {
      barcode: true,
      sku: false,
      category: true,
      variants: false,
      unitMeasure: true,
      expiry: true,
      batches: false,
    },
    variantAttributes: [],
    units: ["unidad", "kg", "docena", "pack"],
    posBulkWeight: true,
    planHint: "basico",
    group: "comercio",
  },
  verduleria: {
    id: "verduleria",
    label: "Verdulería / Frutería",
    description: "Verdulería o frutería. Ideal para vender por kg o por monto fijo.",
    icon: "Leaf",
    features: ALL_FEATURES,
    fields: {
      barcode: false,
      sku: false,
      category: true,
      variants: false,
      unitMeasure: true,
      expiry: false,
      batches: false,
    },
    variantAttributes: [],
    units: ["kg", "g", "unidad", "atado", "cajón"],
    posBulkWeight: true,
    planHint: "basico",
    group: "comercio",
  },
  libreria: {
    id: "libreria",
    label: "Librería / Papelería",
    description: "Librería o papelería. Códigos de barras, categorías y stock por unidad.",
    icon: "BookOpen",
    features: ALL_FEATURES,
    fields: {
      barcode: true,
      sku: true,
      category: true,
      variants: false,
      unitMeasure: true,
      expiry: false,
      batches: false,
    },
    variantAttributes: [],
    units: ["unidad", "pack", "resma", "caja"],
    planHint: "basico",
    group: "comercio",
  },
  electronica: {
    id: "electronica",
    label: "Electrónica / Celulares",
    description: "Electrónica o celulares. Modelos con color/capacidad y número de serie (SKU).",
    icon: "Smartphone",
    features: ALL_FEATURES,
    fields: {
      barcode: true,
      sku: true,
      category: true,
      variants: true,
      unitMeasure: false,
      expiry: false,
      batches: false,
    },
    variantAttributes: ["Color", "Capacidad"],
    units: ["unidad"],
    planHint: "basico",
    group: "comercio",
  },
  taller: {
    id: "taller",
    label: "Taller / Tren delantero",
    description: "Taller mecánico. Repuestos, presupuestos y órdenes de trabajo. Requiere licencia Pro.",
    icon: "Car",
    features: ALL_FEATURES,
    fields: {
      barcode: true,
      sku: true,
      category: true,
      variants: false,
      unitMeasure: true,
      expiry: false,
      batches: false,
    },
    variantAttributes: [],
    units: ["unidad", "juego", "litro", "kg"],
    posBulkWeight: true,
    planHint: "pro",
    group: "servicios",
  },
  estetica: {
    id: "estetica",
    label: "Estética / Peluquería / Barbería",
    description: "Peluquería, barbería o estética. Turnos y venta de productos. Requiere licencia Pro.",
    icon: "Scissors",
    features: ALL_FEATURES,
    fields: {
      barcode: true,
      sku: false,
      category: true,
      variants: false,
      unitMeasure: true,
      expiry: true,
      batches: false,
    },
    variantAttributes: [],
    units: ["servicio", "unidad"],
    planHint: "pro",
    group: "servicios",
  },
  clinica: {
    id: "clinica",
    label: "Clínica / Consultorio",
    description: "Consultorio o clínica. Turnos, pacientes y cobro en mostrador. Requiere licencia Pro.",
    icon: "Stethoscope",
    features: ALL_FEATURES,
    fields: {
      barcode: false,
      sku: true,
      category: true,
      variants: false,
      unitMeasure: true,
      expiry: false,
      batches: false,
    },
    variantAttributes: [],
    units: ["práctica", "unidad", "sesión"],
    planHint: "pro",
    group: "servicios",
  },
};

export const RUBRO_LIST = Object.values(RUBROS);

export const RUBROS_COMERCIO = RUBRO_LIST.filter((r) => r.group === "comercio");
export const RUBROS_SERVICIOS = RUBRO_LIST.filter((r) => r.group === "servicios");

/** Aplica los overrides del admin sobre las features por defecto del rubro. */
export function resolveFeatures(
  rubro: Rubro,
  overrides: Partial<FeatureFlags>,
): FeatureFlags {
  return { ...RUBROS[rubro].features, ...overrides };
}
