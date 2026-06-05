export type Rubro =
  | "general"
  | "kiosco"
  | "ropa"
  | "ferreteria"
  | "petshop"
  | "farmacia"
  | "taller"
  | "estetica"
  | "clinica";

export interface Category {
  id: number;
  name: string;
  created_at: string;
}

export interface Brand {
  id: number;
  name: string;
  created_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  notes: string | null;
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
  brand_id?: number | null;
  supplier_id?: number | null;
  category_name?: string | null;
  brand_name?: string | null;
  supplier_name?: string | null;
  expires_at?: string | null;
}

export interface ProductVariant {
  id: number;
  product_id: number;
  attributes: Record<string, string>;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  stock: number;
}

/** Variante en edición (antes de guardarse). */
export interface VariantDraft {
  id?: number;
  attributes: Record<string, string>;
  sku: string;
  barcode: string;
  price: number | "";
  stock: number;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  document: string | null;
  email: string | null;
  credit_limit: number;
  balance: number;
  notes: string | null;
  active: number;
  created_at: string;
}

export interface CustomerInput {
  name: string;
  phone?: string;
  document?: string;
  email?: string;
  credit_limit: number;
  notes?: string;
}

export interface CustomerPayment {
  id: number;
  customer_id: number;
  amount: number;
  payment_method: string;
  notes: string | null;
  user_id: number | null;
  created_at: string;
}

export interface Sale {
  id: number;
  subtotal: number;
  discount_pct: number;
  total: number;
  payment_method: string;
  paid: number | null;
  change_due: number | null;
  created_at: string;
  voided?: number;
  customer_id?: number | null;
  customer_name?: string | null;
  user_id?: number | null;
  seller_name?: string | null;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number | null;
  variant_id: number | null;
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  stock_qty?: number | null;
}

export interface ProductInput {
  sku?: string | null;
  barcode?: string | null;
  name: string;
  description?: string | null;
  category_id?: number | null;
  brand_id?: number | null;
  supplier_id?: number | null;
  cost: number;
  price: number;
  stock: number;
  min_stock: number;
  unit: string;
  tax_rate: number;
  expires_at?: string | null;
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
