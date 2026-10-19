import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  Brain,
  Calculator,
  Calendar,
  ClipboardList,
  FileText,
  Globe,
  HandCoins,
  Handshake,
  HeartPulse,
  Landmark,
  LayoutDashboard,
  Package,
  Receipt,
  ReceiptText,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Truck,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import type { RubroDefinition } from "./rubros";
import { getProModuleNavLabel, type ProModuleKey } from "./modules";
import type { FeatureFlags } from "../types";

export const GUIDE_VIDEOS = {
  producto: "https://walqo.pro/guias/#producto",
  venta: "https://walqo.pro/guias/#venta",
  tiendanube: "https://walqo.pro/guias/#tiendanube",
} as const;

export const MOBILE_GUIDE_URL = "https://walqo.pro/celular";

export interface HelpContext {
  rubro: RubroDefinition;
  features: FeatureFlags;
  appointments: boolean;
  pro: (key: ProModuleKey) => boolean;
}

export interface HelpTopic {
  id: string;
  title: string;
  /** Título según el rubro; reemplaza a `title` en los temas visibles. */
  titleFor?: (ctx: HelpContext) => string;
  icon: LucideIcon;
  to: string;
  matches: (pathname: string, search: string) => boolean;
  visible: (ctx: HelpContext) => boolean;
  tips: (ctx: HelpContext) => string[];
  video?: string;
}

const isClinic = (ctx: HelpContext) => ctx.rubro.id === "clinica";
const sells = (ctx: HelpContext) => ctx.features.pos && !isClinic(ctx);
const isServices = (ctx: HelpContext) => ctx.rubro.group === "servicios";
const isWorkshop = (ctx: HelpContext) => ctx.rubro.id === "taller";
const hasVariants = (ctx: HelpContext) => ctx.rubro.fields.variants;
/** «talle y color», «color y capacidad»… según el rubro. */
const variantWords = (ctx: HelpContext, joiner = " y ") =>
  ctx.rubro.variantAttributes.map((a) => a.toLowerCase()).join(joiner) || "variante";

const EXAMPLES: Partial<Record<string, string>> = {
  kiosco: "Coca-Cola 500 ml",
  supermercado: "Arroz largo fino 1 kg",
  farmacia: "Ibuprofeno 400 x 10",
  ropa: "Remera lisa talle M",
  ferreteria: "Tornillo 8 mm x 100",
  petshop: "Alimento perro adulto 15 kg",
  panaderia: "Medialunas por docena",
  gastronomia: "Milanesa napolitana con fritas",
  verduleria: "Tomate redondo por kg",
  libreria: "Cuaderno A4 rayado",
  electronica: "Cargador USB-C 20 W",
  taller: "Alineación y balanceo",
  estetica: "Corte y barba, 40 min",
  clinica: "Consulta general, 30 min",
};

const RESALE_EXAMPLES: Partial<Record<string, string>> = {
  estetica: "Shampoo 400 ml",
  taller: "Filtro de aceite",
  clinica: "Kit de cepillo dental",
};

/** Ejemplo para el rubro: en los de servicios, `resale` da un producto de reventa. */
export function rubroExample(rubroId: string, resale = false): string {
  if (resale) return RESALE_EXAMPLES[rubroId] ?? EXAMPLES[rubroId] ?? "tu producto más vendido";
  return EXAMPLES[rubroId] ?? "tu producto más vendido";
}

