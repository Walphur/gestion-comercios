import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DOCS = path.join(ROOT, "docs");
const SITE = "https://walqo.pro";
const WHATSAPP = "https://wa.me/5492664580915";

const COMPLETO = "WalQo Completo sale $35.000 por mes. Podés probarlo gratis, con hasta 25 productos y 50 ventas por mes.";
const PRO = "Este rubro viene con Pro, que sale $60.000 por mes e incluye tres PCs, presupuestos, turnos, remitos y órdenes.";
const OFFLINE = {
  q: "¿Funciona sin internet?",
  a: "Sí. WalQo se instala en la PC del local. Hace falta conexión para bajarlo y crear la cuenta; después las ventas se guardan en esa computadora aunque se corte internet.",
};

export const PAGES = [
  {
    slug: "software-para-farmacias",
    name: "Sistema para farmacias",
    title: "Sistema para farmacias y droguerías | WalQo",
    description: "Sistema para farmacias con punto de venta, lotes, vencimientos y stock por partida. WalQo funciona en la PC de la farmacia, también sin internet.",
    h1: "Sistema para farmacias, con lotes y vencimientos",
    lede: "Vendé en el mostrador y sabé qué partida vence primero, sin una planilla aparte.",
    shot: "productos.png",
    alt: "Listado de productos de WalQo con código, precio y stock",
    plan: "completo",
    blocks: [
      {
        h2: "Stock por lote y fecha de vencimiento",
        p: [
          "En el rubro farmacia cada producto puede llevar sus partidas: el número de lote, la fecha de vencimiento y cuántas unidades quedan de cada una.",
          "Así ves qué conviene vender primero y qué está por vencer antes de que quede en la góndola.",
        ],
      },
      {
        h2: "Mostrador con código de barras",
        p: ["Escaneás la caja con el lector y el producto entra al ticket. Cada venta descuenta el stock de la partida."],
        list: ["Código de barras y código interno", "Venta por unidad, caja o pack", "Categorías para ordenar el catálogo", "Caja del turno con apertura y cierre"],
      },
      {
        h2: "Lo que no hace",
        p: ["WalQo es el sistema del mostrador: ventas, stock, caja y clientes. No valida recetas ni liquida obras sociales con las prestadoras."],
      },
    ],
    faq: [
      { q: "¿Puedo cargar el mismo medicamento con dos vencimientos?", a: "Sí. Cada lote tiene su fecha y su cantidad, y el stock total es la suma de las partidas." },
      OFFLINE,
      { q: "¿Sirve para una droguería?", a: "Sí, si vende por unidad, caja o pack con código de barras. El control por lote es el mismo." },
      { q: "¿Cuánto sale?", a: COMPLETO },
    ],
    related: ["software-para-comercios", "gestion-de-stock", "software-para-pet-shop", "precios"],
  },
  {
    slug: "software-para-ferreterias",
    name: "Sistema para ferreterías",
    title: "Sistema para ferreterías y casas de repuestos | WalQo",
    description: "Sistema para ferreterías con venta por unidad, kilo, metro o litro, código de barras y control de stock. WalQo corre en la PC del local.",
    h1: "Sistema para ferreterías: por unidad, kilo o metro",
    lede: "Cobrá el tornillo suelto, el cable por metro y la pintura por litro desde la misma pantalla.",
    shot: "pos.png",
    alt: "Punto de venta de WalQo con productos y ticket",
    plan: "completo",
    blocks: [
      {
        h2: "Cada producto con su unidad",
        p: ["En el rubro ferretería un artículo se vende por unidad, kilo, metro, litro o caja. Al cobrar ponés la cantidad o el importe y WalQo calcula el resto."],
        list: ["Clavos y bulones por kilo o por importe", "Cable y manguera por metro", "Pinturas y solventes por litro", "Cajas cerradas por unidad"],
      },
      {
        h2: "Miles de artículos, ordenados",
        p: [
          "Buscás por nombre, código de barras o código interno. Las categorías, marcas y proveedores filtran el listado cuando el catálogo es grande.",
          "Cada venta descuenta del stock y el producto bajo mínimo aparece en las alertas.",
        ],
      },
      {
        h2: "Presupuestos y remitos",
        p: ["Si necesitás presupuestar un trabajo o entregar con remito, eso viene con el plan Pro."],
      },
    ],
    faq: [
      { q: "¿Puedo vender por importe, por ejemplo $2.000 de clavos?", a: "Sí. En los productos por peso ponés el importe y WalQo calcula la cantidad." },
      { q: "¿Sirve para una casa de repuestos?", a: "Sí. El rubro se llama Ferretería / Repuestos y usa código de barras, código interno y stock por artículo." },
      OFFLINE,
      { q: "¿Cuánto sale?", a: COMPLETO },
    ],
    related: ["software-para-comercios", "gestion-de-stock", "sistema-punto-de-venta", "precios"],
  },
  {
    slug: "software-para-verdulerias",
    name: "Sistema para verdulerías",
    title: "Sistema para verdulerías y fruterías | WalQo",
    description: "Sistema para verdulerías: vendé por kilo o por monto fijo, leé la etiqueta de la balanza y controlá la caja. WalQo funciona sin internet.",
    h1: "Sistema para verdulerías, por kilo o por importe",
    lede: "Pesás, cobrás y la caja queda cerrada al final del día.",
    shot: "pos.png",
    alt: "Punto de venta de WalQo con un ticket en curso",
    plan: "completo",
    blocks: [
      {
        h2: "Venta por peso o por monto",
        p: ["Cada producto se vende por kilo, gramo, unidad, atado o cajón. Si el cliente pide $1.500 de tomate, ponés el importe y listo."],
      },
      {
        h2: "Etiqueta de la balanza",
        p: [
          "Si tu balanza imprime etiquetas con código de barras, WalQo las lee: reconoce el producto por su PLU y toma el importe o el peso de la etiqueta.",
          "Se configura una vez, según cómo imprime tu balanza.",
        ],
      },
      {
        h2: "Caja del día",
        p: ["Abrís el turno, registrás los pagos a proveedores como egresos y al cerrar contás el efectivo. WalQo te muestra la diferencia."],
      },
    ],
    faq: [
      { q: "¿Se conecta directo a la balanza?", a: "No por cable. Lee la etiqueta con código de barras que imprime la balanza." },
      { q: "¿Necesito cargar códigos de barras?", a: "No. En verdulería buscás el producto por nombre o por su PLU." },
      OFFLINE,
      { q: "¿Cuánto sale?", a: COMPLETO },
    ],
    related: ["software-para-almacenes", "software-para-panaderias", "sistema-punto-de-venta", "precios"],
  },
  {
    slug: "software-para-tiendas-de-ropa",
    name: "Sistema para tiendas de ropa",
    title: "Sistema para tiendas de ropa y calzado | WalQo",
    description: "Sistema para tiendas de ropa con talles y colores, cada uno con su stock. Punto de venta, caja y clientes en la PC del local.",
    h1: "Sistema para tiendas de ropa, con talles y colores",
    lede: "Sabé cuántas remeras te quedan en talle M y color negro sin ir al depósito.",
    shot: "productos.png",
    alt: "Catálogo de productos de WalQo",
    plan: "completo",
    blocks: [
      {
        h2: "Una prenda, todas sus variantes",
        p: ["En el rubro ropa cargás la prenda una vez y le sumás talles y colores. Cada combinación tiene su propio stock y su código."],
        list: ["Talle y color por variante", "Stock separado por combinación", "Código de barras por variante", "Sirve también para calzado"],
      },
      {
        h2: "Cobro rápido",
        p: ["Escaneás la etiqueta o buscás la prenda, elegís la variante y cobrás. La venta descuenta solo esa combinación."],
      },
      {
        h2: "Clientes y cuenta corriente",
        p: ["Si fiás o tomás señas, la cuenta del cliente muestra cuánto debe y qué pagó."],
      },
    ],
    faq: [
      { q: "¿Puedo ver el stock de un talle en particular?", a: "Sí. Cada combinación de talle y color tiene su cantidad." },
      { q: "¿Sirve para una zapatería?", a: "Sí. El rubro es Ropa / Indumentaria y usa las mismas variantes para calzado." },
      OFFLINE,
      { q: "¿Cuánto sale?", a: COMPLETO },
    ],
    related: ["software-para-comercios", "gestion-de-stock", "software-para-electronica", "precios"],
  },
  {
    slug: "software-para-pet-shop",
    name: "Sistema para pet shop",
    title: "Sistema para pet shop y forrajerías | WalQo",
    description: "Sistema para pet shop y forrajerías: alimento suelto por kilo o por importe, bolsas cerradas, vencimientos y stock. WalQo funciona sin internet.",
    h1: "Sistema para pet shop y forrajerías",
    lede: "Vendé el alimento suelto por kilo y la bolsa cerrada desde la misma pantalla.",
    shot: "pos.png",
    alt: "Punto de venta de WalQo",
    plan: "completo",
    blocks: [
      {
        h2: "Suelto o cerrado",
        p: ["Cada producto se vende por kilo, gramo, unidad, bolsa o saco. Si piden $3.000 de alimento suelto, ponés el importe y WalQo calcula los kilos."],
      },
      {
        h2: "Vencimientos a la vista",
        p: ["El alimento y los medicamentos veterinarios llevan fecha de vencimiento. El inicio muestra lo que vence en los próximos 14 días."],
      },
      {
        h2: "Stock y reposición",
        p: ["Cada venta descuenta. Con un stock mínimo por producto sabés qué pedir al proveedor antes de quedarte sin bolsas."],
      },
    ],
    faq: [
      { q: "¿Puedo vender una bolsa abierta por kilo?", a: "Sí. Cargás el alimento suelto como producto por peso y lo cobrás por kilo o por importe." },
      OFFLINE,
      { q: "¿Sirve para una forrajería?", a: "Sí. El rubro se llama Pet shop / Forrajería e incluye bolsa y saco como unidades." },
      { q: "¿Cuánto sale?", a: COMPLETO },
    ],
    related: ["software-para-comercios", "gestion-de-stock", "software-para-farmacias", "precios"],
  },
  {
    slug: "software-para-panaderias",
    name: "Sistema para panaderías",
    title: "Sistema para panaderías y confiterías | WalQo",
    description: "Sistema para panaderías: venta rápida por unidad, docena o kilo, etiqueta de balanza y fechas de elaboración. WalQo funciona en la PC del local.",
    h1: "Sistema para panaderías y confiterías",
    lede: "Facturas por docena, pan por kilo y la torta por unidad, en un mismo ticket.",
    shot: "pos.png",
    alt: "Punto de venta de WalQo con ticket",
    plan: "completo",
    blocks: [
      {
        h2: "Venta rápida en el mostrador",
        p: ["Cada producto se vende por unidad, kilo, docena o pack. Buscás por nombre o tocás el producto y cobrás."],
      },
      {
        h2: "Pan por kilo",
        p: ["Ponés el peso o el importe. Si la balanza imprime etiqueta con código, WalQo la lee y carga el producto con su precio."],
      },
      {
        h2: "Fechas de elaboración",
        p: ["Cada producto puede llevar su fecha, para saber qué salió del horno hoy y qué conviene vender primero."],
      },
    ],
    faq: [
      { q: "¿Puedo vender por docena?", a: "Sí. Docena es una de las unidades del rubro panadería." },
      { q: "¿Se conecta a la balanza?", a: "Lee la etiqueta con código de barras que imprime la balanza. No se conecta por cable." },
      OFFLINE,
      { q: "¿Cuánto sale?", a: COMPLETO },
    ],
    related: ["software-para-verdulerias", "software-para-restaurantes", "sistema-punto-de-venta", "precios"],
  },
  {
    slug: "software-para-restaurantes",
    name: "Sistema para restaurantes y bares",
    title: "Sistema para restaurantes, bares y take away | WalQo",
    description: "Sistema para restaurantes, bares y take away: carta en el punto de venta, para llevar o delivery, propina y ticket de cocina. Sin mesas.",
    h1: "Sistema para restaurantes, bares y take away",
    lede: "Tomá el pedido desde la carta, mandá el ticket a la cocina y cobrá con propina.",
    shot: "pos.png",
    alt: "Punto de venta de WalQo",
    plan: "completo",
    blocks: [
      {
        h2: "La carta en el mostrador",
        p: ["El punto de venta muestra la carta por categoría: entradas, principales, pizzas, bebidas, postres y combos. Tocás el plato y entra al pedido."],
        list: ["Mostrador, para llevar o delivery", "Pedidos pendientes hasta que salen", "Propina opcional al cobrar", "Ticket de cocina o barra al vender"],
      },
      {
        h2: "Insumos, elaborados y combos",
        p: [
          "Cada producto tiene un tipo: para vender, insumo, elaborado, combo o menú del día. Los insumos no salen en la carta.",
          "Un elaborado puede llevar su receta, para que la producción descuente los insumos.",
        ],
      },
      {
        h2: "Carta online",
        p: ["La carta se puede publicar en walqo.pro para que el cliente la vea en el celular y pida por WhatsApp."],
      },
    ],
    faq: [
      { q: "¿Maneja mesas?", a: "No. Está pensado para mostrador, take away y delivery." },
      { q: "¿Imprime en la cocina?", a: "Sí. Al vender puede imprimir el ticket de cocina o barra." },
      OFFLINE,
      { q: "¿Cuánto sale?", a: COMPLETO },
    ],
    related: ["software-para-panaderias", "sistema-punto-de-venta", "software-para-comercios", "precios"],
  },
  {
    slug: "software-para-librerias",
    name: "Sistema para librerías",
    title: "Sistema para librerías y papelerías | WalQo",
    description: "Sistema para librerías y papelerías con código de barras, categorías y stock por unidad, pack o resma. WalQo funciona en la PC del local.",
    h1: "Sistema para librerías y papelerías",
    lede: "Del lápiz suelto a la resma cerrada, todo con su precio y su stock.",
    shot: "productos.png",
    alt: "Listado de productos de WalQo",
    plan: "completo",
    blocks: [
      {
        h2: "Catálogo ordenado",
        p: ["Cada artículo lleva código de barras, código interno y categoría. Se vende por unidad, pack, resma o caja."],
      },
      {
        h2: "Temporada escolar",
        p: ["Cuando entra mercadería, cargás la compra y el stock sube. Las alertas muestran lo que está por terminarse antes de que empiece la fila de marzo."],
      },
      {
        h2: "Clientes y fiado",
        p: ["La cuenta corriente del cliente muestra lo que debe y lo que pagó, por si vendés a colegios o a clientes de siempre."],
      },
    ],
    faq: [
      { q: "¿Puedo vender por resma y por unidad?", a: "Sí. Resma, pack, caja y unidad son unidades del rubro librería." },
      OFFLINE,
      { q: "¿Lee el código de barras de los útiles?", a: "Sí, con cualquier lector USB que funcione como teclado." },
      { q: "¿Cuánto sale?", a: COMPLETO },
    ],
    related: ["software-para-comercios", "gestion-de-stock", "software-para-kioscos", "precios"],
  },
  {
    slug: "software-para-electronica",
    name: "Sistema para casas de electrónica y celulares",
    title: "Sistema para venta de celulares y electrónica | WalQo",
    description: "Sistema para casas de electrónica y celulares: modelos con color y capacidad, código interno por variante, stock y caja en la PC del local.",
    h1: "Sistema para casas de electrónica y celulares",
    lede: "Cada modelo con su color y su capacidad, y el stock de cada uno.",
    shot: "productos.png",
    alt: "Catálogo de productos de WalQo",
    plan: "completo",
    blocks: [
      {
        h2: "Modelos con variantes",
        p: ["Cargás el modelo una vez y le sumás colores y capacidades. Cada variante tiene su stock, su código de barras y su código interno."],
      },
      {
        h2: "Accesorios y servicio",
        p: ["Fundas, cargadores y auriculares van como productos comunes, con código de barras y stock por unidad."],
      },
      {
        h2: "Caja y clientes",
        p: ["Cada venta queda registrada con el medio de pago. Si vendés en cuotas propias, la cuenta corriente del cliente muestra el saldo."],
      },
    ],
    faq: [
      { q: "¿Puedo separar el stock por color y capacidad?", a: "Sí. Cada combinación de color y capacidad es una variante con su cantidad." },
      OFFLINE,
      { q: "¿Lleva el IMEI de cada equipo?", a: "WalQo guarda un código interno por variante. No registra un IMEI distinto por cada unidad vendida." },
      { q: "¿Cuánto sale?", a: COMPLETO },
    ],
    related: ["software-para-tiendas-de-ropa", "software-para-comercios", "gestion-de-stock", "precios"],
  },
  {
    slug: "software-para-supermercados",
    name: "Sistema para supermercados",
    title: "Sistema para supermercados y autoservicios | WalQo",
    description: "Sistema para supermercados y autoservicios: catálogo grande, código de barras, etiqueta de balanza y hasta tres cajas sincronizadas. Plan Pro.",
    h1: "Sistema para supermercados y autoservicios",
    lede: "Almacén, carnicería y verdulería en un mismo sistema, con varias cajas en el local.",
    shot: "stock.png",
    alt: "Pantalla de stock de WalQo",
    plan: "pro",
    blocks: [
      {
        h2: "Catálogo grande con código de barras",
        p: [
          "Buscás por nombre, código de barras o código interno, y filtrás por categoría, marca o proveedor.",
          "El catálogo de alrededor de 200.000 productos completa el nombre cuando escaneás un código nuevo.",
        ],
      },
      {
        h2: "Secciones con balanza",
        p: ["La carnicería y la verdulería venden por kilo. WalQo lee la etiqueta que imprime la balanza y toma el importe o el peso."],
      },
      {
        h2: "Varias cajas en el local",
        p: ["Con Pro se sincronizan hasta tres computadoras en la misma red: comparten productos, precios y stock."],
      },
    ],
    faq: [
      { q: "¿Cuántas cajas puedo tener?", a: "Pro sincroniza hasta tres PCs en la misma red del local." },
      { q: "¿Lee etiquetas de balanza?", a: "Sí. Lee el código con PLU que imprime la balanza, por importe o por peso." },
      OFFLINE,
      { q: "¿Cuánto sale?", a: PRO },
    ],
    related: ["software-para-almacenes", "software-para-verdulerias", "gestion-de-stock", "precios"],
  },
  {
    slug: "software-para-talleres",
    name: "Sistema para talleres mecánicos",
    title: "Sistema para talleres mecánicos | WalQo",
    description: "Sistema para talleres mecánicos: órdenes de trabajo, presupuestos, repuestos, vehículos por patente y turnos online. Plan Pro.",
    h1: "Sistema para talleres mecánicos",
    lede: "La orden, los repuestos y el historial del auto, en el mismo lugar.",
    shot: "productos.png",
    alt: "Listado de repuestos en WalQo",
    plan: "pro",
    blocks: [
      {
        h2: "Órdenes y presupuestos",
        p: ["Armás el presupuesto con mano de obra y repuestos, y cuando el cliente acepta lo pasás a orden de trabajo."],
        list: ["Vehículo por patente, con kilometraje", "Servicios de mano de obra sin stock", "Repuestos con código y stock", "Remitos al entregar"],
      },
      {
        h2: "Historial del vehículo",
        p: [
          "La misma patente no se duplica: el taller ve los trabajos anteriores de ese auto.",
          "El cliente puede consultar su historial desde walqo.pro con el enlace del taller.",
        ],
      },
      {
        h2: "Turnos online",
        p: ["El taller puede compartir un enlace para que el cliente pida turno. La reserva llega a la agenda cuando abrís WalQo en la PC."],
      },
    ],
    faq: [
      { q: "¿Sirve para tren delantero o gomería?", a: "Sí. El rubro es Taller / Tren delantero y separa mano de obra de repuestos." },
      { q: "¿El cliente puede ver su historial?", a: "Sí, desde walqo.pro con el enlace del taller." },
      OFFLINE,
      { q: "¿Cuánto sale?", a: PRO },
    ],
    related: ["software-para-ferreterias", "software-para-peluquerias", "software-para-comercios", "precios"],
  },
  {
    slug: "software-para-peluquerias",
    name: "Sistema de turnos para peluquerías",
    title: "Sistema de turnos para peluquerías, barberías y estética | WalQo",
    description: "Sistema de turnos para peluquerías, barberías y centros de estética: reserva online, servicios con duración y profesional, y venta de productos. Plan Pro.",
    h1: "Turnos para peluquerías, barberías y estética",
    lede: "El cliente reserva desde el celular y el turno aparece en tu agenda.",
    shot: "pos.png",
    alt: "Punto de venta de WalQo para vender productos del salón",
    plan: "pro",
    blocks: [
      {
        h2: "Reserva online",
        p: [
          "Compartís un enlace como walqo.pro/NombreDelLocal. El cliente elige el servicio, el día, el horario y el profesional.",
          "El turno queda guardado al confirmarse y entra en la agenda cuando WalQo está abierto en la PC.",
        ],
      },
      {
        h2: "Servicios con duración",
        p: ["Cada servicio tiene su duración y quién lo hace. El turnero ofrece solo los horarios libres de ese profesional, con otro horario para el sábado y el domingo si hace falta."],
      },
      {
        h2: "Productos e insumos",
        p: ["Vendés shampoo, tinturas o cremas desde el mismo sistema. Un servicio puede llevar insumos que se descuentan del stock."],
      },
    ],
    faq: [
      { q: "¿El cliente necesita bajar una app?", a: "No. Reserva desde el navegador del celular con el enlace del local." },
      { q: "¿Puede elegir el profesional?", a: "Sí, o dejar que el sistema asigne a cualquiera que esté libre." },
      { q: "¿El pago es online?", a: "No. La reserva queda programada y el pago es en el local." },
      { q: "¿Cuánto sale?", a: PRO },
    ],
    related: ["software-para-consultorios", "software-para-talleres", "software-para-comercios", "precios"],
  },
  {
    slug: "software-para-consultorios",
    name: "Sistema para consultorios",
    title: "Sistema para consultorios y clínicas: turnos y pacientes | WalQo",
    description: "Sistema para consultorios: pacientes con obra social, turnos por profesional, agenda del día y nota interna de la atención. Plan Pro.",
    h1: "Sistema para consultorios y clínicas",
    lede: "Pacientes, turnos y la agenda de cada profesional, sin cuaderno.",
    shot: "inicio.png",
    alt: "Pantalla de inicio de WalQo",
    plan: "pro",
    blocks: [
      {
        h2: "Pacientes y obras sociales",
        p: ["Cada paciente tiene contacto, DNI, domicilio, fecha de nacimiento y obra social. El listado se busca por nombre o documento."],
      },
      {
        h2: "Turnos por profesional",
        p: [
          "Primero elegís el servicio y después solo aparecen los profesionales habilitados. El sistema no deja guardar un turno fuera de horario ni uno que se pisa con otro.",
          "El inicio del consultorio muestra a quién llamar y los turnos del día.",
        ],
      },
      {
        h2: "Agenda y nota interna",
        p: ["Cada profesional ve solo sus turnos y puede dejar una nota interna de la atención. En odontología, la ficha marca cada diente."],
      },
    ],
    faq: [
      { q: "¿Es una historia clínica?", a: "No. La nota y la ficha dental son internas. No reemplazan la historia clínica oficial ni la receta electrónica." },
      { q: "¿Los pacientes pueden pedir turno online?", a: "Sí, con el enlace del consultorio en walqo.pro." },
      OFFLINE,
      { q: "¿Cuánto sale?", a: PRO },
    ],
    related: ["software-para-peluquerias", "software-para-farmacias", "software-para-comercios", "precios"],
  },
];

