export type Rubro = "general" | "kiosco" | "ropa" | "ferreteria";

export interface Category {
  id: number;
  name: string;
  created_at: string;
}

export interface Product {
  id: number;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  category_id: number | null;
  cost: number;
  price: number;
  stock: number;
  min_stock: number;
  unit: string;
  tax_rate: number;
  has_variants: number;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface ProductInput {
  sku?: string | null;
  barcode?: string | null;
  name: string;
  description?: string | null;
  category_id?: number | null;
  cost: number;
  price: number;
  stock: number;
  min_stock: number;
  unit: string;
  tax_rate: number;
}

/** Funciones/módulos que se pueden prender o apagar por rubro. */
export interface FeatureFlags {
  pos: boolean;
  products: boolean;
  stock: boolean;
  customers: boolean;
  reports: boolean;
  invoicing: boolean;
}

/** Campos opcionales de producto que se muestran según el rubro. */
export interface ProductFields {
  barcode: boolean;
  sku: boolean;
  category: boolean;
  variants: boolean;
  unitMeasure: boolean;
}
