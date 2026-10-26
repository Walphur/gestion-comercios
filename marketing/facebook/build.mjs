// Genera publicaciones.md y publicaciones.json de Facebook, y con --desktop arma
// la carpeta «WalQo Facebook» en el Escritorio (fotos de la carpeta de Mercado Libre,
// el video del rubro y un texto.txt listo para copiar y pegar).
// Uso: node marketing/facebook/build.mjs [--desktop]
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const desktop = join(homedir(), "Desktop");
const mlPhotos = join(desktop, "WalQo Mercado Libre");
const outDesktop = join(desktop, "WalQo Facebook");

const WA_NUMBER = "5492664580915";
const WA_DISPLAY = "2664 58-0915";
const TRIAL_DAYS = 7;
const MAX_TITLE = 80;

const PLANS = {
  completo: {
    name: "WalQo Completo",
    marketplacePrice: 35000,
    priceLine: "$35.000 por mes · 3 meses $94.500 (10% menos) · 1 año $350.000 (pagás 10 meses)",
    postPrice: "$35.000 por mes, o 3 meses con 10% menos",
  },
  pro: {
    name: "WalQo Pro",
    marketplacePrice: 60000,
    priceLine: "$60.000 por mes · 3 meses $162.000 (10% menos) · 1 año $600.000 (pagás 10 meses)",
    postPrice: "$60.000 por mes, o 3 meses con 10% menos",
  },
  permanente: {
    name: "WalQo Permanente",
    marketplacePrice: 12000,
    priceLine: "$12.000 pago único, sin cuota mensual (1 PC)",
    postPrice: "$12.000 pago único, sin cuota mensual",
  },
};

const FREE_GENERAL = "25 productos y 50 ventas por mes";

const CATEGORY = "Electrónica e informática › Computadoras (si no aparece, «Varios»). Estado: Nuevo.";

