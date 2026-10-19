import {
  CreditCard,
  Ellipsis,
  House,
  Landmark,
  Megaphone,
  SprayCan,
  Users,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface ExpenseCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  example: string;
}

/** Gastos del negocio. La mercadería no va acá: se carga en Proveedores. */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: "alquiler", label: "Alquiler", icon: House, example: "Alquiler del local" },
  { id: "servicios", label: "Luz, gas y agua", icon: Zap, example: "Factura de luz" },
  { id: "internet", label: "Internet y teléfono", icon: Wifi, example: "Abono de internet" },
  { id: "sueldos", label: "Sueldos", icon: Users, example: "Sueldo de Juan" },
  { id: "impuestos", label: "Impuestos y servicios contables", icon: Landmark, example: "Monotributo" },
  { id: "mantenimiento", label: "Mantenimiento y arreglos", icon: Wrench, example: "Arreglo de la heladera" },
  { id: "limpieza", label: "Limpieza y descartables", icon: SprayCan, example: "Bolsas y lavandina" },
  { id: "publicidad", label: "Publicidad", icon: Megaphone, example: "Volantes" },
  { id: "comisiones", label: "Comisiones y cargos de banco o Mercado Pago", icon: CreditCard, example: "Comisión de Mercado Pago" },
  { id: "otros", label: "Otros", icon: Ellipsis, example: "Otro gasto" },
];

const BY_ID = new Map(EXPENSE_CATEGORIES.map((c) => [c.id, c]));

export function expenseCategory(id: string): ExpenseCategory {
  return BY_ID.get(id) ?? { id, label: id || "Otros", icon: Ellipsis, example: "" };
}

export function expenseCategoryLabel(id: string): string {
  return expenseCategory(id).label;
}
