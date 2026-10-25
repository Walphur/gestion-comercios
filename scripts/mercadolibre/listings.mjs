/**
 * Publicaciones de Mercado Libre por rubro. Fuente única para publicaciones.md,
 * publicaciones.json y las imágenes (scripts/build-mercadolibre.mjs).
 * Precios: src/config/pricing.ts. Lo que incluye cada plan: src/config/planEntitlements.ts.
 */

export const PLANS = {
  completo: {
    name: "WalQo Completo",
    monthly: 35_000,
    quarter: 94_500,
    annual: 350_000,
    pcs: 2,
  },
  pro: {
    name: "WalQo Pro",
    monthly: 60_000,
    quarter: 162_000,
    annual: 600_000,
    pcs: 3,
  },
  permanente: {
    name: "WalQo Permanente",
    once: 12_000,
    pcs: 1,
  },
};

/**
 * Cargo por vender de ML Argentina, publicación Clásica, Computación > Software (MLA1728).
 * Tabla de costos de ML vigente desde el 1/9/2026: 15% + costo fijo por unidad
 * según el precio (desde $33.000 no hay costo fijo). Confirmar en la calculadora de ML.
 */
export const ML_FEE = {
  percent: 0.15,
  fixed: [
    { upTo: 14_999, fee: 1_330 },
    { upTo: 23_999, fee: 2_740 },
    { upTo: 32_999, fee: 3_320 },
    { upTo: Infinity, fee: 0 },
  ],
  source: "Tabla de costos por vender de Mercado Libre Argentina (vigente desde el 1/9/2026): Clásica Computación/Software 15% + costo fijo por unidad debajo de $33.000",
};

export function mlFixedFee(price) {
  return ML_FEE.fixed.find((t) => price <= t.upTo).fee;
}

/** Lo que queda después del cargo de ML. */
export function mlNet(price) {
  return Math.round(price * (1 - ML_FEE.percent) - mlFixedFee(price));
}

/** Precio más bajo (redondeado a centenas) que deja al menos `net` después del cargo de ML. */
export function priceWithFee(net) {
  for (const tier of ML_FEE.fixed) {
    const p = Math.ceil((net + tier.fee) / (1 - ML_FEE.percent) / 100) * 100;
    const prevUpTo = ML_FEE.fixed[ML_FEE.fixed.indexOf(tier) - 1]?.upTo ?? 0;
    if (p > prevUpTo && p <= tier.upTo) return p;
  }
  throw new Error(`Sin precio para neto ${net}`);
}

const fmt = (n) => "$" + n.toLocaleString("es-AR");

const COMPLETO_INCLUYE = `Qué incluye WalQo Completo:
- Ventas, productos, stock, clientes y caja, sin límite.
- 2 computadoras del mismo local, sincronizadas entre sí.
- Factura electrónica de ARCA (con tu CUIT y tu punto de venta habilitado).
- Cobro con QR de Mercado Pago desde la PC y conexión con Tienda Nube.
- Catálogo de unos 200.000 productos con código de barras, para cargar más rápido.
- Carga de compras con una foto de la factura del proveedor.
- Tienda web del local con hasta 4 fotos por producto.
- Gastos, tesorería y reportes con la ganancia real del mes.
- Actualizaciones y asistencia.`;

const PRO_INCLUYE = `Qué incluye WalQo Pro:
- Todo lo de WalQo Completo: ventas, stock, clientes, caja, factura electrónica de ARCA, Mercado Pago, Tienda Nube, catálogo de productos y tienda web.
- 3 computadoras del mismo local, sincronizadas entre sí.
- Presupuestos, turnos, remitos y órdenes de trabajo.
- Los rubros que lo necesitan: supermercado, taller y clínica.
- Actualizaciones y asistencia.`;

const REQUISITOS = `Requisitos:
- PC con Windows 10 u 11 (no funciona en Windows 7 ni en Mac).
- En la computadora funciona sin internet: podés vender y cobrar igual si se corta.
- Internet hace falta para activar la licencia, sincronizar las computadoras, el celular, la tienda web, los turnos online, Mercado Pago y la factura electrónica.`;

const entrega = (periodo) => `Cómo es la entrega:
Es un producto digital, no se envía nada físico. Después de la compra te mandamos por la mensajería de Mercado Libre cómo descargar el instalador oficial y tu clave de licencia ${periodo}. Si te trabás con la instalación, te ayudamos por mensaje hasta que quede andando.`;

const pruebaGratis = (topes) =>
  `Antes de comprar podés probarlo: al instalarlo tenés 7 días de prueba con todas las funciones. Después, si no comprás, sigue en el plan gratis${topes ? ` (${topes})` : ""}, sin perder lo que cargaste.`;

const PERIODO_PRIMER_MES = "por el primer mes";

/** Qué se compra en ML y cómo se sigue después (la renovación se cobra dentro de WalQo). */
const compraYRenovacion = (planKey) => {
  const p = PLANS[planKey];
  return `Qué comprás acá:
La instalación, la activación y el primer mes de ${p.name}. Te ayudamos a dejarlo andando en tu computadora y te pasamos la clave de licencia.

Cómo seguís después del primer mes:
Unos días antes de que se venza, WalQo te avisa en la pantalla. La renovación se hace desde el programa, sin pasar por Mercado Libre: por mes (${fmt(p.monthly)}), por 3 meses con 10% menos (${fmt(p.quarter)}) o por año, 12 meses al precio de 10 (${fmt(p.annual)}). Seguís con la misma clave y todo lo que cargaste. Si no renovás, WalQo pasa solo al plan gratis, con tope de productos y de ventas por mes: no se borra nada de lo que cargaste, y cuando renovás vuelve todo.`;
};

/** Precio publicado (primer mes + cargo de ML) y renovaciones por plan. */
function firstMonthPricing(planKey) {
  const p = PLANS[planKey];
  return {
    plan: p.name,
    period: "Primer mes, con instalación y activación (después se renueva desde WalQo)",
    price: priceWithFee(p.monthly),
    net_price: p.monthly,
    alternatives: [
      { period: "Renovación por mes (desde WalQo)", price: p.monthly },
      { period: "Renovación por 3 meses, 10% menos (desde WalQo)", price: p.quarter },
      { period: "Renovación por 12 meses, pagás 10 (desde WalQo)", price: p.annual },
    ],
    pcs: p.pcs,
  };
}