const RUBROS = [
  {
    slug: "kiosco-almacen",
    who: "kiosco o almacén",
    name: "Kiosco / Almacén",
    plan: "completo",
    page: "software-para-kioscos",
    waText: "Hola! Vi WalQo en Facebook y quiero info para mi kiosco/almacén",
    title: "Sistema para kiosco y almacén: punto de venta, stock, fiado y facturación",
    intro: "Programa para la PC del kiosco o almacén: cobrás rápido y sabés cuánto entró en el día.",
    benefits: [
      "Cobro con lector de código de barras, sin usar el mouse.",
      "Fiambre, queso y carne por kilo o por importe.",
      "El fiado de cada cliente: cuánto debe y qué fue pagando.",
      "Aviso de stock bajo y pedido al proveedor armado para mandar por WhatsApp.",
      "Factura electrónica de ARCA y cobro con QR de Mercado Pago.",
    ],
    free: FREE_GENERAL,
    hook: "🛒 ¿Tenés kiosco o almacén y el fiado sigue anotado en un cuaderno?",
    postBullets: [
      "Cobrás rápido con lector de código de barras",
      "Fiambre y carne por kilo o «dame $4.000 de picada»",
      "El fiado de cada cliente, claro y al día",
      "Te avisa qué se termina y arma el pedido al proveedor",
      "Resumen del día por WhatsApp: cuánto vendiste y dónde entró la plata",
    ],
    photos: [
      "01-portada.jpg",
      "02-carniceria-y-fiambres-por-kilo.jpg",
      "03-cobras-con-lo-que-el-cliente-quiera.jpg",
      "05-el-fiado-de-cada-cliente-en-orden.jpg",
    ],
  },
  {
    slug: "supermercado",
    who: "supermercado o autoservicio",
    name: "Supermercado / Autoservicio",
    plan: "pro",
    page: "software-para-supermercados",
    waText: "Hola! Vi WalQo en Facebook y quiero info para mi supermercado",
    title: "Sistema para supermercado: varias cajas, stock, balanza y facturación",
    intro: "Programa para supermercados, autoservicios y mini-markets, con hasta 3 cajas que comparten el mismo stock.",
    benefits: [
      "Hasta 3 computadoras conectadas: cada caja vende y el stock es uno solo.",
      "Carnicería, fiambrería y verdulería por kilo con la etiqueta de la balanza.",
      "Catálogo de unos 200.000 productos con código de barras para no cargar todo a mano.",
      "Proveedores, vencimientos y pedidos de reposición con lo que falta.",
      "Caja por cajero, reportes por fechas y factura electrónica de ARCA.",
    ],
    note: "El rubro supermercado va con el plan Pro.",
    hook: "🏪 ¿Tu súper tiene varias cajas y el stock nunca coincide?",
    postBullets: [
      "Hasta 3 cajas conectadas con un solo stock",
      "Balanza: carne, fiambre y verdura por kilo o por importe",
      "200.000 productos con código para arrancar sin cargar todo",
      "Cargás la mercadería con una foto de la factura del proveedor",
      "Caja por cajero y la ganancia real del mes",
    ],
    photos: [
      "01-portada.jpg",
      "02-secciones-con-balanza.jpg",
      "04-cobro-rapido-en-cada-caja.jpg",
      "05-stock-con-alertas.jpg",
    ],
  },
  {
    slug: "gastronomia",
    who: "restaurante, bar o cafetería",
    name: "Gastronomía / Restaurante / Bar / Cafetería",
    plan: "completo",
    page: "software-para-restaurantes",
    waText: "Hola! Vi WalQo en Facebook y quiero info para mi restaurante/bar",
    title: "Sistema para restaurante, bar y cafetería: mesas, QR, comandas y caja",
    intro: "Programa para restaurantes, bares, cafeterías y casas de comida: salón, cocina y caja en un mismo lugar.",
    benefits: [
      "Mesas por sector, comanda a cocina por rondas y pre-cuenta.",
      "Un QR por mesa: el cliente ve la carta, pide, llama al mozo o pide la cuenta.",
      "Los mozos toman el pedido desde su celular, sin descargar nada.",
      "Mostrador, para llevar y delivery, con carta web para pedidos.",
      "Caja con propina, cualquier medio de pago y resumen del día.",
    ],
    note: "El QR de la mesa no cobra online: la cuenta se paga en el local.",
    free: "25 productos, 50 ventas por mes, 2 mesas y 1 mozo",
    hook: "🍽️ ¿Los pedidos se pierden entre el salón y la cocina?",
    postBullets: [
      "Cada mesa con su cuenta, rondas a cocina y pre-cuenta",
      "QR en la mesa: el cliente ve la carta, pide y llama al mozo",
      "Los mozos toman la comanda con su celular",
      "Para llevar y delivery desde la misma caja",
      "Cobrás con propina y cualquier medio de pago",
    ],
    photos: [
      "01-portada.jpg",
      "02-la-cuenta-de-cada-mesa.jpg",
      "03-los-mozos-toman-el-pedido-con-el-celular.jpg",
      "04-un-qr-en-cada-mesa.jpg",
    ],
  },
  {
    slug: "celulares",
    who: "local de celulares",
    name: "Venta de celulares / Electrónica",
    plan: "completo",
    page: "software-para-electronica",
    waText: "Hola! Vi WalQo en Facebook y quiero info para mi local de celulares",
    title: "Sistema para venta de celulares: IMEI, garantía, stock y precios en dólares",
    intro: "Programa para casas de celulares, electrónica y accesorios: cada equipo controlado por su IMEI.",
    benefits: [
      "Cada equipo con su IMEI, color, capacidad, estado y batería si es usado.",
      "La garantía queda registrada al vender y sale en el ticket.",
      "Precios en dólares con cotización automática o fija, y cobrás en pesos.",
      "Tomás usados como parte de pago y anotás reservas con seña.",
      "Tienda web con fotos y los equipos disponibles de cada modelo.",
    ],
    note: "El servicio técnico con órdenes de reparación viene con el plan Pro.",
    free: "25 productos, 10 ventas por mes y 5 equipos",
    hook: "📱 ¿Vendés celulares y llevás los IMEI en una planilla?",
    postBullets: [
      "Cada equipo con su IMEI y su historia",
      "Garantía registrada que sale en el ticket",
      "Precios en dólar blue, oficial o fijo, con tu margen",
      "Usados como parte de pago y reservas con seña",
      "Tienda web con fotos y equipos disponibles",
    ],
    photos: [
      "01-portada.jpg",
      "02-buscas-un-imei-y-ves-su-historia.jpg",
      "03-la-caja-te-pide-el-equipo.jpg",
      "04-tienda-web-con-fotos-y-dolar-del-dia.jpg",
    ],
  },
  {
    slug: "taller-mecanico",
    who: "taller",
    name: "Taller mecánico / Tren delantero",
    plan: "pro",
    page: "software-para-talleres",
    waText: "Hola! Vi WalQo en Facebook y quiero info para mi taller",
    title: "Sistema para taller mecánico: órdenes de trabajo, presupuestos, turnos y stock",
    intro: "Programa para talleres mecánicos, de tren delantero y de service: trabajos, repuestos y caja en orden.",
    benefits: [
      "Órdenes de trabajo con cliente, patente, kilometraje y estado.",
      "Presupuestos que pasan a venta cuando el cliente aprueba.",
      "Historial de cada auto por patente.",
      "El cliente consulta desde el celular, con la patente o el DNI, cómo va su auto.",
      "Repuestos con stock y mano de obra aparte.",
    ],
    note: "El rubro taller va con el plan Pro.",
    hook: "🔧 ¿Te llaman todo el día para preguntar si el auto está listo?",
    postBullets: [
      "Órdenes con patente, kilometraje y estado del trabajo",
      "Presupuestos que pasan a venta cuando el cliente aprueba",
      "Historial de cada auto por patente",
      "Tu cliente mira desde el celular cómo va su auto",
      "Repuestos con stock y mano de obra aparte",
    ],
    photos: [
      "01-portada.jpg",
      "02-cada-orden-con-el-auto-y-el-kilometraje.jpg",
      "03-turnos-del-taller.jpg",
      "04-tu-cliente-consulta-desde-el-celular.jpg",
    ],
  },
  {
    slug: "peluqueria-barberia-estetica",
    who: "peluquería, barbería o centro de estética",
    name: "Peluquería / Barbería / Estética",
    plan: "completo",
    page: "software-para-peluquerias",
    waText: "Hola! Vi WalQo en Facebook y quiero info para mi peluquería/barbería",
    title: "Sistema para peluquería, barbería y estética: turnos online y comisiones",
    intro: "Programa para peluquerías, barberías y centros de estética: turnos, caja y comisiones juntos.",
    benefits: [
      "Tus clientes sacan turno solos desde el celular, sin descargar nada.",
      "Agenda del día por profesional, con horarios libres según cada servicio.",
      "Cobrás desde el turno y queda quién atendió.",
      "Comisiones por profesional: un % por servicios y otro por productos.",
      "Botón para escribirle al cliente por WhatsApp desde el turno.",
    ],
    note: "Con turnos y comisiones para hasta 2 profesionales. Si son más de 2, plan Pro ($60.000 por mes).",
    postPriceExtra: "Hasta 2 profesionales; si son más, Pro",
    free: "5 servicios y 10 ventas por mes",
    hook: "💈 ¿Seguís dando turnos por WhatsApp a las 11 de la noche?",
    postBullets: [
      "Tus clientes sacan turno solos desde el celular",
      "Agenda de cada profesional, solo con sus horarios libres",
      "Cobrás desde el turno en un clic",
      "Las comisiones de cada uno, calculadas solas",
      "El turno online queda guardado aunque la PC esté apagada",
    ],
    photos: [
      "01-portada.jpg",
      "02-comisiones-de-cada-profesional.jpg",
      "03-tus-clientes-sacan-turno-solos.jpg",
      "04-cobras-desde-el-turno.jpg",
    ],
  },
  {
    slug: "consultorio-clinica",
    who: "consultorio",
    name: "Consultorio / Clínica",
    plan: "pro",
    page: "software-para-consultorios",
    waText: "Hola! Vi WalQo en Facebook y quiero info para mi consultorio",
    title: "Sistema para consultorio y clínica: agenda de turnos, pacientes y odontograma",
    intro: "Programa de turnos y pacientes para consultorios y clínicas chicas, en la PC de la recepción.",
    benefits: [
      "Agenda por profesional: cada uno ve sus turnos y deja una nota interna.",
      "No deja superponer turnos ni darlos fuera del horario de atención.",
      "Turnos online: los pacientes reservan desde el celular.",
      "Pacientes con DNI, contacto y obra social.",
      "Ficha dental interna con odontograma de adultos.",
    ],
    note: "No hace receta electrónica ni es historia clínica oficial: la ficha es de uso interno. Va con el plan Pro.",
    hook: "🩺 ¿La agenda del consultorio sigue en papel o en el celular de la secretaria?",
    postBullets: [
      "Agenda de cada profesional, sin turnos superpuestos",
      "Tus pacientes piden turno desde el celular",
      "Recepción que muestra a quién llamar",
      "Pacientes con DNI y obra social",
      "Ficha dental con odontograma",
    ],
    photos: [
      "01-portada.jpg",
      "02-la-agenda-de-cada-profesional.jpg",
      "04-odontograma-en-la-ficha-interna.jpg",
      "05-turnos-online-para-tus-pacientes.jpg",
    ],
  },
  {
    slug: "verduleria",
    who: "verdulería",
    name: "Verdulería / Frutería",
    plan: "completo",
    page: "software-para-verdulerias",
    waText: "Hola! Vi WalQo en Facebook y quiero info para mi verdulería",
    title: "Sistema para verdulería y frutería: venta por kilo, balanza, stock y caja",
    intro: "Programa para verdulerías y fruterías, armado para vender por peso.",
    benefits: [
      "Venta por kilo o por importe: «dame $3.000 de frutillas» y calcula los kilos.",
      "Lee la etiqueta con código de la balanza.",
      "Stock en kilos con aviso cuando algo se termina.",
      "Fiado y cuenta corriente para los clientes de siempre.",
      "Efectivo, débito, crédito, transferencia y QR.",
    ],
    free: FREE_GENERAL,
    hook: "🍅 ¿Tu verdulería todavía hace las cuentas con la calculadora?",
    postBullets: [
      "Vendés por kilo o por importe y calcula solo",
      "Lee la etiqueta de la balanza",
      "Stock en kilos con aviso de lo que se termina",
      "Fiado de los clientes de siempre",
      "Cobrás con efectivo, débito, transferencia o QR",
    ],
    photos: [
      "01-portada.jpg",
      "02-por-kilo-o-por-importe.jpg",
      "04-cobras-con-qr-debito-o-efectivo.jpg",
      "05-stock-en-kilos.jpg",
    ],
  },
  {
    slug: "pet-shop",
    who: "pet shop o forrajería",
    name: "Pet shop / Forrajería",
    plan: "completo",
    page: "software-para-pet-shop",
    waText: "Hola! Vi WalQo en Facebook y quiero info para mi pet shop",
    title: "Sistema para pet shop y forrajería: alimento suelto por kilo, stock y caja",
    intro: "Programa para pet shops y forrajerías: alimento suelto, bolsas y accesorios en el mismo stock.",
    benefits: [
      "Alimento suelto por kilo o por importe, y bolsas cerradas con código.",
      "Vencimientos en alimentos y productos que los llevan.",
      "Fiado y cuenta corriente de clientes.",
      "Pedido al proveedor armado con lo que falta, para mandar por WhatsApp.",
      "Tienda web para recibir pedidos con retiro o envío.",
    ],
    free: FREE_GENERAL,
    hook: "🐾 ¿Vendés alimento suelto y nunca sabés cuántos kilos te quedan?",
    postBullets: [
      "Alimento suelto por kilo o por importe",
      "Bolsas, suelto y accesorios en el mismo stock",
      "Aviso de vencimientos",
      "Pedido al proveedor listo para mandar por WhatsApp",
      "Tienda web para que te pidan desde el celular",
    ],
    photos: [
      "01-portada.jpg",
      "02-alimento-suelto-por-kilo-o-por-importe.jpg",
      "04-cobro-rapido.jpg",
      "05-stock-de-bolsas-suelto-y-accesorios.jpg",
    ],
  },
  {
    slug: "ferreteria",
    who: "ferretería",
    name: "Ferretería / Repuestos",
    plan: "completo",
    page: "software-para-ferreterias",
    waText: "Hola! Vi WalQo en Facebook y quiero info para mi ferretería",
    title: "Sistema para ferretería: stock, códigos, venta por metro o kilo y facturación",
    intro: "Programa para ferreterías, pinturerías y casas de repuestos que manejan muchos artículos.",
    benefits: [
      "Venta por unidad, metro, kilo, litro o caja.",
      "Búsqueda rápida por nombre, código de barras o código interno.",
      "Pasás tus productos desde un Excel.",
      "Proveedores con cuenta corriente y pedido de reposición por WhatsApp.",
      "Factura electrónica de ARCA.",
    ],
    free: FREE_GENERAL,
    hook: "🔩 ¿Tenés miles de artículos y te enterás de lo que falta cuando te lo piden?",
    postBullets: [
      "Vendés por unidad, metro, kilo, litro o caja",
      "Encontrás cualquier artículo por nombre o código",
      "Pasás tus productos desde un Excel",
      "Aviso de mínimos y pedido al proveedor por WhatsApp",
      "Factura electrónica incluida",
    ],
    photos: [
      "01-portada.jpg",
      "02-tu-ferreteria-en-una-pantalla.jpg",
      "03-cobro-con-cualquier-medio-de-pago.jpg",
      "04-stock-con-minimos.jpg",
    ],
  },
  {
    slug: "ropa-indumentaria",
    who: "tienda de ropa",
    name: "Ropa / Indumentaria / Calzado",
    plan: "completo",
    page: "software-para-tiendas-de-ropa",
    waText: "Hola! Vi WalQo en Facebook y quiero info para mi tienda de ropa",
    title: "Sistema para tienda de ropa y calzado: stock por talle y color, caja y web",
    intro: "Programa para tiendas de ropa, indumentaria y calzado: el stock de cada talle y color.",
    benefits: [
      "Cada prenda con sus talles y colores, y el stock de cada uno.",
      "En la caja elegís talle y color y ves cuántas quedan.",
      "Tienda web con hasta 4 fotos por producto.",
      "Conexión con Tienda Nube si ya vendés online.",
      "Cuenta corriente de clientes y reportes con la ganancia real.",
    ],
    free: FREE_GENERAL,
    hook: "👕 ¿Te piden un talle y tenés que ir al depósito a ver si queda?",
    postBullets: [
      "Stock de cada talle y color",
      "La caja te pide talle y color y te dice cuántas quedan",
      "Tienda web con fotos de tus prendas",
      "Conexión con Tienda Nube",
      "Ganancia real del mes en los reportes",
    ],
    photos: [
      "01-portada.jpg",
      "02-la-caja-te-pide-talle-y-color.jpg",
      "03-stock-por-prenda.jpg",
      "05-cobras-como-quiera-el-cliente.jpg",
    ],
  },
  {
    slug: "general-permanente",
    who: "comercio",
    name: "Comercio en general (licencia permanente, pago único)",
    plan: "permanente",
    page: "software-para-comercios",
    waText: "Hola! Vi WalQo en Facebook y quiero info de la licencia permanente",
    title: "Sistema punto de venta con licencia permanente: pago único, stock y caja",
    intro: "Licencia de pago único de WalQo para cualquier comercio de venta al mostrador, sin cuota mensual.",
    benefits: [
      "Cobro con lector de código de barras.",
      "Stock con aviso de mínimo.",
      "Venta por unidad, por kilo o por importe.",
      "Fiado y cuenta corriente de clientes.",
      "Caja con apertura, cierre y resumen del día.",
    ],
    note: "Para 1 PC y sin actualizaciones. No trae factura electrónica, Mercado Pago ni Tienda Nube (vienen con WalQo Completo).",
    free: FREE_GENERAL,
    hook: "💻 Sistema para tu comercio con un solo pago de $12.000, sin cuota mensual.",
    postBullets: [
      "Cobrás con lector de código de barras",
      "Stock con aviso de lo que se termina",
      "Venta por unidad, por kilo o por importe",
      "Fiado de cada cliente al día",
      "Caja con cierre y resumen del día",
    ],
    photos: [
      "01-portada.jpg",
      "02-cobro-rapido.jpg",
      "03-venta-por-peso-o-por-importe.jpg",
      "04-stock-con-avisos-de-minimo.jpg",
    ],
  },
];

