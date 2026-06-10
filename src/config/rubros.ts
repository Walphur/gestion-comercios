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
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: true, sku: true, category: true, variants: false, unitMeasure: true },
    variantAttributes: [],
    units: ["unidad", "kg", "litro", "metro", "caja", "pack"],
    posBulkWeight: true,
    planHint: "basico",
    group: "comercio",
  },
  kiosco: {
    id: "kiosco",
    label: "Kiosco / Almacén",
    description: "Kiosco o almacén de barrio. Cobrá rápido con código de barras.",
    icon: "Candy",
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: true, sku: false, category: true, variants: false, unitMeasure: true },
    variantAttributes: [],
    units: ["unidad", "pack", "caja", "kg", "g"],
    posBulkWeight: true,
    planHint: "basico",
    group: "comercio",
  },
  farmacia: {
    id: "farmacia",
    label: "Farmacia",
    description: "Farmacia o droguería. Stock, lotes y fechas de vencimiento.",
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
    description: "Tienda de ropa. Talles y colores, cada uno con su stock.",
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
    description: "Ferretería o repuestos. Vendé por unidad, peso o metro.",
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
    description: "Pet shop o forrajería. Ideal para vender alimento por kg o por pesos.",
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
    description: "Taller mecánico. Repuestos, presupuestos y órdenes de trabajo. Requiere licencia Pro.",
    icon: "Car",
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: true, sku: true, category: true, variants: false, unitMeasure: true },
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
    description: "Consultorio o clínica. Turnos, pacientes y cobro en mostrador. Requiere licencia Pro.",
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