const LABELS = {
  "software-para-comercios": "Software para comercios",
  "software-para-kioscos": "Programa para kioscos",
  "software-para-almacenes": "Sistema para almacenes",
  "gestion-de-stock": "Control de stock",
  "sistema-punto-de-venta": "Sistema punto de venta",
  precios: "Precios",
};
for (const page of PAGES) LABELS[page.slug] = page.name;

function esc(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function jsonLd(page) {
  const url = `${SITE}/${page.slug}/`;
  const offer = page.plan === "pro"
    ? { "@type": "Offer", price: "60000", priceCurrency: "ARS", description: "Plan Pro, por mes" }
    : { "@type": "Offer", price: "35000", priceCurrency: "ARS", description: "WalQo Completo, por mes" };
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "WalQo",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Windows 10, Windows 11",
        url: `${SITE}/`,
        downloadUrl: "https://github.com/Walphur/gestion-comercios/releases/latest",
        offers: offer,
        description: page.description,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: page.name, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: page.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  }, null, 2);
}

function block(b) {
  const paragraphs = (b.p || []).map((p) => `<p>${esc(p)}</p>`).join("");
  const list = b.list ? `<ul>${b.list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>` : "";
  return `
    <section class="block">
      <div class="wrap">
        <h2>${esc(b.h2)}</h2>
        ${paragraphs}${list}
      </div>
    </section>
`;
}