const GENERIC = {
  waText: "Hola! Vi WalQo en Facebook y quiero info para mi comercio",
  hook: "💻 ¿Tenés un comercio y querés dejar el cuaderno y la calculadora?",
  intro: "WalQo es un sistema para cobrar, controlar el stock y saber cuánto ganás, desde la computadora del local.",
  bullets: [
    "Kioscos, almacenes, súper, verdulerías, ferreterías, ropa, pet shops y celulares",
    "Restaurantes con mesas y QR, peluquerías con turnos online, talleres y consultorios",
    "Factura electrónica, QR de Mercado Pago y tienda web del local",
    "En la PC vende aunque se corte internet",
  ],
};

const GUIDE = [
  "Cuándo: de martes a jueves, de 11 a 13 h y de 19 a 22 h; el domingo a la tarde también rinde.",
  "Marketplace: una publicación por rubro. Cuando Facebook ofrezca «Renovar», renovala en vez de borrarla y crearla de nuevo.",
  "Grupos: leé las reglas antes. Máximo 1 post por grupo por semana, 3 a 5 grupos por día con pausas, cambiando la foto o la primera línea. El mismo texto en muchos grupos seguidos se toma como spam y bloquea la cuenta.",
  "Página: fijá arriba el post general y subí el video de un rubro como reel o historia, uno por día o día por medio.",
  "Respondé en menos de una hora: a los comentarios, «Te escribí por privado», y pasá la charla a WhatsApp con el link del rubro.",
  "Pedí que te manden una captura si se traban al instalar: se resuelve más rápido que explicando por escrito.",
];

