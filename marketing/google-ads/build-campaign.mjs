import { writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = import.meta.dirname;
const SITE = "https://walqo.pro";

const COMMON_HEADLINES = [
  "Probá WalQo gratis",
  "Funciona sin internet",
  "Soporte por WhatsApp",
  "Precios en pesos",
  "Para Windows 10 y 11",
];

const COMMON_DESCRIPTIONS = [
  "Ventas, stock, caja y clientes en la PC del local. Probalo gratis y escribinos.",
  "Se instala en tu computadora y sigue vendiendo aunque se corte internet.",
];

const CAMPAIGNS = [
  {
    name: "WalQo - Comercios",
    groups: [
      {
        name: "Kioscos",
        url: "/software-para-kioscos/",
        path: ["kiosco", "sistema"],
        keywords: ["sistema para kioscos", "programa para kioscos", "software para kioscos", "punto de venta para kiosco", "sistema para maxikiosco"],
        headlines: ["Sistema para kioscos", "Programa para tu kiosco", "Código de barras y stock", "Vencimientos a la vista", "Caja del turno en orden"],
        descriptions: ["Cobrá con lector, descontá stock y cerrá la caja. WalQo Completo $35.000/mes.", "Programa para kioscos que corre en la PC. Probalo gratis con 25 productos."],
      },
      {
        name: "Almacenes",
        url: "/software-para-almacenes/",
        path: ["almacen", "sistema"],
        keywords: ["sistema para almacenes", "programa para almacen", "software para almacenes", "sistema para almacen de barrio", "programa para autoservicio chico"],
        headlines: ["Sistema para almacenes", "Programa para tu almacén", "Venta suelta por kilo", "Fiado y cuenta corriente", "Catálogo de 200.000 ítems"],
        descriptions: ["Precios, stock y caja juntos. Lee la etiqueta de la balanza y lleva el fiado.", "Escaneás el código y el nombre sale del catálogo. Vos ponés el precio."],
      },
      {
        name: "Punto de venta",
        url: "/sistema-punto-de-venta/",
        path: ["punto-de-venta"],
        keywords: ["sistema punto de venta", "programa punto de venta", "software punto de venta", "sistema de ventas para comercio", "programa para comercio"],
        headlines: ["Sistema punto de venta", "Programa para comercios", "Cobrá y controlá stock", "Mercado Pago y ARCA", "Varias PCs en el local"],
        descriptions: ["Punto de venta para la PC del comercio. Ventas, stock, caja, clientes y reportes.", "Con WalQo Completo sumás Mercado Pago, Tienda Nube y facturación ARCA."],
      },
      {
        name: "Control de stock",
        url: "/gestion-de-stock/",
        path: ["stock"],
        keywords: ["programa control de stock", "sistema de stock para comercio", "control de inventario comercio", "software de stock"],
        headlines: ["Control de stock simple", "El stock baja al vender", "Alertas de stock mínimo", "Compras con foto e IA", "Sin planillas aparte"],
        descriptions: ["Cada venta descuenta el stock y ves qué reponer antes de quedarte sin nada.", "Cargá compras, hacé inventario e imprimí el listado desde la PC del local."],
      },
      {
        name: "Ferreterías",
        url: "/software-para-ferreterias/",
        path: ["ferreteria"],
        keywords: ["sistema para ferreterias", "programa para ferreteria", "software para ferreteria", "sistema para casa de repuestos"],
        headlines: ["Sistema para ferreterías", "Por unidad, kilo o metro", "Miles de artículos", "Código de barras e interno", "Para casas de repuestos"],
        descriptions: ["Cobrá el bulón suelto por kilo y el cable por metro desde la misma pantalla.", "Stock por artículo, alertas de mínimo y caja. Probá WalQo gratis en tu PC."],
      },
      {
        name: "Verdulerías",
        url: "/software-para-verdulerias/",
        path: ["verduleria"],
        keywords: ["sistema para verdulerias", "programa para verduleria", "software para fruteria", "sistema verduleria balanza"],
        headlines: ["Sistema para verdulerías", "Por kilo o por importe", "Lee etiqueta de balanza", "Caja del día clara", "Para fruterías también"],
        descriptions: ["Vendé por kilo o por monto fijo. WalQo lee la etiqueta que imprime la balanza.", "Abrís el turno, anotás egresos y al cerrar ves la diferencia de caja."],
      },
      {
        name: "Ropa",
        url: "/software-para-tiendas-de-ropa/",
        path: ["ropa"],
        keywords: ["sistema para tienda de ropa", "programa para local de ropa", "software para indumentaria", "sistema para zapateria"],
        headlines: ["Sistema para locales de ropa", "Talles y colores", "Stock por variante", "Para calzado también", "Cobro con código"],
        descriptions: ["Cada talle y color con su stock. Sabé qué te queda sin ir al depósito.", "Ventas, clientes y caja para tu local de ropa. Probalo gratis en tu PC."],
      },
      {
        name: "Farmacias",
        url: "/software-para-farmacias/",
        path: ["farmacia"],
        keywords: ["sistema para farmacias", "programa para farmacia", "software para farmacia", "control de vencimientos farmacia"],
        headlines: ["Sistema para farmacias", "Lotes y vencimientos", "Stock por partida", "Para droguerías", "Mostrador con lector"],
        descriptions: ["Cada lote con su vencimiento y su cantidad. Vendé primero lo que vence antes.", "Punto de venta, stock y caja para farmacias. No liquida obras sociales."],
      },
      {
        name: "Gastronomía",
        url: "/software-para-restaurantes/",
        path: ["gastronomia"],
        keywords: ["sistema para restaurante", "programa para rotiseria", "sistema para take away", "software para bar", "sistema para hamburgueseria"],
        headlines: ["Sistema para gastronomía", "Carta en el mostrador", "Ticket de cocina", "Take away y delivery", "Propina al cobrar"],
        descriptions: ["Tomá el pedido desde la carta, mandá el ticket a cocina y cobrá con propina.", "Para mostrador, take away y delivery. No maneja mesas. Probalo gratis."],
      },
      {
        name: "Otros rubros",
        url: "/software-para-comercios/",
        path: ["rubros"],
        keywords: ["sistema para pet shop", "programa para panaderia", "sistema para libreria", "sistema para venta de celulares", "programa para forrajeria"],
        headlines: ["Software para comercios", "Elegí tu rubro", "Pet shop y panaderías", "Librerías y electrónica", "Si falta, lo armamos"],
        descriptions: ["Un sistema que se adapta a tu rubro: por kilo, por talle, por lote o por unidad.", "Ventas, stock y caja en la PC del local. Escribinos y lo vemos con tu caso."],
      },
    ],
  },
  {
    name: "WalQo - Pro servicios",
    groups: [
      {
        name: "Supermercados",
        url: "/software-para-supermercados/",
        path: ["supermercado"],
        keywords: ["sistema para supermercado", "programa para autoservicio", "software para minimercado", "sistema para supermercado chico"],
        headlines: ["Sistema para supermercados", "Hasta tres cajas", "Etiqueta de balanza", "Catálogo grande", "Carnicería y verdulería"],
        descriptions: ["Almacén, carnicería y verdulería en un sistema. Hasta tres PCs sincronizadas.", "Plan Pro $60.000/mes con presupuestos, remitos y todas las funciones."],
      },
      {
        name: "Talleres",
        url: "/software-para-talleres/",
        path: ["taller"],
        keywords: ["sistema para taller mecanico", "programa para taller mecanico", "software ordenes de trabajo taller", "sistema para tren delantero"],
        headlines: ["Sistema para talleres", "Órdenes de trabajo", "Presupuestos y remitos", "Historial por patente", "Turnos online"],
        descriptions: ["Presupuestá, pasá a orden de trabajo y guardá el historial de cada patente.", "El cliente pide turno y consulta su historial desde walqo.pro. Plan Pro."],
      },
      {
        name: "Peluquerías",
        url: "/software-para-peluquerias/",
        path: ["turnos"],
        keywords: ["sistema de turnos peluqueria", "turnos online barberia", "software para centro de estetica", "agenda de turnos peluqueria"],
        headlines: ["Turnos para peluquerías", "Reserva desde el celular", "Para barberías", "Agenda por profesional", "Sin app para el cliente"],
        descriptions: ["El cliente elige servicio, día y profesional. El turno entra en tu agenda.", "Servicios con duración, insumos y venta de productos. Plan Pro $60.000/mes."],
      },
      {
        name: "Consultorios",
        url: "/software-para-consultorios/",
        path: ["consultorio"],
        keywords: ["sistema de turnos consultorio", "software para consultorio medico", "agenda de pacientes", "sistema para consultorio odontologico"],
        headlines: ["Sistema para consultorios", "Turnos por profesional", "Pacientes y obra social", "Ficha dental interna", "Agenda del día"],
        descriptions: ["Pacientes con obra social, turnos sin superposición y agenda por profesional.", "No es historia clínica oficial: es la agenda y la ficha interna. Plan Pro."],
      },
    ],
  },
];

const NEGATIVES = [
  "empleo", "trabajo", "sueldo", "curso", "capacitacion", "tesis", "monografia", "pdf",
  "crack", "pirata", "full gratis", "plantilla excel", "que es", "definicion", "ejemplo",
  "mercadolibre", "usado", "segunda mano", "balanza precio", "impresora", "lector precio",
];

function csv(rows) {
  return rows.map((row) => row.map((cell) => {
    const text = String(cell ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\r\n") + "\r\n";
}

const errors = [];
function check(kind, text, max, where) {
  if ([...text].length > max) errors.push(`${where}: ${kind} de ${[...text].length} caracteres (máx ${max}): ${text}`);
}

const keywordRows = [["Campaign", "Ad group", "Keyword", "Criterion Type"]];
const adRows = [[
  "Campaign", "Ad group", "Ad type",
  ...Array.from({ length: 10 }, (_, i) => `Headline ${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
  "Final URL", "Path 1", "Path 2",
]];
const negativeRows = [["Campaign", "Keyword", "Criterion Type"]];

for (const campaign of CAMPAIGNS) {
  for (const word of NEGATIVES) negativeRows.push([campaign.name, word, "Campaign Negative Phrase"]);
  for (const group of campaign.groups) {
    const where = `${campaign.name} / ${group.name}`;
    for (const kw of group.keywords) {
      keywordRows.push([campaign.name, group.name, kw, "Phrase"]);
      keywordRows.push([campaign.name, group.name, kw, "Exact"]);
    }
    const headlines = [...group.headlines, ...COMMON_HEADLINES].slice(0, 10);
    const descriptions = [...group.descriptions, ...COMMON_DESCRIPTIONS].slice(0, 4);
    headlines.forEach((h) => check("título", h, 30, where));
    descriptions.forEach((d) => check("descripción", d, 90, where));
    group.path.forEach((p) => check("ruta", p, 15, where));
    adRows.push([
      campaign.name, group.name, "Responsive search ad",
      ...headlines, ...descriptions,
      `${SITE}${group.url}?utm_source=google&utm_medium=cpc&utm_campaign=${encodeURIComponent(campaign.name.toLowerCase().replace(/\s+/g, "-"))}&utm_content=${encodeURIComponent(group.name.toLowerCase().replace(/\s+/g, "-"))}`,
      group.path[0] || "", group.path[1] || "",
    ]);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

await writeFile(path.join(OUT, "palabras-clave.csv"), csv(keywordRows), "utf8");
await writeFile(path.join(OUT, "anuncios.csv"), csv(adRows), "utf8");
await writeFile(path.join(OUT, "palabras-negativas.csv"), csv(negativeRows), "utf8");
console.log(`${keywordRows.length - 1} palabras clave, ${adRows.length - 1} anuncios, ${negativeRows.length - 1} negativas`);
