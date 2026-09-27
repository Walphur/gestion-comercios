/** Empanadas: el cliente elige frita o al horno (carta y POS). */

export function foldFoodName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function isEmpanadaProduct(category: string | null | undefined, name: string): boolean {
  const cat = foldFoodName(category ?? "");
  const n = foldFoodName(name);
  return cat.includes("empanada") || n.includes("empanada");
}

export const EMPANADA_COOK_OPTIONS = ["Frita", "Al horno"] as const;