const MARKETPLACE_WARNING =
  "Facebook Marketplace es para productos físicos: software, licencias y descargas pueden ser rechazados o bajados, y si se insiste pueden restringir el acceso a Marketplace. Si te lo rechaza, pedí revisión una sola vez; si no, no lo vuelvas a subir igual: usá los grupos de compra-venta y de comerciantes, y la página (sección «Servicios» de la página o un post fijado). Si en tu zona aparece la categoría «Servicios» en Marketplace, publicalo ahí.";

const waLink = (text) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
const siteUrl = (page) => (page ? `walqo.pro/${page}` : "walqo.pro");
const formatArs = (n) => `$${n.toLocaleString("es-AR")}`;

function trialLine(r) {
  if (r.plan === "pro") return `lo probás ${TRIAL_DAYS} días con todas las funciones del plan Pro`;
  return `lo probás ${TRIAL_DAYS} días con todo`;
}

function afterTrial(r) {
  if (!r.free) return "después elegís el plan y te activamos la clave";
  return `después elegís el plan o seguís gratis con ${r.free}`;
}

function marketplaceDescription(r) {
  const plan = PLANS[r.plan];
  const lines = [r.intro, ...r.benefits.map((b) => `• ${b}`)];
  if (r.note) lines.push(r.note);
  lines.push(`${plan.name}: ${plan.priceLine}.`);
  lines.push(
    `Se descarga gratis desde ${siteUrl(r.page)} (PC con Windows 10 u 11), ${trialLine(r)} y ${afterTrial(r)}.`,
  );
  lines.push(`Consultas por WhatsApp al ${WA_DISPLAY}: ${waLink(r.waText)}`);
  return lines.join("\n");
}

