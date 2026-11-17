/**
 * Subtipos de gastronomía: plantilla inicial (no son rubros ni entitlements).
 * El rubro sigue siendo siempre `gastronomia`.
 */

export const GASTRO_SUBTYPE_IDS = [
  "restaurante",
  "rotiseria",
  "pizzeria",
  "cafeteria",
  "bar",
  "comida_rapida",
  "delivery",
  "otro",
] as const;

export type GastroSubtype = (typeof GASTRO_SUBTYPE_IDS)[number];

export function isGastroSubtype(value: string | null | undefined): value is GastroSubtype {
  return !!value && (GASTRO_SUBTYPE_IDS as readonly string[]).includes(value);
}

/** Comercios viejos sin subtipo se comportan como restaurante. */
export const DEFAULT_GASTRO_SUBTYPE: GastroSubtype = "restaurante";

export interface GastroPreset {
  tables: boolean;
  kitchen: boolean;
  waiterPhones: boolean;
  posFulfillment: boolean;
  /** Preferencias blandas de carta (no obligan a publicar). */
  menuPickup: boolean;
  menuDelivery: boolean;
  suggestedStations: string[];
  suggestedCategories: string[];
}

export interface GastroSubtypeDef {
  id: GastroSubtype;
  label: string;
  description: string;
  preset: GastroPreset;
}

const BASE_CATS = [
  "Entradas",
  "Principales",
  "Guarniciones",
  "Bebidas",
  "Postres",
  "Combos / Menú del día",
];

export const GASTRO_SUBTYPES: Record<GastroSubtype, GastroSubtypeDef> = {
  restaurante: {
    id: "restaurante",
    label: "Restaurante",
    description: "Salón con mesas, mozos y cocina.",
    preset: {
      tables: true,
      kitchen: true,
      waiterPhones: true,
      posFulfillment: true,
      menuPickup: true,
      menuDelivery: true,
      suggestedStations: ["Cocina", "Barra"],
      suggestedCategories: [...BASE_CATS, "Pizzas / Empanadas"],
    },
  },
  rotiseria: {
    id: "rotiseria",
    label: "Rotisería",
    description: "Mostrador, retiro y delivery; sin mesas al inicio.",
    preset: {
      tables: false,
      kitchen: true,
      waiterPhones: false,
      posFulfillment: true,
      menuPickup: true,
      menuDelivery: true,
      suggestedStations: ["Cocina"],
      suggestedCategories: [
        "Listos para llevar",
        "Guarniciones",
        "Bebidas",
        "Postres",
        "Combos / Menú del día",
      ],
    },
  },
  pizzeria: {
    id: "pizzeria",
    label: "Pizzería",
    description: "Mostrador, retiro y delivery; mesas opcionales después.",
    preset: {
      tables: false,
      kitchen: true,
      waiterPhones: false,
      posFulfillment: true,
      menuPickup: true,
      menuDelivery: true,
      suggestedStations: ["Cocina", "Horno"],
      suggestedCategories: [
        "Pizzas",
        "Empanadas",
        "Fainá / Extras",
        "Bebidas",
        "Postres",
        "Combos",
      ],
    },
  },
  cafeteria: {
    id: "cafeteria",
    label: "Cafetería",
    description: "Mostrador y barra; mesas opcionales.",
    preset: {
      tables: false,
      kitchen: true,
      waiterPhones: false,
      posFulfillment: true,
      menuPickup: true,
      menuDelivery: false,
      suggestedStations: ["Barra", "Cocina"],
      suggestedCategories: [
        "Cafés",
        "Té e infusiones",
        "Medialunas / Panadería",
        "Sandwiches",
        "Bebidas",
        "Postres",
      ],
    },
  },
  bar: {
    id: "bar",
    label: "Bar / Cervecería",
    description: "Mesas, mozos, barra y cocina.",
    preset: {
      tables: true,
      kitchen: true,
      waiterPhones: true,
      posFulfillment: true,
      menuPickup: false,
      menuDelivery: false,
      suggestedStations: ["Barra", "Cocina"],
      suggestedCategories: [
        "Cervezas",
        "Tragos",
        "Vinos",
        "Picadas",
        "Platos",
        "Sin alcohol",
      ],
    },
  },
  comida_rapida: {
    id: "comida_rapida",
    label: "Comida rápida",
    description: "Mostrador rápido, retiro y delivery.",
    preset: {
      tables: false,
      kitchen: true,
      waiterPhones: false,
      posFulfillment: true,
      menuPickup: true,
      menuDelivery: true,
      suggestedStations: ["Cocina"],
      suggestedCategories: [
        "Burgers",
        "Papas / Extras",
        "Bebidas",
        "Combos",
        "Postres",
      ],
    },
  },
  delivery: {
    id: "delivery",
    label: "Delivery",
    description: "Enfoque en pedidos para enviar; sin salón al inicio.",
    preset: {
      tables: false,
      kitchen: true,
      waiterPhones: false,
      posFulfillment: true,
      menuPickup: true,
      menuDelivery: true,
      suggestedStations: ["Cocina"],
      suggestedCategories: [
        "Principales",
        "Guarniciones",
        "Bebidas",
        "Combos",
        "Postres",
      ],
    },
  },
  otro: {
    id: "otro",
    label: "Otro / Personalizado",
    description: "Arranca como restaurante; después ajustás los módulos.",
    preset: {
      tables: true,
      kitchen: true,
      waiterPhones: true,
      posFulfillment: true,
      menuPickup: true,
      menuDelivery: true,
      suggestedStations: ["Cocina"],
      suggestedCategories: [...BASE_CATS],
    },
  },
};

export const GASTRO_SUBTYPE_LIST: GastroSubtypeDef[] = GASTRO_SUBTYPE_IDS.map(
  (id) => GASTRO_SUBTYPES[id],
);

export function resolveGastroSubtype(
  raw: string | null | undefined,
): GastroSubtype | null {
  const v = raw?.trim() ?? "";
  if (!v) return null;
  return isGastroSubtype(v) ? v : null;
}
