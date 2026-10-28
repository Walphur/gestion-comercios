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
    version: "1.2.100",
    date: "2026-10-28",
    items: [
      {
        kind: "mejora",
        text: "En el historial del cliente ves cada pago de la deuda: cuándo, cuánto, con qué medio y qué empleado lo cobró. Nadie lo puede editar ni borrar.",
        to: "/clientes",
      },
    ],
  },
  {
    version: "1.2.99",
    date: "2026-10-27",
    items: [
      {
        kind: "nuevo",
        text: "Descuento por cantidad: en el producto poné, por ejemplo, «desde 2 kg, 15% off» y la caja lo aplica sola. El cajero lo puede cambiar.",
        to: "/productos",
        when: (ctx) => ctx.features.pos,
      },
    ],
  },
  {
    version: "1.2.98",
    date: "2026-10-27",
    items: [
      {
        kind: "arreglo",
        text: "Al crear un cliente desde un presupuesto u orden de trabajo, los botones Cancelar y Guardar ya no tapan la ventana.",
      },
    ],
  },
  {
    version: "1.2.97",
    date: "2026-10-25",
    items: [
      {
        kind: "arreglo",
        text: "Confirmar una venta, también a fiado, ya no se queda trabado y no se registra dos veces.",
        to: "/pos",
      },
      {
        kind: "mejora",
        text: "Si el cliente pasa su límite de fiado, el aviso dice cuánto debe y qué hacer.",
        to: "/clientes",
      },
      {
        kind: "arreglo",
        text: "Al armar un combo aparecen tus productos para elegir, y se encuentran por nombre o código aunque tengas el catálogo de supermercado cargado.",
        to: "/productos",
      },
    ],
  },
  {
    version: "1.2.96",
    date: "2026-10-25",
    items: [
      {
        kind: "nuevo",
        text: "Al crear la cuenta podés poner el código del vendedor que te ofreció WalQo.",
      },
      {
        kind: "nuevo",
        text: "Cada rubro trae sus propios ejemplos para no arrancar en blanco: la carta en un restó, servicios y repuestos en un taller, consultas en un consultorio, prendas con talles en una tienda de ropa, y así. No ocupan lugar en el plan gratis y se quitan con «Quitar ejemplos».",
        to: "/productos",
      },
    ],
  },
  {
    version: "1.2.95",
    date: "2026-10-24",
    items: [
      {
        kind: "nuevo",
        text: "Los videos de ayuda ahora se ven dentro de WalQo, sin abrir el navegador, cada uno con su portada. Están todos en Ayuda, también los de instalar y del primer ingreso.",
        to: "/ayuda",
      },
      {
        kind: "arreglo",
        text: "Al escanear la etiqueta de la balanza, el producto entra a la venta con el peso o el importe de la etiqueta, sin pedirte que lo peses de nuevo.",
        to: "/pos",
        when: (ctx) => ctx.features.pos,
      },
      {
        kind: "arreglo",
        text: "En la caja, el stock de los productos por kilo se ve prolijo, sin decimales de más.",
        to: "/pos",
        when: (ctx) => ctx.features.pos,
      },
      {
        kind: "arreglo",
        text: "En tu página de turnos, los días de atención se leen bien (por ejemplo, «lunes, martes y sábados»).",
        when: (ctx) => ["estetica", "clinica", "taller"].includes(ctx.rubroId),
      },
    ],
  },
  {
    version: "1.2.94",
    date: "2026-10-24",
    items: [
      {
        kind: "mejora",
        text: "Cuando a tu plan le quedan 3 días o menos, WalQo te lo recuerda cada vez que entrás, para que no se te corte.",
      },
      {
        kind: "arreglo",
        text: "Si el plan venció y lo pagás, vuelve solo en un par de minutos, sin cargar la clave de nuevo. También podés tocar «Ya pagué».",
      },
    ],
  },
  {
    version: "1.2.93",
    date: "2026-10-21",
    items: [
      {
        kind: "mejora",
        text: "Promos: poné el precio de antes en el producto y en la caja y en la etiqueta de góndola se ve tachado con el % OFF.",
        to: "/productos",
        when: (ctx) => ctx.features.pos,
      },
    ],
  },
  {
    version: "1.2.92",
    date: "2026-10-21",
    items: [
      {
        kind: "nuevo",
        text: "Mesas: abrís la mesa, vas sumando lo que piden, mandás a la cocina solo lo nuevo y la cobrás con propina.",
        to: "/mesas",
        when: (ctx) => ctx.rubroId === "gastronomia",
      },
      {
        kind: "nuevo",
        text: "Cada mesa puede tener su QR: el cliente pide, llama al mozo o pide la cuenta desde el celular.",
        to: "/mesas",
        when: (ctx) => ctx.rubroId === "gastronomia",
      },
      {
        kind: "nuevo",
        text: "Mozos desde el celular: cada mozo ve las mesas, carga el pedido y sale directo a la cocina con su nombre.",
        to: "/mesas",
        when: (ctx) => ctx.rubroId === "gastronomia",
      },
      {
        kind: "arreglo",
        text: "Publicar la tienda web, cobrar con QR de Mercado Pago o activar la licencia ya no se quedan esperando sin terminar.",
      },
      {
        kind: "mejora",
        text: "En gastronomía, los platos, bebidas y combos también pueden tener precio de lista, y al duplicar un producto se copia.",
        to: "/productos",
        when: withStore,
      },
      {
        kind: "arreglo",
        text: "En el plan gratis, los productos que cargás desde el celular respetan el mismo tope que en la compu.",
      },
      {
        kind: "arreglo",
        text: "En el taller, al editar un cliente ya podés cambiar la patente y los datos de su vehículo, o agregarle otro.",
        to: "/clientes",
        when: (ctx) => ctx.rubroId === "taller",
      },
    ],
  },
  {
    version: "1.2.91",
    date: "2026-10-21",
    items: [
      {
        kind: "mejora",
        text: "En venta de celulares elegís el dólar: automático (blue, oficial o tarjeta) o fijo, y podés sumarle un margen. Los precios en pesos se ajustan solos, también en tu tienda web aunque WalQo esté cerrado.",
        to: "/celulares",
        when: (ctx) => ctx.rubroId === "electronica",
      },
      {
        kind: "nuevo",
        text: "Cada producto puede tener un precio de lista: en tu tienda web se ve tachado, con el % de descuento al lado.",
        to: "/productos",
        when: withStore,
      },
      {
        kind: "mejora",
        text: "La venta de celulares y las 4 fotos por producto en la tienda web vienen con WalQo Completo. En el plan gratis y en el permanente probás los celulares con 5 equipos, y la tienda muestra la foto principal.",
      },
      {
        kind: "mejora",
        text: "En el plan gratis, peluquería y estética prueban con 5 servicios y 10 ventas por mes, y celulares con 10 ventas por mes. Lo que ya tenías cargado no se borra.",
      },
    ],
  },
  {
    version: "1.2.90",
    date: "2026-10-20",
    items: [
      {
        kind: "nuevo",
        text: "Cada producto puede tener hasta 4 fotos. En tu tienda web, el cliente toca el producto y las pasa con el dedo, con el precio y la descripción.",
        to: "/productos",
        when: withStore,
      },
    ],
  },
  {
    version: "1.2.89",
    date: "2026-10-20",
    items: [
      {
        kind: "nuevo",
        text: "Para celulares: cada equipo con su IMEI, y al venderlo queda la garantía a nombre del cliente. En «Celulares» buscás un IMEI y ves toda su historia.",
        to: "/celulares",
        when: (ctx) => ctx.rubroId === "electronica",
      },
      {
        kind: "nuevo",
        text: "Precios en dólares con la cotización del día, y en la caja podés recibir un usado como parte de pago.",
        to: "/pos",
        when: (ctx) => ctx.rubroId === "electronica",
      },
    ],
  },
  {
    version: "1.2.88",
    date: "2026-10-19",
    items: [
      {
        kind: "nuevo",
        text: "Al cerrar la caja ves el detalle del turno: lo vendido, dónde entró la plata, lo fiado y si la caja dio bien. Lo podés imprimir o mandar por WhatsApp.",
        to: "/caja",
      },
      {
        kind: "nuevo",
        text: "En Caja, «Turnos anteriores» te deja revisar cualquier cierre.",
        to: "/caja",
      },
    ],
  },
  {
    version: "1.2.87",
    date: "2026-10-19",
    items: [
      {
        kind: "mejora",
        text: "«Resumen hoy» está en todos los planes: ves cuánto entró en efectivo, en el banco y en Mercado Pago.",
        to: "/reportes",
        when: notClinic,
      },
      {
        kind: "nuevo",
        text: "Desde Inicio tocás «Resumen hoy» y ves lo vendido en el día para mandarlo por WhatsApp.",
        to: "/",
        when: notClinic,
      },
      {
        kind: "arreglo",
        text: "Las ventas con muchos productos se cobran rápido, también con Tienda Nube conectada.",
        to: "/pos",
      },
    ],
  },
  {
    version: "1.2.86",
    date: "2026-10-19",
    items: [
      {
        kind: "arreglo",
        text: "Confirmar el cobro ya no se queda girando: la venta se guarda al instante.",
        to: "/pos",
      },
      {
        kind: "mejora",
        text: "La app no se traba mientras sube el resumen al celular o imprime el ticket.",
      },
    ],
  },
  {
    version: "1.2.85",
    date: "2026-10-19",
    items: [
      {
        kind: "mejora",
        text: "Reportes más ordenado: los filtros quedaron arriba a la derecha.",
        to: "/reportes",
      },
      {
        kind: "arreglo",
        text: "Se ve bien el stock valorizado y la ganancia en Resultado.",
        to: "/reportes",
      },
    ],
  },
  {
    version: "1.2.84",
    date: "2026-10-19",
    items: [
      {
        kind: "nuevo",
        text: "En Reportes ves cuánto entró en efectivo, en el banco y en Mercado Pago.",
        to: "/reportes",
      },
      {
        kind: "mejora",
        text: "Resumen hoy ahora se ve en pantalla antes de mandarlo por WhatsApp.",
        to: "/reportes",
      },
    ],
  },
  {
    version: "1.2.83",
    date: "2026-10-19",
    items: [
      {
        kind: "nuevo",
        text: "Te avisamos cuando hay productos con stock bajo, con un botón para armar el pedido.",
        to: "/",
        when: withSuppliers,
      },
      {
        kind: "mejora",
        text: "Te avisamos unos días antes de que venza tu plan.",
      },
      {
        kind: "nuevo",
        text: "Tesorería: mirá cuánta plata tenés en el cajón, la caja fuerte, el banco y Mercado Pago.",
        to: "/tesoreria",
        when: notClinic,
      },
      {
        kind: "nuevo",
        text: "Anotá los retiros del dueño y los traslados de plata entre cuentas.",
        to: "/tesoreria",
        when: notClinic,
      },
      {
        kind: "nuevo",
        text: "Tienda web: tus clientes pueden pagar el pedido con Mercado Pago.",
        to: "/admin?section=menu-portal",
        when: withStore,
      },
    ],
  },
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