function groupPost(r) {
  const plan = PLANS[r.plan];
  const lines = [r.hook, "", `WalQo es el sistema para tu ${r.who}, en la compu del local:`, ""];
  for (const b of r.postBullets) lines.push(`✅ ${b}`);
  lines.push("");
  lines.push(`💻 Descargalo gratis y probalo ${TRIAL_DAYS} días con todo: ${siteUrl(r.page)}`);
  lines.push(`💲 ${plan.postPrice}${r.postPriceExtra ? `. ${r.postPriceExtra}` : ""}`);
  lines.push(`📲 Escribime y te ayudo a instalarlo: ${waLink(r.waText)}`);
  return lines.join("\n");
}

function reelCaption(r) {
  return `${r.hook}\nProbalo gratis: ${siteUrl(r.page)} · WhatsApp ${WA_DISPLAY}`;
}

function genericPost() {
  const lines = [GENERIC.hook, "", GENERIC.intro, ""];
  for (const b of GENERIC.bullets) lines.push(`✅ ${b}`);
  lines.push("");
  lines.push(`💻 Descargalo gratis en walqo.pro y probalo ${TRIAL_DAYS} días con todo.`);
  lines.push("💲 Planes desde $35.000 por mes, o licencia permanente de $12.000 (pago único).");
  lines.push(`📲 Contame qué comercio tenés y te digo qué plan te conviene: ${waLink(GENERIC.waText)}`);
  return lines.join("\n");
}

