import type { FeatureFlags, ProductFields, Rubro } from "../types";

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

export function rubroSupportsBulkWeight(rubro: RubroDefinition): boolean {
  return rubro.posBulkWeight === true;
}

export const RUBROS: Record<Rubro, RubroDefinition> = {
  general: {
    id: "general",
    label: "General",
    description: "Configuración flexible que sirve para cualquier tipo de comercio.",
    icon: "Store",
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: true, sku: true, category: true, variants: false, unitMeasure: true },
    variantAttributes: [],
    units: ["unidad", "kg", "litro", "metro", "caja", "pack"],
    planHint: "basico",
    group: "comercio",
  },
  kiosco: {
    id: "kiosco",
    label: "Kiosco / Almacén",
    description: "Venta rápida por código de barras. Ideal para alta rotación.",
    icon: "Candy",
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: true, sku: false, category: true, variants: false, unitMeasure: false },
    variantAttributes: [],
    units: ["unidad", "pack", "caja"],
    planHint: "basico",
    group: "comercio",
  },
  farmacia: {
    id: "farmacia",
    label: "Farmacia",
    description: "Venta por unidad, lotes y vencimientos. Ideal para mostrador y control de stock.",
    icon: "Pill",
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: true, sku: true, category: true, variants: false, unitMeasure: true },
    variantAttributes: [],
    units: ["unidad", "caja", "pack"],
    planHint: "basico",
    group: "comercio",
  },
  ropa: {
    id: "ropa",
    label: "Ropa / Indumentaria",
    description: "Manejo de talles y colores con stock por variante.",
    icon: "Shirt",
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: true, sku: true, category: true, variants: true, unitMeasure: false },
    variantAttributes: ["Talle", "Color"],
    units: ["unidad"],
    planHint: "basico",
    group: "comercio",
  },
  ferreteria: {
    id: "ferreteria",
    label: "Ferretería / Repuestos",
    description: "Venta fraccionada por peso o medida y códigos de proveedor.",
    icon: "Wrench",
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: true, sku: true, category: true, variants: false, unitMeasure: true },
    variantAttributes: [],
    units: ["unidad", "kg", "metro", "litro", "caja"],
    posBulkWeight: true,
    planHint: "basico",
    group: "comercio",
  },
  petshop: {
    id: "petshop",
    label: "Pet shop / Forrajería",
    description:
      "Alimentos a granel: vendé por peso (g/kg) o por importe (ej. $8.000 de Nutri al precio por kg).",
    icon: "Dog",
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: true, sku: true, category: true, variants: false, unitMeasure: true },
    variantAttributes: [],
    units: ["kg", "g", "unidad", "bolsa", "saco"],
    posBulkWeight: true,
    planHint: "basico",
    group: "comercio",
  },
  taller: {
    id: "taller",
    label: "Taller / Tren delantero",
    description: "Repuestos + servicio mecánico. Recomendado con plan Pro (presupuestos, OT, turnos).",
    icon: "Car",
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: true, sku: true, category: true, variants: false, unitMeasure: true },
    variantAttributes: [],
    units: ["unidad", "juego", "litro", "kg"],
    planHint: "pro",
    group: "servicios",
  },
  estetica: {
    id: "estetica",
    label: "Estética / Peluquería / Barbería",
    description: "Servicios por turno y productos de venta. Activa agenda y presupuestos en Pro.",
    icon: "Scissors",
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: false, sku: false, category: true, variants: false, unitMeasure: false },
    variantAttributes: [],
    units: ["servicio", "unidad"],
    planHint: "pro",
    group: "servicios",
  },
  clinica: {
    id: "clinica",
    label: "Clínica / Consultorio",
    description: "Atención por turnos, presupuestos de prácticas y cobro en mostrador.",
    icon: "Stethoscope",
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: false, sku: false, category: true, variants: false, unitMeasure: false },
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