function render(page) {
  const url = `${SITE}/${page.slug}/`;
  const image = `${SITE}/marketing/shots/${page.shot}`;
  const [first, ...rest] = page.blocks;
  const buyText = encodeURIComponent(`Hola! Quiero WalQo para mi negocio (${page.name.replace(/^Sistema (de turnos )?para /, "")})`);
  const related = page.related
    .map((slug) => `          <a href="/${slug}/">${esc(LABELS[slug] || slug)}</a>`)
    .join("\n");
  const faq = page.faq
    .map((f) => `        <article><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></article>`)
    .join("\n");
  const planLine = page.plan === "pro"
    ? "Este rubro viene con el plan Pro."
    : "Probalo gratis en la PC del negocio.";

  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.description)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="WalQo" />
  <meta property="og:locale" content="es_AR" />
  <meta property="og:title" content="${esc(page.title)}" />
  <meta property="og:description" content="${esc(page.description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${image}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(page.title)}" />
  <meta name="twitter:description" content="${esc(page.description)}" />
  <meta name="twitter:image" content="${image}" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/branding/walqo-mark.png" type="image/png" />
  <link rel="apple-touch-icon" href="/branding/favicon-192.png" />
  <link rel="preconnect" href="https://api.fontshare.com" crossorigin />
  <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" />
  <link rel="stylesheet" href="/assets/site.css" />
  <script type="application/ld+json">
