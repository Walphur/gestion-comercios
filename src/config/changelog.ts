import type { FeatureFlags } from "../types";

export type ChangeKind = "nuevo" | "mejora" | "arreglo";

export interface ChangeItem {
  kind: ChangeKind;
  /** Una frase, en palabras del comercio. Nada técnico. */
  text: string;
  /** Pantalla para probarlo. */
  to?: string;
  when?: (ctx: ChangeContext) => boolean;
}

export interface ReleaseNote {
  version: string;
  date: string;
  items: ChangeItem[];
}

export interface ChangeContext {
  rubroId: string;
  features: FeatureFlags;
}

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  nuevo: "Nuevo",
  mejora: "Mejora",
  arreglo: "Arreglo",
};

const withSuppliers = (ctx: ChangeContext) => ctx.features.stock && ctx.rubroId !== "clinica";
const notClinic = (ctx: ChangeContext) => ctx.rubroId !== "clinica";
const withStore = (ctx: ChangeContext) =>
  ctx.features.pos && !["taller", "estetica", "clinica"].includes(ctx.rubroId);

/**
 * Lo nuevo de cada versión, la más reciente primero.
 * Al publicar, agregá arriba la versión que va a salir (la que sigue a package.json).
 */
export const CHANGELOG: ReleaseNote[] = [
  {
    version: "1.2.82",
    date: "2026-10-19",
    items: [
      {
        kind: "nuevo",
        text: "Tienda web: tus clientes arman el pedido desde walqo.pro/TuLocal y te llega a WalQo para cobrarlo.",
        to: "/admin?section=menu-portal",
        when: withStore,
      },
      {
        kind: "nuevo",
        text: "Elegí color, portada y horarios de tu tienda.",
        to: "/admin?section=menu-portal",
        when: withStore,
      },
    ],
  },
  {
    version: "1.2.80",
    date: "2026-10-19",
    items: [
      {
        kind: "nuevo",
        text: "Gastos: anotá alquiler, luz, sueldos y demás, y WalQo te avisa los fijos que faltan este mes.",
        to: "/gastos",
        when: notClinic,
      },
      {
        kind: "nuevo",
        text: "En Reportes ves la ganancia real del mes, con los gastos descontados.",
        to: "/reportes",
        when: notClinic,
      },
      {
        kind: "mejora",
        text: "Reportes por fechas, por cajero y para imprimir, y nuevos: quién te debe, cuánto vale tu mercadería y cuánto le debés a proveedores.",
        to: "/reportes",
        when: notClinic,
      },
      {
        kind: "mejora",
        text: "El menú quedó más corto: Inicio y Punto de venta arriba, y el resto agrupado en secciones que se abren y cierran.",
        when: notClinic,
      },
    ],
  },
  {
    version: "1.2.79",
    date: "2026-10-19",
    items: [
      {
        kind: "arreglo",
        text: "Ahora podés editar un presupuesto aunque ya esté aprobado: tocá «Editar» y queda con el mismo número.",
        to: "/presupuestos",
      },
      {
        kind: "mejora",
        text: "Si el presupuesto ya se cobró, «Duplicar y editar» arma uno nuevo con los mismos ítems.",
        to: "/presupuestos",
      },
    ],
  },
  {
    version: "1.2.78",
    date: "2026-10-19",
    items: [
      {
        kind: "mejora",
        text: "En peluquería y estética, WalQo Completo incluye turnos y comisiones para hasta 2 profesionales. Con más, Pro.",
        to: "/ayuda",
        when: (ctx) => ctx.rubroId === "estetica",
      },
      {
        kind: "mejora",
        text: "El enlace de turnos ya no cambia si desvinculás el celular. Si el nombre ya lo usa otro comercio, elegís otro.",
        to: "/admin?section=catalogo-movil",
        when: (ctx) => ["estetica", "clinica", "taller"].includes(ctx.rubroId),
      },
      {
        kind: "arreglo",
        text: "Arreglamos que el turnero web no mostrara los servicios.",
        to: "/admin?section=catalogo-movil",
        when: (ctx) => ["estetica", "clinica", "taller"].includes(ctx.rubroId),
      },
    ],
  },
  {
    version: "1.2.77",
    date: "2026-10-19",
    items: [
      {
        kind: "nuevo",
        text: "Si pagás 3 meses juntos, te hacemos un 10% de descuento.",
        to: "/ayuda",
      },
    ],
  },
  {
    version: "1.2.76",
    date: "2026-10-19",
    items: [
      {
        kind: "mejora",
        text: "Peluquerías, barberías y estética: los turnos y las comisiones ahora vienen en el plan Completo, a $35.000 por mes.",
        to: "/ayuda",
        when: (ctx) => ctx.rubroId === "estetica",
      },
      {
        kind: "nuevo",
        text: "Si pagás el año de una vez, te cobramos 10 meses y usás 12.",
        to: "/ayuda",
      },
    ],
  },
  {
    version: "1.2.75",
    date: "2026-10-19",
    items: [
      {
        kind: "nuevo",
        text: "Después de cada actualización te mostramos acá qué hay de nuevo. También lo encontrás en Ayuda.",
        to: "/ayuda",
      },
    ],
  },
  {
    version: "1.2.74",
    date: "2026-10-19",
    items: [
      {
        kind: "nuevo",
        text: "Proveedores: anotá lo que le debés a cada uno y lo que le pagás. Si pagás con plata de la caja, se descuenta sola.",
        to: "/proveedores",
        when: withSuppliers,
      },
      {
        kind: "nuevo",
        text: "WalQo arma la lista de lo que te falta y se la mandás al proveedor por WhatsApp.",
        to: "/proveedores?tab=pedidos",
        when: withSuppliers,
      },
      {
        kind: "mejora",
        text: "Al cargar una compra elegís el proveedor y si la pagaste o quedó a cuenta.",
        to: "/stock",
        when: withSuppliers,
      },
    ],
  },
  {
    version: "1.2.73",
    date: "2026-10-19",
    items: [
      {
        kind: "mejora",
        text: "El botón ? de abajo a la derecha tiene consejos pensados para tu rubro.",
      },
    ],
  },
  {
    version: "1.2.72",
    date: "2026-10-19",
    items: [
      {
        kind: "nuevo",
        text: "En Inicio, «Arrancá con WalQo» te muestra los pasos que te faltan para dejar todo listo.",
        to: "/",
      },
      {
        kind: "nuevo",
        text: "Nueva página de Ayuda, con buscador y WhatsApp para consultarnos.",
        to: "/ayuda",
      },
    ],
  },
];