const COMMON_ATTRS = (plan, pcs, duration) => [
  { id: "BRAND", name: "Marca", value_name: "WalQo" },
  { id: "MODEL", name: "Modelo", value_name: plan },
  { name: "Formato de distribución", value_name: "Digital" },
  { name: "Tipo de licencia", value_name: duration === "Permanente" ? "Permanente" : "Suscripción" },
  { name: "Duración de la licencia", value_name: duration },
  { name: "Sistema operativo", value_name: "Windows 10, Windows 11" },
  { name: "Cantidad de usuarios/dispositivos", value_name: `${pcs} PC${pcs > 1 ? "s" : ""}` },
  { name: "Idioma", value_name: "Español" },
  { name: "Tipo de software", value_name: "Punto de venta y gestión comercial" },
  { name: "Condición del ítem", value_name: "Nuevo" },
];

export const LISTINGS = [
  {
    slug: "kiosco-almacen",
    rubro: "Kiosco / Almacén (con carnicería y fiambrería por kilo)",
    title: "Sistema punto de venta kiosco almacén stock facturación",
    category_hint: "Computación > Software > Gestión comercial / Otros (confirmar con el predictor de categorías)",
    ...firstMonthPricing("completo"),
    cover: {
      headline: "Sistema para kioscos y almacenes",
      sub: "Caja rápida, stock y fiado. También carnicería por kilo.",
      laptop: "docs:kiosco/app-caja.jpg",
      phone: "docs:kiosco/movil-tienda-inicio.jpg",
    },
    extras: [
      { headline: "Carnicería y fiambres por kilo", sub: "Con la etiqueta de la balanza o por importe: «dame $4.000 de picada».", laptop: "docs:kiosco/app-granel.jpg" },
      { headline: "Cobrás con lo que el cliente quiera", sub: "Efectivo, débito, crédito, transferencia, QR o fiado.", laptop: "docs:kiosco/app-cobrar.jpg" },
      { headline: "Stock con avisos de mínimo", sub: "Ves qué falta y armás el pedido al proveedor.", laptop: "docs:kiosco/app-stock.jpg" },
      { headline: "El fiado de cada cliente, en orden", sub: "Cuenta corriente con lo que debe y lo que fue pagando.", laptop: "cap:kiosco/app-fiado.jpg" },
    ],
    description: `WalQo es un sistema de punto de venta para kioscos y almacenes de barrio. Se instala en la PC del local y sirve para cobrar rápido, llevar el stock y saber cuánta plata entró en el día.

Pensado para kiosco y almacén:
- Cobro con lector de código de barras y atajos de teclado (buscar, cobrar y elegir el medio de pago sin usar el mouse).
- Carnicería, fiambrería o queso por kilo: lee la etiqueta con código de la balanza y trae el peso, o vendés por importe cuando el cliente pide "dame $4.000 de picada".
- Fecha de vencimiento en los productos que la necesitan.
- Fiado y cuenta corriente por cliente: cuánto debe, qué llevó y qué fue pagando.
- Caja con apertura, cierre y arqueo. Efectivo, débito, crédito, transferencia, QR y fiado.
- Aviso de stock bajo en el inicio y pedido al proveedor armado solo, para mandarlo por WhatsApp.
- Resumen del día para mandarte por WhatsApp o imprimir: cuánto se vendió y dónde entró la plata.
- Tienda web del local para que tus clientes te hagan pedidos desde el celular, con retiro o envío.

${COMPLETO_INCLUYE}

${compraYRenovacion("completo")}

${pruebaGratis("hasta 25 productos y 50 ventas por mes")}

${REQUISITOS}

${entrega(PERIODO_PRIMER_MES)}`,
    faq: [
      ["¿Cómo sigo después del primer mes?", "Unos días antes de que se venza, WalQo te avisa. La renovación se hace desde el programa: por mes ($35.000), por 3 meses con 10% menos ($94.500) o por año, 12 meses al precio de 10 ($350.000). Si no renovás, pasa al plan gratis y no se borra nada de lo que cargaste."],
      ["¿Sirve si tengo balanza en la carnicería?", "Sí. Si la balanza imprime etiqueta con código, la escaneás y entra con el peso. Si no, vendés por kilo o por importe a mano."],
      ["¿Puedo probarlo antes de comprar?", "Sí. Al instalarlo tenés 7 días con todo. Después queda en el plan gratis con 25 productos y 50 ventas por mes."],
      ["¿Necesito internet para vender?", "No. En la PC vende sin internet. Lo necesitás para activar, sincronizar y facturar."],
      ["¿Hace factura electrónica?", "Sí, WalQo Completo trae la factura electrónica de ARCA. Necesitás tu CUIT y un punto de venta habilitado."],
      ["¿En cuántas computadoras lo uso?", "WalQo Completo es para 2 computadoras del mismo local, sincronizadas."],
    ],
  },
  {
    slug: "supermercado",
    rubro: "Supermercado / Autoservicio",
    title: "Software punto de venta supermercado stock facturación",
    category_hint: "Computación > Software > Gestión comercial / Otros (confirmar con el predictor de categorías)",
    ...firstMonthPricing("pro"),
    cover: {
      headline: "Sistema para supermercados",
      sub: "Varias cajas, carnicería y verdulería por kilo, y stock al día.",
      laptop: "cap:supermercado/app-caja.jpg",
    },
    extras: [
      { headline: "Secciones con balanza", sub: "Carnicería, fiambrería y verdulería por peso o por importe.", laptop: "cap:supermercado/app-granel.jpg" },
      { headline: "El día del súper en una pantalla", sub: "Ventas, ganancia estimada, caja y productos que faltan.", laptop: "cap:supermercado/app-inicio.jpg" },
      { headline: "Cobro rápido en cada caja", sub: "Efectivo, débito, crédito, transferencia y QR.", laptop: "cap:supermercado/app-cobrar.jpg" },
      { headline: "Stock con alertas", sub: "Mínimos por producto y pedido de reposición por proveedor.", laptop: "cap:supermercado/app-stock.jpg" },
    ],
    description: `WalQo es un sistema de punto de venta para supermercados, autoservicios y mini-markets. Se instala en las computadoras del local y maneja catálogo grande, varias cajas y las secciones que venden por peso.

Pensado para supermercado:
- Hasta 3 computadoras sincronizadas con el plan Pro: cada caja vende y el stock es uno solo.
- Carnicería, fiambrería y verdulería por kilo: lee la etiqueta con código de la balanza o vendés por importe.
- Catálogo de unos 200.000 productos con código de barras para no cargar todo a mano.
- Carga de la mercadería que entra con una foto de la factura del proveedor, o importando un Excel.
- Proveedores con cuenta corriente y pedidos de reposición armados con lo que está bajo el mínimo.
- Fechas de vencimiento en los productos que la llevan.
- Caja por cajero con apertura, cierre y arqueo. Reportes por fechas y por cajero.
- Presupuestos y remitos para ventas grandes o entregas.
- Gastos fijos del mes, tesorería y ganancia real estimada.

${PRO_INCLUYE}

El rubro supermercado necesita el plan Pro.

${compraYRenovacion("pro")}

Antes de comprar podés probarlo: al instalarlo tenés 7 días de prueba con todas las funciones de Pro.

${REQUISITOS}

${entrega(PERIODO_PRIMER_MES)}`,
    faq: [
      ["¿Cómo sigo después del primer mes?", "Unos días antes de que se venza, WalQo te avisa. La renovación se hace desde el programa: por mes ($60.000), por 3 meses con 10% menos ($162.000) o por año, 12 meses al precio de 10 ($600.000). Si no renovás, pasa al plan gratis y no se borra nada de lo que cargaste."],
      ["¿Cuántas cajas puedo tener?", "El plan Pro incluye 3 computadoras del mismo local, sincronizadas."],
      ["¿Funciona con balanza?", "Sí. Lee la etiqueta con código de la balanza (peso o importe) y también podés vender por kilo a mano."],
      ["¿Tengo que cargar todos los productos?", "No. Trae un catálogo de unos 200.000 productos con código de barras y podés importar desde Excel."],
      ["¿Hace factura electrónica?", "Sí, factura electrónica de ARCA con tu CUIT y tu punto de venta."],
      ["¿Si se corta internet sigo vendiendo?", "Sí. Cada PC vende sin internet y sincroniza cuando vuelve."],
    ],
  },
  {
    slug: "gastronomia",
    rubro: "Gastronomía / Restaurante / Bar / Cafetería",
    title: "Sistema para restaurante y bar mesas QR comandas stock",
    category_hint: "Computación > Software > Gestión comercial / Otros (confirmar con el predictor de categorías)",
    ...firstMonthPricing("completo"),
    cover: {
      headline: "Sistema para restaurantes, bares y cafeterías",
      sub: "Mesas, comandas a cocina, QR en la mesa y mozos con el celular.",
      laptop: "docs:gastronomia/app-mesas.jpg",
      phone: { src: "docs:gastronomia/movil-carta-mesa.jpg", cropTop: 124 },
    },
    extras: [
      { headline: "La cuenta de cada mesa", sub: "Comanda por ronda, pre-cuenta, cambio de mesa y cobro en la caja.", laptop: "docs:gastronomia/app-mesa-cuenta.jpg" },
      { headline: "Los mozos toman el pedido con el celular", sub: "Cada comanda llega a cocina con el nombre del mozo.", phones: ["docs:gastronomia/movil-mozo-mesas.jpg", "docs:gastronomia/movil-mozo-comanda.jpg"] },
      { headline: "Un QR en cada mesa", sub: "El cliente mira la carta, pide, llama al mozo o pide la cuenta.", phones: [{ src: "docs:gastronomia/movil-carta-pedido.jpg", cropTop: 124 }, { src: "docs:gastronomia/movil-carta-mi-mesa.jpg", cropTop: 124 }] },
      { headline: "Mostrador, para llevar y delivery", sub: "Carta en la caja, propina al cobrar y ticket de cocina.", laptop: "docs:gastronomia/app-caja.jpg" },
    ],
    description: `WalQo es un sistema para restaurantes, bares, cafeterías y casas de comida. Se instala en la PC del local y junta el salón, la cocina y la caja en un mismo lugar.

Pensado para gastronomía:
- Mesas por sector (salón, vereda): abrís la mesa, cargás lo que piden y lo mandás a cocina por rondas, con ticket de cocina solo de lo nuevo.
- Pre-cuenta, cambio de mesa y cobro por la caja con propina y cualquier medio de pago.
- Un QR por mesa: el cliente ve la carta, hace el pedido, llama al mozo o pide la cuenta desde su celular. El pedido queda pendiente hasta que el personal lo confirma.
- Mozos desde el celular: cada mozo tiene su enlace, ve las mesas, toma la comanda y la manda directo a cocina con su nombre.
- Carta en la pantalla de la caja, para mostrador, para llevar y delivery.
- Productos para vender, insumos, elaborados, combos y menú del día.
- Carta web del local para recibir pedidos con retiro o envío.
- Caja con apertura y cierre, gastos, tesorería y resumen del día por WhatsApp.

Las mesas, el QR y los mozos sin límite vienen con WalQo Completo. En el plan gratis los probás con 2 mesas y 1 mozo.

${COMPLETO_INCLUYE}

${compraYRenovacion("completo")}

${pruebaGratis("hasta 25 productos y 50 ventas por mes, 2 mesas y 1 mozo")}

El QR de la mesa no cobra online: la cuenta se paga en el local.

${REQUISITOS}

${entrega(PERIODO_PRIMER_MES)}`,
    faq: [
      ["¿Cómo sigo después del primer mes?", "Unos días antes de que se venza, WalQo te avisa. La renovación se hace desde el programa: por mes ($35.000), por 3 meses con 10% menos ($94.500) o por año, 12 meses al precio de 10 ($350.000). Si no renovás, pasa al plan gratis y no se borra nada de lo que cargaste."],
      ["¿Los mozos necesitan descargar una app?", "No. Cada mozo abre su enlace en el navegador del celular y toma la comanda desde ahí."],
      ["¿El cliente puede pagar con el QR de la mesa?", "No, el QR sirve para ver la carta, pedir, llamar al mozo y pedir la cuenta. Se cobra en el local."],
      ["¿Imprime en la cocina?", "Sí, al mandar a cocina imprime el ticket con lo nuevo de esa ronda."],
      ["¿Cuántas mesas puedo tener?", "Con WalQo Completo, todas las que quieras. En el plan gratis, 2."],
      ["¿Sirve para take away o delivery?", "Sí, la caja tiene mostrador, para llevar y delivery."],
    ],
  },
  {
    slug: "celulares",
    rubro: "Venta de celulares / Electrónica",
    title: "Sistema venta de celulares IMEI garantía stock dólar",
    category_hint: "Computación > Software > Gestión comercial / Otros (confirmar con el predictor de categorías)",
    ...firstMonthPricing("completo"),
    cover: {
      headline: "Sistema para venta de celulares",
      sub: "Cada equipo con su IMEI, garantía al vender y precios en dólares.",
      laptop: "docs:celulares/app-celulares.jpg",
      phone: "docs:celulares/movil-equipos.jpg",
    },
    extras: [
      { headline: "Buscás un IMEI y ves su historia", sub: "Cuándo entró, a quién se vendió y la garantía.", laptop: "docs:celulares/app-imei.jpg" },
      { headline: "La caja te pide el equipo", sub: "Elegís o escaneás el IMEI y la garantía sale en el ticket.", laptop: "docs:celulares/app-caja-imei.jpg" },
      { headline: "Tienda web con fotos y dólar del día", sub: "El cliente ve los equipos disponibles y consulta.", phones: ["docs:celulares/movil-tienda.jpg", { src: "docs:celulares/movil-ficha.jpg", cropTop: 74 }] },
    ],
    description: `WalQo es un sistema de punto de venta para casas de celulares, electrónica y accesorios. Se instala en la PC del local y controla cada equipo por su IMEI.

Pensado para venta de celulares:
- Cada equipo cargado con su IMEI o número de serie, color, capacidad, estado y batería si es usado.
- En la caja elegís o escaneás el equipo que se lleva el cliente, y la garantía queda registrada y sale en el ticket.
- Garantía por modelo, o 12 meses para nuevos y 3 para usados por defecto.
- Búsqueda por IMEI con toda la historia del equipo.
- Precios en dólares con cotización automática (blue, oficial o tarjeta) o fija, con margen. La venta se guarda en pesos.
- Toma de usados como parte de pago: el usado baja lo que paga el cliente y entra al stock.
- Reservas con seña anotada.
- Fundas, cargadores y accesorios como producto común con código de barras.
- Tienda web con hasta 4 fotos por producto, precio en pesos y dólares, y los equipos disponibles de cada modelo.

La venta de celulares sin límite viene con WalQo Completo. En el plan gratis la probás con 5 equipos. El servicio técnico con órdenes de reparación viene con el plan Pro.

${COMPLETO_INCLUYE}

${compraYRenovacion("completo")}

${pruebaGratis("hasta 25 productos, 10 ventas por mes y 5 equipos")}

${REQUISITOS}

${entrega(PERIODO_PRIMER_MES)}`,
    faq: [
      ["¿Cómo sigo después del primer mes?", "Unos días antes de que se venza, WalQo te avisa. La renovación se hace desde el programa: por mes ($35.000), por 3 meses con 10% menos ($94.500) o por año, 12 meses al precio de 10 ($350.000). Si no renovás, pasa al plan gratis y no se borra nada de lo que cargaste."],
      ["¿Controla los equipos por IMEI?", "Sí. Cada equipo tiene su IMEI y al venderlo queda la garantía a nombre del cliente."],
      ["¿Los precios se actualizan con el dólar?", "Sí. Elegís dólar blue, oficial o tarjeta automático, o un valor fijo, y le sumás un margen."],
      ["¿Puedo recibir un usado como parte de pago?", "Sí, el usado baja lo que paga el cliente y entra a tu stock con ese costo."],
      ["¿Tiene servicio técnico?", "Las órdenes de reparación vienen con el plan Pro. Esta publicación es WalQo Completo."],
      ["¿Lo puedo probar?", "Sí, 7 días con todo. Después sigue gratis con 5 equipos de prueba."],
    ],
  },
  {
    slug: "taller-mecanico",
    rubro: "Taller mecánico / Tren delantero",
    title: "Software taller mecánico órdenes presupuestos stock",
    category_hint: "Computación > Software > Gestión comercial / Otros (confirmar con el predictor de categorías)",
    ...firstMonthPricing("pro"),
    cover: {
      headline: "Sistema para talleres mecánicos",
      sub: "Órdenes de trabajo por patente, presupuestos, repuestos y turnos.",
      laptop: "cap:taller/app-ordenes.jpg",
      phone: "docs:taller/movil-reparaciones.jpg",
    },
    extras: [
      { headline: "Cada orden con el auto y el kilometraje", sub: "Repuestos, mano de obra y estado del trabajo.", laptop: "cap:taller/app-orden-detalle.jpg" },
      { headline: "Turnos del taller", sub: "Agenda del día con el vehículo de cada cliente.", laptop: "cap:taller/app-turnos.jpg" },
      { headline: "Tu cliente consulta desde el celular", sub: "Con la patente o el DNI ve sus reparaciones y presupuestos.", phones: ["docs:taller/movil-consulta.jpg", "docs:taller/movil-presupuesto.jpg"] },
    ],
    description: `WalQo es un sistema para talleres mecánicos, de tren delantero y de service. Se instala en la PC del taller y ordena los trabajos, los repuestos y la caja.

Pensado para taller:
- Órdenes de trabajo con cliente, vehículo, patente y kilometraje.
- Estados de cada trabajo: pendiente, en curso, esperando repuestos, listo y entregado.
- Repuestos con stock y código, y mano de obra cargada como servicio (sin stock).
- Presupuestos que se pueden editar hasta que se cobran, y pasan a venta cuando el cliente aprueba.
- Turnos con el vehículo de cada cliente.
- Historial por patente: la misma patente no se duplica y se actualiza el kilometraje.
- El cliente consulta desde el celular, con la patente o el DNI, sus reparaciones y presupuestos.
- Remitos para entregar repuestos sin factura en el momento.
- Caja, cuenta corriente de clientes y proveedores, gastos y reportes.

${PRO_INCLUYE}

El rubro taller necesita el plan Pro.

${compraYRenovacion("pro")}

Antes de comprar podés probarlo: al instalarlo tenés 7 días de prueba con todas las funciones de Pro.

${REQUISITOS}

${entrega(PERIODO_PRIMER_MES)}`,
    faq: [
      ["¿Cómo sigo después del primer mes?", "Unos días antes de que se venza, WalQo te avisa. La renovación se hace desde el programa: por mes ($60.000), por 3 meses con 10% menos ($162.000) o por año, 12 meses al precio de 10 ($600.000). Si no renovás, pasa al plan gratis y no se borra nada de lo que cargaste."],
      ["¿Guarda el historial de cada auto?", "Sí, por patente, con las órdenes, el kilometraje y los presupuestos."],
      ["¿El cliente puede ver cómo va su auto?", "Sí. Con la patente o el DNI consulta desde el celular sus reparaciones y presupuestos."],
      ["¿Separa repuestos de mano de obra?", "Sí. Los repuestos llevan stock y la mano de obra se carga como servicio."],
      ["¿Qué plan necesito?", "El rubro taller va con WalQo Pro, que incluye 3 computadoras."],
      ["¿Lo puedo probar?", "Sí, 7 días con todas las funciones antes de comprar."],
    ],
  },
  {
    slug: "peluqueria-barberia-estetica",
    rubro: "Peluquería / Barbería / Estética",
    title: "Sistema peluquería barbería turnos online comisiones",
    category_hint: "Computación > Software > Gestión comercial / Otros (confirmar con el predictor de categorías)",
    ...firstMonthPricing("completo"),
    plan_note: "Hasta 2 profesionales: WalQo Completo. Con más de 2 profesionales corresponde WalQo Pro.",
    cover: {
      headline: "Sistema para peluquerías, barberías y estética",
      sub: "Turnos online, agenda por profesional y comisiones.",
      laptop: "cap:peluqueria/app-agenda.jpg",
      phone: "docs:peluqueria/movil-turnos-servicios.jpg",
    },
    extras: [
      { headline: "Comisiones de cada profesional", sub: "Un porcentaje por servicios y otro por productos.", laptop: "cap:peluqueria/app-comisiones.jpg" },
      { headline: "Tus clientes sacan turno solos", sub: "Eligen servicio, profesional y horario desde el celular.", phones: ["docs:peluqueria/movil-turnos-horarios.jpg", { src: "docs:peluqueria/movil-turnos-resumen.jpg", cropBottom: 370 }] },
      { headline: "Cobrás desde el turno", sub: "El servicio pasa a la caja con quién atendió.", laptop: "cap:peluqueria/app-inicio.jpg" },
    ],
    description: `WalQo es un sistema para peluquerías, barberías y centros de estética. Se instala en la PC del local y junta los turnos, la caja y las comisiones.

Pensado para salones:
- Agenda del día por profesional, con el estado de cada turno.
- Turnos online: tu local tiene su propia página de reservas que se abre desde el celular, sin descargar nada. El cliente elige servicio, profesional y horario, y el turno baja a tu agenda.
- Cada servicio con su duración y quién lo hace: solo se ofrecen horarios libres de ese profesional.
- Horario distinto para sábado y domingo.
- Cobro desde el turno: el servicio pasa a la caja con el profesional que atendió.
- Comisiones por profesional: un porcentaje por servicios y otro por productos, calculado sobre lo cobrado.
- Servicios, insumos y productos de reventa por separado.
- Clientes con su historial, y botón para escribirles por WhatsApp desde el turno.
- Caja, gastos y resumen del día.

Para salones de hasta 2 profesionales, los turnos online, la agenda y las comisiones vienen con WalQo Completo. Si son más de 2 profesionales, corresponde WalQo Pro.

${COMPLETO_INCLUYE}

Esta publicación es WalQo Completo, para hasta 2 profesionales.

${compraYRenovacion("completo")}

${pruebaGratis("hasta 5 servicios y 10 ventas por mes")}

${REQUISITOS}

${entrega(PERIODO_PRIMER_MES)}`,
    faq: [
      ["¿Cómo sigo después del primer mes?", "Unos días antes de que se venza, WalQo te avisa. La renovación se hace desde el programa: por mes ($35.000), por 3 meses con 10% menos ($94.500) o por año, 12 meses al precio de 10 ($350.000). Si no renovás, pasa al plan gratis y no se borra nada de lo que cargaste."],
      ["¿Mis clientes pueden sacar turno solos?", "Sí. El local tiene su página de turnos que se abre en el celular, sin descargar nada."],
      ["Somos 4 peluqueros, ¿me sirve esta publicación?", "Esta es para hasta 2 profesionales. Con más de 2 corresponde WalQo Pro. Consultanos antes de comprar."],
      ["¿Calcula las comisiones?", "Sí, con un porcentaje por servicios y otro por productos para cada profesional."],
      ["¿Los turnos online necesitan la PC prendida?", "No. El turno se guarda en el servidor y baja a la agenda cuando abrís WalQo."],
      ["¿Lo puedo probar?", "Sí, 7 días con todo. Después sigue gratis con 5 servicios y 10 ventas por mes."],
    ],
  },
  {
    slug: "consultorio-clinica",
    rubro: "Consultorio / Clínica",
    title: "Software consultorio agenda turnos pacientes odontograma",
    category_hint: "Computación > Software > Gestión comercial / Otros (confirmar con el predictor de categorías)",
    ...firstMonthPricing("pro"),
    cover: {
      headline: "Sistema para consultorios y clínicas",
      sub: "Agenda por profesional, turnos online y ficha de pacientes.",
      laptop: "cap:clinica/app-inicio.jpg",
      phone: "docs:clinica/movil-turnos-servicios.jpg",
    },
    extras: [
      { headline: "La agenda de cada profesional", sub: "Sus turnos del día y una nota interna de cada atención.", laptop: "cap:clinica/app-agenda-profesional.jpg" },
      { headline: "Pacientes con DNI y obra social", sub: "Contacto y datos de cada paciente en un listado.", laptop: "cap:clinica/app-pacientes.jpg" },
      { headline: "Odontograma en la ficha interna", sub: "Un toque cambia el estado de cada diente.", laptop: "cap:clinica/app-ficha.jpg" },
      { headline: "Turnos online para tus pacientes", sub: "Eligen servicio, profesional y horario desde el celular.", phones: ["docs:clinica/movil-turnos-servicios.jpg", "docs:clinica/movil-turnos-paciente.jpg"] },
    ],
    description: `WalQo es un sistema de turnos y pacientes para consultorios y clínicas chicas. Se instala en la PC de la recepción y ordena la agenda de cada profesional.

Pensado para consultorio:
- Inicio de recepción que muestra a quién llamar, los turnos del día y los servicios con su profesional.
- Agenda por profesional: cada uno ve solo sus turnos y deja una nota interna de la atención.
- Al dar un turno, primero elegís el servicio y después solo aparecen los profesionales que lo hacen. No deja superponer turnos ni darlos fuera del horario de atención.
- Turnos online: los pacientes reservan desde el celular en la página del consultorio, sin descargar nada.
- Pacientes con DNI, contacto, domicilio, fecha de nacimiento y obra social.
- Ficha dental interna con odontograma de adultos.
- Botón para abrir tu sistema de facturas o de recetas, si cargás el enlace.

Importante: WalQo no hace receta electrónica, no es una historia clínica oficial ni liquida obras sociales. La ficha y las notas son de uso interno del consultorio.

${PRO_INCLUYE}

El rubro clínica necesita el plan Pro.

${compraYRenovacion("pro")}

Antes de comprar podés probarlo: al instalarlo tenés 7 días de prueba con todas las funciones de Pro.

${REQUISITOS}

${entrega(PERIODO_PRIMER_MES)}`,
    faq: [
      ["¿Cómo sigo después del primer mes?", "Unos días antes de que se venza, WalQo te avisa. La renovación se hace desde el programa: por mes ($60.000), por 3 meses con 10% menos ($162.000) o por año, 12 meses al precio de 10 ($600.000). Si no renovás, pasa al plan gratis y no se borra nada de lo que cargaste."],
      ["¿Hace receta electrónica?", "No. WalQo no hace receta electrónica. Podés cargar el enlace de tu sistema de recetas para abrirlo desde la agenda."],
      ["¿Es una historia clínica?", "No es una historia clínica oficial. Es una ficha y notas internas del consultorio."],
      ["¿Cada profesional tiene su agenda?", "Sí, cada uno ve sus turnos y los servicios que atiende."],
      ["¿Los pacientes pueden pedir turno por internet?", "Sí, desde la página de turnos del consultorio en el celular."],
      ["¿Qué plan necesito?", "El rubro clínica va con WalQo Pro, que incluye 3 computadoras."],
    ],
  },
  {
    slug: "verduleria",
    rubro: "Verdulería / Frutería",
    title: "Sistema punto de venta verdulería balanza por kilo stock",
    category_hint: "Computación > Software > Gestión comercial / Otros (confirmar con el predictor de categorías)",
    ...firstMonthPricing("completo"),
    cover: {
      headline: "Sistema para verdulerías y fruterías",
      sub: "Venta por kilo o por importe, con balanza y stock en kilos.",
      laptop: "cap:verduleria/app-caja.jpg",
    },
    extras: [
      { headline: "Por kilo o por importe", sub: "«Dame $3.000 de frutillas» y WalQo calcula los kilos.", laptop: "cap:verduleria/app-granel.jpg" },
      { headline: "Las ventas del día de un vistazo", sub: "Cuánto vendiste, la ganancia estimada y lo que falta.", laptop: "cap:verduleria/app-inicio.jpg" },
      { headline: "Cobrás con QR, débito o efectivo", sub: "Y también fiado a los clientes de siempre.", laptop: "cap:verduleria/app-cobrar.jpg" },
      { headline: "Stock en kilos", sub: "Avisa cuando algo se está terminando.", laptop: "cap:verduleria/app-stock.jpg" },
    ],
    description: `WalQo es un sistema de punto de venta para verdulerías y fruterías. Se instala en la PC del local y está armado para vender por peso.

Pensado para verdulería:
- Venta por kilo o por importe: si el cliente pide "dame $3.000 de frutillas", WalQo calcula los kilos.
- Lee la etiqueta con código de la balanza y trae el peso.
- Unidades por kilo, gramo, unidad, atado o cajón.
- Stock en kilos con aviso cuando algo se está terminando.
- Caja con apertura y cierre. Efectivo, débito, crédito, transferencia, QR y fiado.
- Fiado y cuenta corriente para los clientes de siempre.
- Pedido al proveedor armado con lo que falta, para mandarlo por WhatsApp.
- Tienda web para que tus clientes te pidan desde el celular, con retiro o envío.
- Resumen del día y reportes con la ganancia real.

${COMPLETO_INCLUYE}

${compraYRenovacion("completo")}

${pruebaGratis("hasta 25 productos y 50 ventas por mes")}

${REQUISITOS}

${entrega(PERIODO_PRIMER_MES)}`,
    faq: [
      ["¿Cómo sigo después del primer mes?", "Unos días antes de que se venza, WalQo te avisa. La renovación se hace desde el programa: por mes ($35.000), por 3 meses con 10% menos ($94.500) o por año, 12 meses al precio de 10 ($350.000). Si no renovás, pasa al plan gratis y no se borra nada de lo que cargaste."],
      ["¿Puedo vender por importe?", "Sí. Ponés cuánto quiere gastar el cliente y WalQo calcula los kilos."],
      ["¿Funciona con mi balanza?", "Si tu balanza imprime etiqueta con código, la escaneás y entra el peso. Si no, cargás el peso a mano."],
      ["¿Necesito internet?", "No para vender. Sí para activar, sincronizar y la tienda web."],
      ["¿Lo puedo probar?", "Sí, 7 días con todo. Después queda en el plan gratis con 25 productos y 50 ventas por mes."],
    ],
  },
  {
    slug: "pet-shop",
    rubro: "Pet shop / Forrajería",
    title: "Sistema punto de venta pet shop forrajería stock y caja",
    category_hint: "Computación > Software > Gestión comercial / Otros (confirmar con el predictor de categorías)",
    ...firstMonthPricing("completo"),
    cover: {
      headline: "Sistema para pet shops y forrajerías",
      sub: "Alimento suelto por kilo, bolsas cerradas, accesorios y stock.",
      laptop: "cap:petshop/app-caja.jpg",
    },
    extras: [
      { headline: "Alimento suelto por kilo o por importe", sub: "«Dame $10.000 de alimento» y WalQo calcula los kilos.", laptop: "cap:petshop/app-granel.jpg" },
      { headline: "Tu negocio en una pantalla", sub: "Ventas de hoy, ganancia estimada y stock bajo.", laptop: "cap:petshop/app-inicio.jpg" },
      { headline: "Cobro rápido", sub: "Efectivo, débito, crédito, transferencia, QR o fiado.", laptop: "cap:petshop/app-cobrar.jpg" },
      { headline: "Stock de bolsas, suelto y accesorios", sub: "Con mínimos y aviso de lo que falta.", laptop: "cap:petshop/app-stock.jpg" },
    ],
    description: `WalQo es un sistema de punto de venta para pet shops, forrajerías y veterinarias con venta al mostrador. Se instala en la PC del local.

Pensado para pet shop:
- Alimento suelto por kilo o por importe, y bolsas cerradas con código de barras, en el mismo stock.
- Unidades por kilo, gramo, unidad, bolsa o saco.
- Fecha de vencimiento en alimentos y productos que la llevan.
- Accesorios, higiene y forrajería con categorías.
- Clientes con fiado y cuenta corriente.
- Proveedores con cuenta corriente y pedido de reposición armado con lo que falta, para mandar por WhatsApp.
- Caja con apertura y cierre, gastos, tesorería y resumen del día.
- Tienda web para recibir pedidos con retiro o envío.

Si además tenés peluquería canina, los turnos vienen con el plan Pro.

${COMPLETO_INCLUYE}

${compraYRenovacion("completo")}

${pruebaGratis("hasta 25 productos y 50 ventas por mes")}

${REQUISITOS}

${entrega(PERIODO_PRIMER_MES)}`,
    faq: [
      ["¿Cómo sigo después del primer mes?", "Unos días antes de que se venza, WalQo te avisa. La renovación se hace desde el programa: por mes ($35.000), por 3 meses con 10% menos ($94.500) o por año, 12 meses al precio de 10 ($350.000). Si no renovás, pasa al plan gratis y no se borra nada de lo que cargaste."],
      ["¿Puedo vender alimento suelto?", "Sí, por kilo o por importe, y descuenta del stock en kilos."],
      ["¿Tiene turnos para peluquería canina?", "Los turnos vienen con el plan Pro. Esta publicación es WalQo Completo."],
      ["¿Controla vencimientos?", "Sí, podés cargar la fecha de vencimiento en los productos que la llevan."],
      ["¿Lo puedo probar?", "Sí, 7 días con todo. Después queda en el plan gratis con 25 productos y 50 ventas por mes."],
    ],
  },
  {
    slug: "ferreteria",
    rubro: "Ferretería / Repuestos",
    title: "Sistema punto de venta ferretería stock facturación caja",
    category_hint: "Computación > Software > Gestión comercial / Otros (confirmar con el predictor de categorías)",
    ...firstMonthPricing("completo"),
    cover: {
      headline: "Sistema para ferreterías",
      sub: "Venta por unidad, kilo o metro, stock y proveedores.",
      laptop: "cap:ferreteria/app-caja.jpg",
    },
    extras: [
      { headline: "Tu ferretería en una pantalla", sub: "Ventas de hoy, ganancia estimada y lo que falta.", laptop: "cap:ferreteria/app-inicio.jpg" },
      { headline: "Cobro con cualquier medio de pago", sub: "Efectivo, débito, crédito, transferencia, QR o cuenta corriente.", laptop: "cap:ferreteria/app-cobrar.jpg" },
      { headline: "Stock con mínimos", sub: "Avisos de lo que se termina y pedido al proveedor.", laptop: "cap:ferreteria/app-stock.jpg" },
    ],
    description: `WalQo es un sistema de punto de venta para ferreterías, pinturerías y casas de repuestos. Se instala en la PC del local y maneja muchos artículos sin complicarse.

Pensado para ferretería:
- Venta por unidad, kilo, metro, litro o caja: cable por metro, tornillos por kilo, pintura por unidad.
- Código de barras y código interno (SKU), con búsqueda rápida por nombre o código.
- Importación de productos desde Excel y carga de compras con una foto de la factura del proveedor.
- Proveedores con cuenta corriente: compras a cuenta, pagos y deuda al día.
- Pedido de reposición armado con lo que está bajo el mínimo, para mandar por WhatsApp.
- Clientes con cuenta corriente.
- Caja con apertura y cierre, gastos, tesorería y reportes por fechas y por cajero.

Los presupuestos y remitos para obras vienen con el plan Pro.

${COMPLETO_INCLUYE}

${compraYRenovacion("completo")}

${pruebaGratis("hasta 25 productos y 50 ventas por mes")}

${REQUISITOS}

${entrega(PERIODO_PRIMER_MES)}`,
    faq: [
      ["¿Cómo sigo después del primer mes?", "Unos días antes de que se venza, WalQo te avisa. La renovación se hace desde el programa: por mes ($35.000), por 3 meses con 10% menos ($94.500) o por año, 12 meses al precio de 10 ($350.000). Si no renovás, pasa al plan gratis y no se borra nada de lo que cargaste."],
      ["¿Puedo vender por metro?", "Sí, por metro, kilo, litro, unidad o caja."],
      ["¿Puedo pasar mis productos desde un Excel?", "Sí, WalQo importa productos desde Excel."],
      ["¿Hace presupuestos?", "Los presupuestos y remitos vienen con el plan Pro. Esta publicación es WalQo Completo."],
      ["¿Hace factura electrónica?", "Sí, factura electrónica de ARCA con tu CUIT y tu punto de venta."],
    ],
  },
  {
    slug: "ropa-indumentaria",
    rubro: "Ropa / Indumentaria / Calzado",
    title: "Sistema punto de venta tienda de ropa talles colores stock",
    category_hint: "Computación > Software > Gestión comercial / Otros (confirmar con el predictor de categorías)",
    ...firstMonthPricing("completo"),
    cover: {
      headline: "Sistema para tiendas de ropa",
      sub: "Talles y colores, cada uno con su stock.",
      laptop: "cap:ropa/app-caja.jpg",
    },
    extras: [
      { headline: "La caja te pide talle y color", sub: "Ves el stock de cada combinación antes de vender.", laptop: "cap:ropa/app-variantes.jpg" },
      { headline: "Stock por prenda", sub: "Con mínimos y aviso de lo que se termina.", laptop: "cap:ropa/app-stock.jpg" },
      { headline: "Tus productos ordenados", sub: "Categorías, precios y variantes en un listado.", laptop: "cap:ropa/app-productos.jpg" },
      { headline: "Cobrás como quiera el cliente", sub: "Efectivo, débito, crédito, transferencia o QR.", laptop: "cap:ropa/app-cobrar.jpg" },
    ],
    description: `WalQo es un sistema de punto de venta para tiendas de ropa, indumentaria y calzado. Se instala en la PC del local y lleva el stock de cada talle y color.

Pensado para indumentaria:
- Cada prenda con sus variantes de talle y color, y el stock de cada combinación.
- En la caja elegís la variante y ves cuántas quedan; las que no tienen stock no se pueden vender.
- Código de barras, categorías y precio por prenda.
- Clientes con cuenta corriente.
- Tienda web del local con hasta 4 fotos por producto, para que te pidan desde el celular.
- Conexión con Tienda Nube si ya vendés online.
- Caja con apertura y cierre, gastos, tesorería y reportes con la ganancia real.

${COMPLETO_INCLUYE}

${compraYRenovacion("completo")}

${pruebaGratis("hasta 25 productos y 50 ventas por mes")}

${REQUISITOS}

${entrega(PERIODO_PRIMER_MES)}`,
    faq: [
      ["¿Cómo sigo después del primer mes?", "Unos días antes de que se venza, WalQo te avisa. La renovación se hace desde el programa: por mes ($35.000), por 3 meses con 10% menos ($94.500) o por año, 12 meses al precio de 10 ($350.000). Si no renovás, pasa al plan gratis y no se borra nada de lo que cargaste."],
      ["¿Maneja talles y colores?", "Sí, cada prenda tiene sus variantes y cada una su propio stock."],
      ["¿Se conecta con Tienda Nube?", "Sí, WalQo Completo incluye la conexión con Tienda Nube."],
      ["¿Puedo tener fotos de las prendas en la web?", "Sí, la tienda web muestra hasta 4 fotos por producto."],
      ["¿Lo puedo probar?", "Sí, 7 días con todo. Después queda en el plan gratis con 25 productos y 50 ventas por mes."],
    ],
  },
  {
    slug: "general-permanente",
    rubro: "Comercio en general (licencia permanente, pago único)",
    title: "Sistema punto de venta licencia permanente stock y caja",
    category_hint: "Computación > Software > Gestión comercial / Otros (confirmar con el predictor de categorías)",
    plan: PLANS.permanente.name,
    period: "Pago único (sin vencimiento)",
    price: priceWithFee(PLANS.permanente.once),
    net_price: PLANS.permanente.once,
    alternatives: [],
    pcs: 1,
    cover: {
      headline: "Sistema de punto de venta para tu comercio",
      sub: "Pago único para una PC: ventas, stock, clientes y caja.",
      laptop: "docs:kiosco/app-caja.jpg",
    },
    extras: [
      { headline: "Cobro rápido", sub: "Efectivo, débito, crédito, transferencia, QR o fiado.", laptop: "docs:kiosco/app-cobrar.jpg" },
      { headline: "Venta por peso o por importe", sub: "Para lo que se vende suelto.", laptop: "docs:kiosco/app-granel.jpg" },
      { headline: "Stock con avisos de mínimo", sub: "Sabés qué reponer antes de quedarte sin nada.", laptop: "docs:kiosco/app-stock.jpg" },
    ],
    description: `WalQo Permanente es la licencia de pago único del sistema de punto de venta WalQo. Se paga una vez y queda instalada en una PC, sin cuota mensual.

Qué hace:
- Punto de venta con lector de código de barras y atajos de teclado.
- Productos con stock, categorías y avisos de mínimo.
- Venta por unidad, por peso (kilo) o por importe.
- Clientes con fiado y cuenta corriente.
- Caja con apertura, cierre y arqueo.
- Resumen del día con cuánto se vendió y dónde entró la plata.

Qué incluye la licencia permanente:
- 1 PC, con un usuario administrador y un cajero.
- Rubro General (sirve para cualquier comercio de venta al mostrador).
- Queda en la versión que compraste: no recibe actualizaciones.

Qué no incluye (viene con WalQo Completo, que es mensual): factura electrónica de ARCA, Mercado Pago, Tienda Nube, catálogo de productos, segunda computadora, rubros especiales como mesas para restaurantes o venta de celulares por IMEI, y asistencia continua.

${pruebaGratis("hasta 25 productos y 50 ventas por mes")}

${REQUISITOS}

${entrega("permanente")} La ayuda para instalarlo está incluida.`,
    faq: [
      ["¿Es un pago único?", "Sí. Pagás una vez, la instalación y la activación están incluidas, y la licencia no vence. Es para una sola PC."],
      ["¿Hace factura electrónica?", "No. La factura electrónica de ARCA viene con WalQo Completo, que es mensual."],
      ["¿Recibe actualizaciones?", "No, queda en la versión que compraste. Las actualizaciones vienen con los planes mensuales."],
      ["¿Sirve para mi rubro?", "Sirve para cualquier comercio de venta al mostrador con el rubro General. Para restaurante con mesas o venta de celulares por IMEI conviene WalQo Completo."],
    ],
  },
];

export function formatPrice(n) {
  return fmt(n);
}

export function attributesFor(l) {
  const duration = l.plan === PLANS.permanente.name ? "Permanente" : "1 mes (después se renueva desde WalQo)";
  return COMMON_ATTRS(l.plan, l.pcs, duration);
}