${jsonLd(page)}
  </script>
</head>
<body>
  <div class="nav-dock">
    <header class="nav" id="nav">
      <a class="brand" href="/">
        <img src="/branding/walqo-mark.svg" alt="" width="28" height="28" />
        WalQo
      </a>
      <button class="nav-toggle" id="nav-toggle" type="button" aria-expanded="false" aria-controls="nav-links">Menú</button>
      <nav class="nav-links" id="nav-links" aria-label="Principal">
        <a href="/#producto">Producto</a>
        <a href="/funciones/">Funciones</a>
        <a href="/como-funciona/">Cómo funciona</a>
        <a href="/precios/">Precios</a>
      </nav>
      <a class="btn btn-primary nav-cta is-loading" data-download data-track="probar_gratis" href="#" aria-busy="true">Probar gratis</a>
    </header>
  </div>
<main>
  <section class="page-hero">
    <div class="wrap">
      <nav class="crumbs" aria-label="Migas">
        <a href="/">Inicio</a>
        <span aria-hidden="true">/</span>
        <a href="/software-para-comercios/">Rubros</a>
        <span aria-hidden="true">/</span>
        <span>${esc(page.name)}</span>
      </nav>
      <h1>${esc(page.h1)}</h1>
      <p class="lede">${esc(page.lede)}</p>
    </div>
  </section>

    <section>
      <div class="wrap split">
        <div class="block" style="padding-top:8px">
          <h2>${esc(first.h2)}</h2>${(first.p || []).map((p) => `<p>${esc(p)}</p>`).join("")}${first.list ? `<ul>${first.list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>` : ""}
        </div>
        <figure class="shot">
          <img src="/marketing/shots/${page.shot}" alt="${esc(page.alt)}" width="1200" height="750" loading="lazy" />
        </figure>
      </div>
    </section>
