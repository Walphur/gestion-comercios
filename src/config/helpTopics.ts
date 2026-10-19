import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  Calendar,
  FileText,
  HandCoins,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Sparkles,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import type { RubroDefinition } from "./rubros";
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
}

export interface HelpTopic {
  id: string;
  title: string;
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
      ctx.rubro.fields.barcode
        ? "Pasá el lector o escribí parte del nombre y apretá Enter: el producto entra al ticket."
        : "Escribí parte del nombre y apretá Enter: entra al ticket.",
      "F2 o Ctrl + Enter abre el cobro. De F3 a F7 elegís el medio de pago.",
      ...(ctx.rubro.posBulkWeight ? ["F8 cobra un monto en pesos, ideal para fiambre o verdura suelta."] : []),
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
      "Cargá el costo además del precio: así Inicio te muestra la ganancia estimada.",
      ...(ctx.features.stock ? ["Con un stock mínimo, WalQo te avisa cuando queda poco."] : []),
      ...(ctx.rubro.fields.expiry ? ["Si cargás vencimiento, ves en Inicio lo que vence en los próximos 14 días."] : []),
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
    tips: () => [
      "Ajustar corrige la cantidad cuando contás la mercadería.",
      "Ingreso compra suma lo que te trajo el proveedor.",
      "Movimientos muestra cada cambio, con fecha y usuario.",
    ],
  },
  {
    id: "clientes",
    title: "Clientes",
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
            "Fiado: vendé a cuenta y el cliente queda con saldo.",
            "Registrar cobro descuenta lo que te pagó.",
            "Desde el historial del cliente ves todo lo que compró.",
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
      "Anotá ingresos y egresos (un pago al proveedor, un retiro) para que el arqueo cierre.",
      "Al cerrar turno contás el efectivo y WalQo te muestra si sobra o falta.",
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
      "Elegí el período y mirá cuánto vendiste día por día.",
      "CSV baja los datos para abrirlos en Excel.",
      "La ganancia sale de los costos que cargaste en cada producto.",
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
    tips: () => [
      "Cada persona entra con su propio PIN.",
      "El cajero vende y maneja la caja; la configuración queda para el administrador.",
      "Así sabés quién vendió y quién abrió o cerró la caja.",
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
  return HELP_TOPICS.filter((t) => t.visible(ctx));
}

export function helpTopicFor(pathname: string, search: string, ctx: HelpContext): HelpTopic {
  const topics = visibleHelpTopics(ctx);
  return topics.find((t) => t.matches(pathname, search)) ?? topics[0] ?? HELP_TOPICS[0];
}
