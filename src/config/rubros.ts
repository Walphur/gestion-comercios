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
  },
  petshop: {
    id: "petshop",
    label: "Pet shop / Veterinaria / Forrajería",
    description:
      "Alimentos a granel: vendé por peso (g/kg) o por importe (ej. $8.000 de Nutri al precio por kg).",
    icon: "Dog",
    features: { pos: true, products: true, stock: true, customers: true, reports: true, invoicing: true },
    fields: { barcode: true, sku: true, category: true, variants: false, unitMeasure: true },
    variantAttributes: [],
    units: ["kg", "g", "unidad", "bolsa", "saco"],
    posBulkWeight: true,
  },
};

export const RUBRO_LIST = Object.values(RUBROS);

/** Aplica los overrides del admin sobre las features por defecto del rubro. */
export function resolveFeatures(
  rubro: Rubro,
  overrides: Partial<FeatureFlags>,
): FeatureFlags {
  return { ...RUBROS[rubro].features, ...overrides };
}
