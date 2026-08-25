import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Candy,
  Car,
  Cookie,
  Dog,
  Leaf,
  Pill,
  Scissors,
  Shirt,
  ShoppingCart,
  Smartphone,
  Stethoscope,
  Store,
  Wrench,
} from "lucide-react";

/** Mapa de íconos Lucide por clave en `rubros.ts` → icon. */
export const RUBRO_ICONS: Record<string, LucideIcon> = {
  Store,
  Candy,
  Pill,
  Shirt,
  Wrench,
  Dog,
  Car,
  Scissors,
  Stethoscope,
  Cookie,
  Leaf,
  Smartphone,
  BookOpen,
  ShoppingCart,
};

export function rubroIcon(name: string): LucideIcon {
  return RUBRO_ICONS[name] ?? Store;
}