const entries = RUBROS.map((r) => {
  if (r.title.length > MAX_TITLE) throw new Error(`Título largo (${r.title.length}) en ${r.slug}`);
  return {
    slug: r.slug,
    rubro: r.name,
    plan: PLANS[r.plan].name,
    page: `https://${siteUrl(r.page)}`,
    whatsapp: waLink(r.waText),
    marketplace: {
      title: r.title,
      titleLength: r.title.length,
      price: PLANS[r.plan].marketplacePrice,
      priceNote: r.plan === "permanente" ? "pago único" : "por mes",
      category: CATEGORY,
      description: marketplaceDescription(r),
    },
    post: groupPost(r),
    reelCaption: reelCaption(r),
    photos: r.photos.map((p) => join(mlPhotos, r.slug, p)),
    video: `marketing/mercadolibre/videos/${r.slug}.mp4`,
  };
});

function rubroText(e) {
  return [
    `WalQo — ${e.rubro}`,
    "",
    "=== MARKETPLACE ===",
    `Título: ${e.marketplace.title}`,
    `Precio: ${formatArs(e.marketplace.price)} (${e.marketplace.priceNote})`,
    `Categoría: ${e.marketplace.category}`,
    "",
    "Descripción:",
    e.marketplace.description,
    "",
    `Ojo: ${MARKETPLACE_WARNING}`,
    "",
    "=== POST PARA GRUPOS / PÁGINA ===",
    e.post,
    "",
    "=== TEXTO PARA HISTORIA / REEL (con el video de esta carpeta) ===",
    e.reelCaption,
  ].join("\n");
}