${rest.map(block).join("")}
    <section class="block">
      <div class="wrap faq">
        <h2>Preguntas frecuentes</h2>
${faq}
      </div>
    </section>

    <section class="block">
      <div class="wrap">
        <h2>Seguí por acá</h2>
        <nav class="related" aria-label="Páginas relacionadas">
${related}
        </nav>
      </div>
    </section>

    <section class="page-cta">
      <div class="wrap">
        <h2>Instalá WalQo en la PC del negocio</h2>
        <p class="lede" style="margin-top:12px">${esc(planLine)} Si tenés dudas, escribinos y lo vemos con tu caso.</p>
        <div class="btn-row" style="margin-top:18px">
          <a class="btn btn-primary is-loading" data-download data-track="cta_principal" href="#" aria-busy="true">Probar WalQo</a>
          <a class="btn btn-ghost" data-buy href="${WHATSAPP}?text=${buyText}" target="_blank" rel="noopener">Hablar por WhatsApp</a>
        </div>
      </div>
    </section>

</main>
  <footer>
    <div class="wrap foot">
      <a class="brand" href="/">
        <img src="/branding/walqo-mark.svg" alt="" width="28" height="28" />
        WalQo
      </a>
      <nav aria-label="Pie">
        <a href="/#producto">Producto</a>
        <a href="/funciones/">Funciones</a>
        <a href="/precios/">Precios</a>
        <a href="/software-para-comercios/#rubros">Rubros</a>
        <a href="/recursos/">Recursos</a>
        <a data-whatsapp href="${WHATSAPP}" target="_blank" rel="noopener">Contacto</a>
        <a href="/app/">Mi comercio</a>
        <a href="/legal/privacidad.html">Privacidad</a>
        <a href="/legal/terminos.html">Términos</a>
      </nav>
      <p>© WalQo · San Luis, Argentina</p>
    </div>
  </footer>
  <script src="/assets/site.js"></script>
</body>
</html>
`;
}

for (const page of PAGES) {
  const dir = path.join(DOCS, page.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), render(page), "utf8");
  console.log(page.slug);
}