const servicesView = (search: string) => search.includes("vista=servicios");

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "inicio",
    title: "Inicio",
    icon: LayoutDashboard,
    to: "/",
    matches: (p) => p === "/",
    visible: () => true,
    tips: (ctx) =>
      isClinic(ctx)
        ? [
            "Arriba ves a quién llamar y los turnos de hoy.",
            "Cada servicio aparece con el profesional que lo hace.",
          ]
        : [
            "La franja de arriba te dice si la caja está abierta y cuánto llevás vendido hoy.",
            "Stock crítico te avisa qué reponer antes de quedarte sin nada.",
            ...(ctx.features.stock
              ? ["Si hay productos con stock bajo, aparece un aviso con «Armar pedido» para pedirle al proveedor. La X lo oculta por hoy."]
              : []),
            "Unos días antes de que venza tu plan o la prueba Pro te avisamos arriba, con el botón para pagar por WhatsApp. Lo podés cerrar por el día.",
            "Los botones grandes de abajo te llevan directo a vender, cargar productos o la caja.",
          ],
  },
  {
    id: "pos",
    title: "Punto de venta",
    icon: ShoppingCart,
    to: "/pos",
    matches: (p) => p === "/pos",
    visible: sells,
    video: GUIDE_VIDEOS.venta,
    tips: (ctx) => [
      ...(ctx.rubro.posCarta
        ? ["Tocá una categoría de la carta (Principales, Bebidas…) y después el plato: entra al pedido."]
        : [
            ctx.rubro.fields.barcode
              ? "Pasá el lector o escribí parte del nombre y apretá Enter: el producto entra al ticket."
              : "Escribí parte del nombre y apretá Enter: entra al ticket.",
          ]),
      ...(hasVariants(ctx)
        ? [
            `Si el producto tiene variantes (${variantWords(ctx, ", ")}), WalQo te pregunta cuál se lleva y descuenta el stock de esa variante.`,
          ]
        : []),
      ...(ctx.rubro.posFulfillment
        ? [
            "Antes de cobrar elegí Mostrador, Para llevar o Delivery. En Delivery cargás la dirección.",
            "Pedidos pendientes muestra lo que falta entregar: ahí asignás el cadete y avisás por WhatsApp cuando sale.",
          ]
        : []),
      ...(ctx.rubro.posKitchenTicket
        ? ["Con «Imprimir ticket de cocina / barra» el pedido sale impreso para preparar."]
        : []),
      ...(ctx.rubro.posTip ? ["Al cobrar elegí 10 %, 15 % o escribí el monto de la propina."] : []),
      ...(ctx.rubro.posProfessional
        ? ["Elegí en «Atendió» quién hizo el servicio: así se calculan sus comisiones."]
        : []),
      "F2 o Ctrl + Enter abre el cobro. De F3 a F7 elegís el medio de pago.",
      ...(ctx.rubro.posBulkWeight ? ["F8 cobra un monto en pesos de algo que vendés suelto o por peso."] : []),
      "Sin caja abierta no se puede cobrar: abrila primero desde Caja.",
      "Esc vacía el ticket si te equivocaste de cliente.",
    ],
  },
  {
    id: "ventas",
    title: "Ventas",
    icon: Receipt,
    to: "/ventas",
    matches: (p) => p === "/ventas",
    visible: sells,
    tips: () => [
      "Filtrá por día, medio de pago, cajero o estado para encontrar una venta rápido.",
      "Abrí una venta para ver qué se llevó y cómo pagó.",
      "Si se cobró mal, la podés anular desde el detalle.",
    ],
  },
  {
    id: "productos",
    title: "Productos",
    icon: Package,
    to: "/productos",
    matches: (p, s) => p === "/productos" && !servicesView(s),
    visible: (ctx) => ctx.features.products && !isClinic(ctx),
    video: GUIDE_VIDEOS.producto,
    tips: (ctx) => [
      `Agregar producto → Manualmente para cargar uno (ej: ${rubroExample(ctx.rubro.id, isServices(ctx))}), o Importar desde Excel para muchos.`,
      ...(ctx.rubro.posCarta
        ? [
            "Elegí el tipo: Para vender, Insumo, Elaborado, Combo o Menú del día. Los insumos no salen en la carta.",
            "Un Elaborado (milanesa, papas fritas) lleva su receta con insumos: así WalQo calcula cuánto te cuesta el plato.",
          ]
        : []),
      ...(hasVariants(ctx)
        ? [
            `En Variantes sumás cada combinación de ${variantWords(ctx)}, con su propio stock.`,
            "El stock del producto es la suma de sus variantes. Si dejás el precio de una vacío, usa el precio general.",
          ]
        : []),
      "Cargá el costo además del precio: así Inicio te muestra la ganancia estimada.",
      ...(ctx.features.stock
        ? [
            hasVariants(ctx)
              ? `Con stock mínimo por ${variantWords(ctx, " o ")}, WalQo te avisa cuando esa variante se está por agotar.`
              : "Con un stock mínimo, WalQo te avisa cuando queda poco.",
          ]
        : []),
      ...(ctx.rubro.fields.expiry ? ["Si cargás vencimiento, ves en Inicio lo que vence en los próximos 14 días."] : []),
      ...(isWorkshop(ctx) ? ["Los repuestos van acá; la mano de obra se carga como servicio."] : []),
    ],
  },
  {
    id: "servicios",
    title: "Servicios",
    icon: Sparkles,
    to: "/productos?vista=servicios",
    matches: (p, s) => p === "/productos" && servicesView(s),
    visible: (ctx) => ctx.features.products && isServices(ctx),
    tips: (ctx) => [
      `Cada servicio lleva precio y duración (ej: ${rubroExample(ctx.rubro.id)}).`,
      "La duración arma los horarios libres de la agenda y de la reserva web.",
      "Si marcás quién lo hace, solo esa persona aparece al reservar.",
      "Un servicio no pide código de barras ni stock.",
    ],
  },
  {
    id: "stock",
    title: "Stock",
    icon: Boxes,
    to: "/stock",
    matches: (p) => p === "/stock",
    visible: (ctx) => ctx.features.stock && !isClinic(ctx),
    tips: (ctx) => [
      "Ajustar corrige la cantidad cuando contás la mercadería.",
      "Ingreso compra suma lo que te trajo el proveedor. Si elegís el proveedor, la compra queda en su cuenta.",
      "Armar pedido junta lo que está bajo el mínimo y se lo mandás al proveedor por WhatsApp.",
      ...(hasVariants(ctx)
        ? [`El stock se cuenta por ${variantWords(ctx)}, no solo por producto.`]
        : []),
      "Movimientos muestra cada cambio, con fecha y usuario.",
    ],
  },
  {
    id: "proveedores",
    title: "Proveedores",
    icon: Handshake,
    to: "/proveedores",
    matches: (p) => p === "/proveedores",
    visible: (ctx) => ctx.features.stock && !isClinic(ctx),
    tips: () => [
      "Cada proveedor tiene su cuenta: las compras a cuenta suman deuda y los pagos la bajan.",
      "Al cargar un Ingreso compra elegís si quedó a cuenta o si la pagaste en el momento.",
      "Si pagás con efectivo del cajón, sale como egreso de la caja abierta y el arqueo cierra.",
      "En Pedidos para reponer marcás lo que falta, ajustás cantidades y lo pedís por WhatsApp.",
      "Cuando llega la mercadería, tocá «Llegó» y se carga el ingreso con el pedido ya armado.",
    ],
  },
  {
    id: "clientes",
    title: "Clientes",
    titleFor: (ctx) => (isClinic(ctx) ? "Pacientes" : "Clientes"),
    icon: Users,
    to: "/clientes",
    matches: (p) => p === "/clientes",
    visible: (ctx) => ctx.features.customers,
    tips: (ctx) =>
      isClinic(ctx)
        ? [
            "La ficha del paciente guarda DNI, contacto y obra social.",
            "Desde la ficha marcás el odontograma. Es una ficha interna, no una historia clínica oficial.",
          ]
        : [
            ...(isWorkshop(ctx)
              ? [
                  "Desde el cliente abrís Vehículos: patente, modelo y kilometraje de cada auto.",
                  "Peritaje de ingreso anota golpes, luces y daños previos antes de recibir el vehículo.",
                ]
              : []),
            "Fiado: vendé a cuenta y el cliente queda con saldo.",
            "Registrar cobro descuenta lo que te pagó.",
            "Desde el historial del cliente ves todo lo que compró.",
          ],
  },
  {
    id: "obras-sociales",
    title: "Obras sociales",
    icon: HeartPulse,
    to: "/obras-sociales",
    matches: (p) => p === "/obras-sociales",
    visible: (ctx) => isClinic(ctx) && ctx.features.customers,
    tips: () => [
      "Es la planilla de pacientes agrupada por la cobertura que cargaste en cada ficha.",
      "Filtrá por obra social o buscá por nombre para armar la presentación del mes.",
      "Si falta alguien, cargale la obra social y el número de afiliado en su ficha.",
    ],
  },
  {
    id: "caja",
    title: "Caja",
    icon: Wallet,
    to: "/caja",
    matches: (p) => p === "/caja",
    visible: sells,
    tips: () => [
      "Abrí turno con el efectivo que hay en el cajón al empezar.",
      "Anotá ingresos y egresos (un retiro, un gasto) para que el arqueo cierre.",
      "Si le pagás a un proveedor con efectivo del cajón desde WalQo, el egreso se anota solo en la caja.",
      "Al cerrar turno contás el efectivo y WalQo te muestra si sobra o falta.",
      "Si el egreso es un gasto del negocio (luz, alquiler, un arreglo), cargalo en Gastos: sale de la caja igual y cuenta en la ganancia.",
    ],
  },
  {
    id: "gastos",
    title: "Gastos",
    icon: ReceiptText,
    to: "/gastos",
    matches: (p) => p === "/gastos",
    visible: (ctx) => !isClinic(ctx),
    tips: () => [
      "Anotá lo que cuesta tener el local abierto: alquiler, luz, internet, sueldos, impuestos, arreglos.",
      "Si lo pagás con efectivo del cajón, sale solo como egreso de la caja abierta.",
      "En «Gastos fijos» cargás lo que se paga todos los meses y WalQo te avisa cuáles faltan este mes.",
      "Las compras de mercadería no van acá: se cargan en Proveedores.",
      "En Reportes, «Resultado» te muestra la ganancia real: ventas menos costo menos gastos.",
    ],
  },
  {
    id: "tesoreria",
    title: "Tesorería",
    icon: Landmark,
    to: "/tesoreria",
    matches: (p) => p === "/tesoreria",
    visible: (ctx) => !isClinic(ctx),
    tips: () => [
      "Te muestra cuánta plata hay en el cajón, la caja fuerte, el banco y Mercado Pago, y el total.",
      "La primera vez cargás cuánto tenés hoy en cada cuenta. Después WalQo suma las ventas y cobros y resta los gastos y pagos solo.",
      "El cajón sigue a la caja: con la caja abierta muestra lo que debería haber; cerrada, lo que contaste al cerrar.",
      "«Mover plata» anota cuando llevás plata del cajón a la caja fuerte o al banco. Si sale del cajón, también queda en la caja abierta.",
      "Un «Retiro del dueño» no es un gasto: no baja la ganancia. En Reportes, «Resultado» lo muestra aparte.",
      "Si el banco o Mercado Pago dicen otro número (comisiones, intereses), usá «Ajustar saldo».",
      "En «Cuentas y medios de pago» agregás cuentas (Banco Nación, Cuenta DNI) y elegís a dónde va cada medio de pago.",
      "Es un saldo estimado y queda en esta computadora: no se pasa a las otras PCs del local.",
    ],
  },
  {
    id: "turnos",
    title: "Turnos",
    icon: Calendar,
    to: "/turnos",
    matches: (p) => p.startsWith("/turnos") || p === "/agenda-profesional",
    visible: (ctx) => ctx.appointments,
    tips: (ctx) => [
      "Elegí el servicio y después el profesional: solo aparecen horarios libres.",
      "Compartí tu enlace walqo.pro/TuLocal y tus clientes reservan solos.",
      ...(ctx.rubro.posProfessional
        ? ["Cobrar en el turno lo pasa a la caja con el profesional que atendió."]
        : []),
      "Si un cliente pide reprogramar por WhatsApp, te aparece un aviso en Inicio.",
    ],
  },
  {
    id: "ordenes",
    title: "Órdenes",
    titleFor: (ctx) => getProModuleNavLabel("service_orders", ctx.rubro.id),
    icon: ClipboardList,
    to: "/ordenes",
    matches: (p) => p.startsWith("/ordenes"),
    visible: (ctx) => ctx.pro("service_orders"),
    tips: (ctx) => {
      if (isWorkshop(ctx)) {
        return [
          "Abrí una orden al recibir el auto: cliente, vehículo, kilometraje y qué hay que hacer.",
          "Sumá repuestos del stock y la mano de obra mecánica.",
          "Mové el estado: En reparación, Espera repuestos, Lista para entrega. Inicio te muestra cuántas hay en cada uno.",
          "«Entregar y cobrar» registra la venta con todo lo que lleva la orden.",
        ];
      }
      if (isClinic(ctx)) {
        return [
          "Abrí una atención con el paciente y la práctica que se hizo.",
          "Sumá los materiales usados y anotá el seguimiento en las notas.",
          "Tocá «Iniciar tratamiento» al empezar y «Marcar finalizado» al terminar.",
        ];
      }
      return [
        "Abrí una orden con el cliente y el trabajo a hacer.",
        "Sumá productos del stock o líneas de servicio.",
        "Mové el estado a medida que avanza: En curso, Espera, Lista.",
        "«Entregar y cobrar» registra la venta con todo lo que lleva la orden.",
      ];
    },
  },
  {
    id: "presupuestos",
    title: "Presupuestos",
    icon: Calculator,
    to: "/presupuestos",
    matches: (p) => p.startsWith("/presupuestos"),
    visible: (ctx) => ctx.pro("quotes"),
    tips: (ctx) => [
      `Armá el presupuesto con productos del stock o líneas escritas a mano (ej: ${rubroExample(ctx.rubro.id)}).`,
      "Poné la fecha «Válido hasta» para que el precio no quede abierto para siempre.",
      "«Enviar por WhatsApp» abre el chat del cliente con el detalle listo; también lo podés imprimir o guardar en PDF.",
      "Cuando el cliente acepta, tocá Aprobar y después «Convertir a venta»: no hace falta cargarlo de nuevo.",
    ],
  },
  {
    id: "remitos",
    title: "Remitos",
    icon: Truck,
    to: "/remitos",
    matches: (p) => p.startsWith("/remitos"),
    visible: (ctx) => ctx.pro("delivery_notes"),
    tips: () => [
      "Un remito registra mercadería que sale sin facturar en el momento (una obra, un cliente mayorista).",
      "Mientras está guardado no toca el stock; al emitirlo, descuenta lo entregado.",
      "Si se cargó mal, «Anular y devolver stock» lo deja como estaba.",
    ],
  },
  {
    id: "comisiones",
    title: "Comisiones",
    icon: HandCoins,
    to: "/comisiones",
    matches: (p) => p === "/comisiones",
    visible: (ctx) => Boolean(ctx.rubro.posProfessional),
    tips: () => [
      "Cada profesional tiene un % por servicios y otro por productos.",
      "Se calcula sobre lo cobrado con descuento, sin propinas ni ventas anuladas.",
      "Elegí el período para liquidar la semana o el mes.",
    ],
  },
  {
    id: "reportes",
    title: "Reportes",
    icon: BarChart3,
    to: "/reportes",
    matches: (p) => p === "/reportes",
    visible: (ctx) => ctx.features.reports && !isClinic(ctx),
    tips: () => [
      "Elegí el período o «Elegir fechas» para ver de un día a otro, y filtrá por cajero.",
      "CSV baja los datos para abrirlos en Excel. «Imprimir» saca en papel o PDF lo que estás viendo.",
      "La ganancia sale de los costos que cargaste en cada producto. «Resultado» le resta también los gastos.",
      "En «Más reportes» ves lo que te deben los clientes, lo que le debés a proveedores y cuánto vale tu mercadería.",
    ],
  },
  {
    id: "sugerencias",
    title: "Sugerencias",
    icon: Brain,
    to: "/asistente",
    matches: (p) => p === "/asistente",
    visible: (ctx) => ctx.features.reports && !isClinic(ctx),
    tips: () => [
      "Te dice qué conviene mirar hoy: stock bajo el mínimo, lo que se agota en la semana y lo que no se mueve hace 60 días.",
      "También muestra clientes con deuda y productos con poco margen.",
      "Cuantos más costos y mínimos cargues, mejores son las sugerencias.",
    ],
  },
  {
    id: "facturacion",
    title: "Facturación",
    icon: FileText,
    to: "/facturacion",
    matches: (p) => p === "/facturacion",
    visible: (ctx) => ctx.features.invoicing && !isClinic(ctx),
    tips: () => [
      "Primero cargá tus datos de ARCA en Configuración → ARCA / AFIP.",
      "Con esos datos cargados, desde acá manejás tus comprobantes.",
    ],
  },
  {
    id: "equipo",
    title: "Empleados",
    icon: UserCog,
    to: "/empleados",
    matches: (p) => p === "/empleados",
    visible: () => true,
    tips: (ctx) => [
      "Cada persona entra con su propio PIN.",
      "El cajero vende y maneja la caja; la configuración queda para el administrador.",
      "Así sabés quién vendió y quién abrió o cerró la caja.",
      ...(ctx.rubro.posFulfillment
        ? ["Marcá «Es cadete» y cargá su WhatsApp para asignarle los delivery."]
        : []),
    ],
  },
  {
    id: "historial",
    title: "Historial",
    icon: Shield,
    to: "/auditoria",
    matches: (p) => p === "/auditoria",
    visible: () => true,
    tips: () => [
      "Muestra qué hizo cada persona del equipo: ventas, cobros y anulaciones.",
      "Solo lo ve quien administra el comercio.",
      "Si algo no cierra en la caja, buscá acá quién y cuándo lo hizo.",
    ],
  },
  {
    id: "tienda",
    title: "Tienda web",
    titleFor: (ctx) => (ctx.rubro.id === "gastronomia" ? "Carta online" : "Tienda web"),
    icon: Globe,
    to: "/admin?section=menu-portal",
    matches: (p, s) => p === "/admin" && s.includes("section=menu-portal"),
    visible: (ctx) => sells(ctx) && !isServices(ctx) && !isWorkshop(ctx),
    tips: () => [
      "Prendela en Configuración → Tienda web. Tus clientes entran a walqo.pro/TuLocal desde el celular, sin descargar nada.",
      "Ven tus productos con foto y precio, y si hay o no hay. Nunca se muestra cuántos te quedan. Si querés, ocultá los que no tienen stock.",
      "El cliente deja nombre, WhatsApp y si retira o se lo mandás. Paga al retirar o al recibir.",
      "Si tenés Mercado Pago conectado, prendé «Cobrar online con Mercado Pago»: el cliente elige pagar en el momento y el pedido te llega marcado «Pagado». La comisión la cobra Mercado Pago, como en cualquier cobro.",
      "Un pedido pagado no se cobra de nuevo: «Registrar venta» lo anota como Mercado Pago. Si lo rechazás, la plata la devolvés desde Mercado Pago. Si aparece «Volvé a conectar Mercado Pago», conectalo otra vez en Configuración.",
      "El pedido te llega a «Pedidos web», en el Punto de venta, con un aviso. «Cobrar» lo pasa al carrito con el precio de hoy; el stock baja recién cuando lo cobrás.",
      "«Confirmar por WhatsApp» le escribe al cliente. «Rechazar» lo saca de la lista sin tocar la caja ni el stock.",
      "Elegí color, portada, horarios y costo de envío en la misma pantalla. El logo es el de Apariencia.",
    ],
  },
  {
    id: "configuracion",
    title: "Configuración",
    icon: Settings,
    to: "/admin",
    matches: (p) => p === "/admin",
    visible: () => true,
    tips: (ctx) => [
      "Copias de seguridad: guardá una copia en un pendrive o en la nube cada tanto.",
      ...(isClinic(ctx)
        ? []
        : ["Mercado Pago, Tienda Nube y la app del celular se conectan desde acá."]),
      "Varias computadoras: una queda como PC principal y las demás como caja.",
      "Apariencia cambia el logo y los colores de tu WalQo.",
    ],
  },
];

export function visibleHelpTopics(ctx: HelpContext): HelpTopic[] {
  return HELP_TOPICS.filter((t) => t.visible(ctx)).map((t) =>
    t.titleFor ? { ...t, title: t.titleFor(ctx) } : t,
  );
}

export function helpTopicFor(pathname: string, search: string, ctx: HelpContext): HelpTopic {
  const topics = visibleHelpTopics(ctx);
  return topics.find((t) => t.matches(pathname, search)) ?? topics[0] ?? HELP_TOPICS[0];
}