function buildMarkdown() {
  const out = [];
  out.push("# Publicaciones de WalQo en Facebook");
  out.push("");
  out.push(
    "Marketplace, grupos de compra-venta y de comerciantes, y la página. Una sección por rubro, lista para copiar y pegar. Se genera con `node marketing/facebook/build.mjs` (con `--desktop` arma también la carpeta «WalQo Facebook» del Escritorio con fotos, video y `texto.txt`).",
  );
  out.push("");
  out.push("## Cómo y cuándo publicar");
  out.push("");
  for (const g of GUIDE) out.push(`- ${g}`);
  out.push("");
  out.push(`> **Ojo con Marketplace:** ${MARKETPLACE_WARNING}`);
  out.push("");
  out.push("## Texto genérico (cuando no se sabe el rubro)");
  out.push("");
  out.push("```text");
  out.push(genericPost());
  out.push("```");
  out.push("");
  out.push("## Resumen");
  out.push("");
  out.push("| Rubro | Plan | Precio en Marketplace | Página |");
  out.push("|---|---|---|---|");
  for (const e of entries) {
    out.push(`| ${e.rubro} | ${e.plan} | ${formatArs(e.marketplace.price)} ${e.marketplace.priceNote} | ${e.page} |`);
  }
  out.push("");
  out.push(
    "Precios reales, sin comisión: Completo $35.000 por mes ($94.500 por 3 meses, $350.000 por año) · Pro $60.000 por mes ($162.000 por 3 meses, $600.000 por año) · Permanente $12.000 pago único. Prueba de 7 días con todo al instalar.",
  );
  for (const e of entries) {
    out.push("");
    out.push("---");
    out.push("");
    out.push(`## ${e.rubro}`);
    out.push("");
    out.push("### Marketplace");
    out.push("");
    out.push(`**Título** (${e.marketplace.titleLength}/${MAX_TITLE}): \`${e.marketplace.title}\``);
    out.push("");
    out.push(`**Precio:** ${formatArs(e.marketplace.price)} (${e.marketplace.priceNote}) · **Categoría:** ${e.marketplace.category}`);
    out.push("");
    out.push("**Descripción:**");
    out.push("");
    out.push("```text");
    out.push(e.marketplace.description);
    out.push("```");
    out.push("");
    out.push("### Post para grupos / página");
    out.push("");
    out.push("```text");
    out.push(e.post);
    out.push("```");
    out.push("");
    out.push("### Fotos y video");
    out.push("");
    for (const p of e.photos) out.push(`- \`${p}\``);
    out.push(`- Video 9:16 para historias y reels: \`${e.video}\``);
    out.push(`- Texto para la historia o el reel: «${e.reelCaption.replace(/\n/g, " · ")}»`);
  }
  out.push("");
  return out.join("\n");
}

const md = buildMarkdown();
writeFileSync(join(here, "publicaciones.md"), md, "utf8");
writeFileSync(
  join(here, "publicaciones.json"),
  `${JSON.stringify({ guide: GUIDE, marketplaceWarning: MARKETPLACE_WARNING, generic: genericPost(), rubros: entries }, null, 2)}\n`,
  "utf8",
);
console.log(`publicaciones.md y publicaciones.json: ${entries.length} rubros`);

if (process.argv.includes("--desktop")) {
  const BOM = "\uFEFF";
  const crlf = (s) => s.replace(/\r?\n/g, "\r\n");
  if (existsSync(outDesktop)) {
    for (const name of readdirSync(outDesktop)) rmSync(join(outDesktop, name), { recursive: true, force: true });
  }
  mkdirSync(outDesktop, { recursive: true });
  writeFileSync(join(outDesktop, "publicaciones.md"), md, "utf8");
  writeFileSync(join(outDesktop, "publicaciones.txt"), BOM + crlf(md), "utf8");
  for (const e of entries) {
    const dir = join(outDesktop, e.slug);
    mkdirSync(dir, { recursive: true });
    for (const p of e.photos) {
      if (!existsSync(p)) throw new Error(`Falta la foto ${p}`);
      copyFileSync(p, join(dir, p.split(/[\\/]/).pop()));
    }
    const video = join(repo, e.video);
    if (!existsSync(video)) throw new Error(`Falta el video ${video}`);
    copyFileSync(video, join(dir, "video-historias-reels.mp4"));
    writeFileSync(join(dir, "texto.txt"), BOM + crlf(rubroText(e)), "utf8");
  }
  console.log(`Escritorio: ${outDesktop}`);
}
