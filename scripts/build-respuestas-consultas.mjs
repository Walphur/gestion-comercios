import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");
const DOCS = path.join(ROOT, "docs");
const OUT_DIR = path.join(ROOT, "marketing", "respuestas");
const file = (p) => pathToFileURL(path.join(DOCS, p)).href;

const W = 1080;
const H = 1350;
const WHATSAPP = "266 458-0915";

const baseCss = `
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; }
  body {
    position: relative; overflow: hidden;
    font-family: Satoshi, "Segoe UI", system-ui, sans-serif; color: #f4f6fb;
    background:
      radial-gradient(620px 420px at 12% 4%, rgba(47,107,255,0.38), transparent 70%),
      radial-gradient(560px 420px at 96% 30%, rgba(138,77,255,0.26), transparent 70%),
      #05060a;
    padding: 64px 68px 0;
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand img { width: 52px; height: 52px; border-radius: 12px; }
  .brand span { font-size: 42px; font-weight: 900; letter-spacing: -0.02em; }
  .brand b { color: #4b86ff; font-weight: 900; }
  .tag { margin-left: auto; padding: 8px 18px; border-radius: 999px; font-size: 20px; font-weight: 700;
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); color: #dfe5f2; }
  h1 { margin-top: 40px; font-size: 72px; line-height: 1.0; font-weight: 900; letter-spacing: -0.03em; }
  h1 em { font-style: normal; color: #7eb0ff; }
  .lede { margin-top: 18px; font-size: 28px; color: #b4bccc; font-weight: 500; line-height: 1.3; }
  .grid { margin-top: 34px; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 16px; }
  .card { padding: 22px 24px; border-radius: 20px; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12); }
  .card h2 { font-size: 27px; font-weight: 900; letter-spacing: -0.01em; display: flex; align-items: center; gap: 10px; }
  .card h2 i { width: 12px; height: 12px; border-radius: 4px; background: #2f6bff; display: inline-block; flex: none; }
  .card p { margin-top: 8px; font-size: 20px; line-height: 1.35; color: #c3cad8; font-weight: 500; }
  .shot { position: absolute; left: 68px; right: 68px; top: 750px; height: 320px; border-radius: 18px; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 20px 60px rgba(47,107,255,0.25); }
  .shot img { display: block; width: 100%; }
  .shot::after { content: ""; position: absolute; inset: auto 0 0 0; height: 90px;
    background: linear-gradient(rgba(5,6,10,0), rgba(5,6,10,0.85)); }
  .fade { display: none; }
  .cta { position: absolute; left: 68px; right: 68px; bottom: 54px; display: flex; align-items: flex-end; gap: 24px; }
  .cta .main { flex: 1; min-width: 0; }
  .trial { display: inline-block; padding: 12px 26px; border-radius: 999px; background: #2f6bff; color: #fff;
    font-size: 30px; font-weight: 900; letter-spacing: -0.01em; }
  .price { margin-top: 14px; font-size: 21px; color: #b4bccc; font-weight: 500; line-height: 1.4; }
  .contact { text-align: right; flex: none; }
  .contact .wa { font-size: 34px; font-weight: 900; color: #fff; letter-spacing: -0.01em; }
  .contact .wa small { display: block; font-size: 19px; font-weight: 700; color: #34d399; letter-spacing: 0; }
  .contact .web { margin-top: 6px; font-size: 21px; color: #9fb3d9; font-weight: 700; }
`;

const page = (body, css = "") => `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=block" />
<style>${baseCss}${css}</style>
</head>
<body>${body}</body>
</html>`;

const brand = (tag) => `
  <div class="brand">
    <img src="${file("branding/walqo-mark.png")}" alt="" /><span>Wal<b>Q</b>o</span>
    <span class="tag">${tag}</span>
  </div>`;

const contact = `
  <div class="contact">
    <div class="wa"><small>WhatsApp</small>${WHATSAPP}</div>
    <div class="web">walqo.pro</div>
  </div>`;

const rubroCard = ({ tag, title, lede, features, shot, shotOffset = 0, price }) =>
  page(`
  ${brand(tag)}
  <h1>${title}</h1>
  <p class="lede">${lede}</p>
  <div class="grid">
    ${features.map(([t, p]) => `<div class="card"><h2><i></i>${t}</h2><p>${p}</p></div>`).join("")}
  </div>
  <div class="shot"><img src="${file(shot)}" alt="" style="margin-top:${-shotOffset}px" /></div>
  <div class="fade"></div>
  <div class="cta">
    <div class="main">
      <span class="trial">Probalo 7 días gratis</span>
      <p class="price">${price}</p>
    </div>
    ${contact}
  </div>`);

const COMPLETO = "WalQo Completo: $35.000 por mes.<br />Pagando el año, 12 meses por 10.<br />PC con Windows 10 u 11, o desde el navegador.";
const PRO = "WalQo Pro: $60.000 por mes, con 3 PCs.<br />Pagando el año, 12 meses por 10.<br />PC con Windows 10 u 11.";

// Gratis, Permanente, Completo, Pro (1 = sí, 0 = no). Sale de src/config/planEntitlements.ts.
const COMPARE = [
  ["Productos", "25", "1.000", "Sin tope", "Sin tope"],
  ["Ventas por mes", "50", "Sin tope", "Sin tope", "Sin tope"],
  ["Computadoras", "1", "1", "2", "3"],
  ["Usuarios", "Dueño + 1 cajero", "Dueño + 1 cajero", "Sin tope", "Sin tope"],
  ["Caja, stock, fiado y código de barras", 1, 1, 1, 1],
  ["Reportes por fechas y ganancia", 1, 0, 1, 1],
  ["Proveedores, gastos y tesorería", 1, 0, 1, 1],
  ["Etiquetas y subas de precio", 1, 0, 1, 1],
  ["Tienda web y app del celular", 1, 0, 1, 1],
  ["Cobro con QR de Mercado Pago", 0, 0, 1, 1],
  ["Factura electrónica de ARCA", 0, 0, 1, 1],
  ["Catálogo de 200 mil productos y carga de facturas con IA", 0, 0, 1, 1],
  ["Turnos, presupuestos, remitos y órdenes de trabajo", 0, 0, 0, 1],
  ["Actualizaciones", 1, 0, 1, 1],
  ["Ayuda por WhatsApp", 1, 0, 1, 1],
];

const images = [
  {
    name: "01-que-es-walqo",
    html: rubroCard({
      tag: "Sistema para comercios",
      title: "Vendé, cobrá y controlá <em>todo tu negocio</em>",
      lede: "Un sistema para la PC del local. Funciona aunque se corte internet.",
      features: [
        ["Caja rápida", "Con lector de código de barras, por kilo o por importe. Efectivo, débito, crédito o QR."],
        ["Stock al día", "Cada venta descuenta sola. Te avisa lo que se está terminando."],
        ["Fiado ordenado", "Cuánto debe cada cliente, qué se llevó y cuándo pagó."],
        ["Tus números", "Cuánto vendiste en el día, en qué medio de pago y cuánta plata tiene que haber en la caja."],
      ],
      shot: "assets/shots/kiosco/app-caja.jpg",
      price: "Mercado Pago, factura electrónica de ARCA,<br />tienda web y app del celular.<br />Te ayudo a instalarlo y a cargar todo.",
    }),
  },
  {
    name: "02-planes-y-precios",
    html: page(
      `
  ${brand("Planes y precios")}
  <h1>Elegí el plan <em>para tu local</em></h1>
  <p class="lede">Los primeros 7 días tenés todo. Después elegís.</p>
  <div class="plans">
    <div class="plan">
      <div class="head"><h2>Gratis</h2><p class="amount">$0</p></div>
      <p>Para arrancar: hasta 25 productos y 50 ventas por mes.</p>
    </div>
    <div class="plan">
      <div class="head"><h2>Permanente</h2><p class="amount">$12.000 <small>pago único</small></p></div>
      <p>1 PC y hasta 1.000 productos. Caja, stock, fiado y el resumen del día. Sin actualizaciones, celular ni tienda web.</p>
    </div>
    <div class="plan pick">
      <span class="badge">El más elegido</span>
      <div class="head"><h2>Completo</h2><p class="amount">$35.000 <small>por mes</small></p></div>
      <p>Todo: Mercado Pago, factura de ARCA, tienda web, app del celular, proveedores, gastos, reportes, 2 PCs y actualizaciones.</p>
    </div>
    <div class="plan">
      <div class="head"><h2>Pro</h2><p class="amount">$60.000 <small>por mes</small></p></div>
      <p>Lo del Completo en 3 PCs, con presupuestos, turnos, remitos y órdenes. Para súper, talleres y consultorios.</p>
    </div>
  </div>
  <div class="cta">
    <div class="main">
      <span class="trial">3 meses: 10% menos · Un año: pagás 10</span>
      <p class="price">Si no renovás, no se borra nada: pasa al plan gratis.</p>
    </div>
    ${contact}
  </div>`,
      `
  .plans { margin-top: 36px; display: grid; gap: 16px; }
  .plan { position: relative; padding: 24px 28px; border-radius: 22px; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12); }
  .plan.pick { border-color: rgba(75,134,255,0.8);
    background: radial-gradient(ellipse at 10% 0%, rgba(47,107,255,0.30), transparent 60%), #10182a; }
  .plan .head { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; }
  .plan h2 { font-size: 36px; font-weight: 900; letter-spacing: -0.02em; }
  .plan .amount { font-size: 40px; font-weight: 900; letter-spacing: -0.03em; white-space: nowrap; }
  .plan .amount small { font-size: 20px; font-weight: 700; color: #9aa3b5; letter-spacing: 0; }
  .plan p:not(.amount) { margin-top: 8px; font-size: 22px; line-height: 1.35; color: #c3cad8; font-weight: 500; }
  .badge { position: absolute; top: -15px; left: 28px; padding: 5px 14px; border-radius: 999px; font-size: 17px; font-weight: 900;
    letter-spacing: 0.06em; text-transform: uppercase; background: linear-gradient(90deg, #2f6bff, #8a4dff); }
  .trial { font-size: 26px; }
`,
    ),
  },
  {
    name: "02b-que-trae-cada-plan",
    html: page(
      `
  ${brand("Qué trae cada plan")}
  <h1 class="small">Qué trae <em>cada plan</em></h1>
  <table>
    <thead>
      <tr><th></th><th>Gratis</th><th>Permanente</th><th class="pick">Completo</th><th>Pro</th></tr>
      <tr class="prices"><td></td><td>$0</td><td>$12.000<small>pago único</small></td><td class="pick">$35.000<small>por mes</small></td><td>$60.000<small>por mes</small></td></tr>
    </thead>
    <tbody>
      ${COMPARE.map(
        ([label, ...cells]) =>
          `<tr><th>${label}</th>${cells
            .map((c, i) => `<td class="${i === 2 ? "pick" : ""}">${c === 1 ? '<i class="yes">✓</i>' : c === 0 ? '<i class="no">—</i>' : c}</td>`)
            .join("")}</tr>`,
      ).join("")}
    </tbody>
  </table>
  <div class="cta">
    <div class="main">
      <span class="trial">Los primeros 7 días tenés todo</span>
      <p class="foot">Peluquería y estética: Completo hasta 2 profesionales,<br />con turnos y comisiones. 3 meses: 10% menos · El año: pagás 10.</p>
    </div>
    ${contact}
  </div>`,
      `
  h1.small { margin-top: 22px; font-size: 54px; }
  .trial { font-size: 24px; padding: 10px 22px; }
  table { margin-top: 18px; width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
  th, td { padding: 8px 6px; font-size: 18px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.08); }
  tbody th { text-align: left; font-weight: 700; color: #dfe5f2; width: 34%; padding-left: 0; line-height: 1.2; }
  thead th { font-size: 23px; font-weight: 900; border-bottom: 0; padding-bottom: 2px; }
  thead th:first-child { width: 34%; }
  .prices td { font-size: 22px; font-weight: 900; color: #fff; padding-top: 0; }
  .prices small { display: block; font-size: 15px; font-weight: 700; color: #9aa3b5; }
  td { color: #c3cad8; font-weight: 700; }
  .pick { background: rgba(47,107,255,0.16); }
  thead th.pick { border-radius: 16px 16px 0 0; color: #7eb0ff; }
  tbody tr:last-child .pick { border-radius: 0 0 16px 16px; }
  .yes { font-style: normal; color: #34d399; font-weight: 900; font-size: 24px; }
  .no { font-style: normal; color: #4a5470; font-weight: 900; }
  .foot { margin-top: 12px; font-size: 18px; line-height: 1.4; color: #9aa3b5; font-weight: 500; }
`,
    ),
  },
  {
    name: "03-como-empezar",
    html: page(
      `
  ${brand("Cómo empezar")}
  <h1>Lo probás hoy, <em>sin pagar nada</em></h1>
  <p class="lede">En 10 minutos estás vendiendo.</p>
  <ol class="steps">
    <li><b>1</b><div><h2>Entrá a walqo.pro</h2><p>Descargalo en la PC del local (Windows 10 u 11) o usalo desde el navegador en walqo.pro/web.</p></div></li>
    <li><b>2</b><div><h2>Elegí tu rubro</h2><p>Kiosco, almacén, verdulería, ropa, peluquería, restó, taller… Viene con ejemplos para no arrancar en blanco.</p></div></li>
    <li><b>3</b><div><h2>Usalo 7 días con todo</h2><p>Cargá tus productos y vendé de verdad. Si te gusta, me escribís y te paso la licencia.</p></div></li>
  </ol>
  <div class="help">¿Te trabás? Te ayudo por WhatsApp, también a cargar los productos.</div>
  <div class="cta">
    <div class="main">
      <span class="trial">Probalo 7 días gratis</span>
      <p class="price">Si no comprás, sigue en el plan gratis<br />y no perdés lo que cargaste.</p>
    </div>
    ${contact}
  </div>`,
      `
  .steps { list-style: none; padding: 0; margin-top: 44px; display: grid; gap: 20px; }
  .steps li { display: flex; gap: 26px; align-items: flex-start; padding: 28px 30px; border-radius: 22px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); }
  .steps b { flex: none; width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center;
    font-size: 34px; font-weight: 900; background: linear-gradient(135deg, #2f6bff, #8a4dff); }
  .steps h2 { font-size: 34px; font-weight: 900; letter-spacing: -0.02em; }
  .steps p { margin-top: 8px; font-size: 23px; line-height: 1.35; color: #c3cad8; font-weight: 500; }
  .help { margin-top: 26px; font-size: 24px; font-weight: 700; color: #7eb0ff; }
`,
    ),
  },
  {
    name: "rubro-almacen-verduleria-kiosco",
    html: rubroCard({
      tag: "Kiosco · Almacén · Verdulería",
      title: "La caja de tu <em>almacén o verdulería</em>, sin cuaderno",
      lede: "Cobrás rápido, sabés qué te queda y quién te debe.",
      features: [
        ["Por kilo o por importe", "Ponés 1,5 kg o «$2.000 de papa» y calcula solo."],
        ["Código de barras", "Pasás el lector y el producto entra a la venta."],
        ["Fiado de los de siempre", "Lo que debe cada cliente, con fecha y detalle."],
        ["Las ventas del día", "Efectivo, débito, transferencia o QR, y el cierre de caja."],
      ],
      shot: "assets/shots/kiosco/app-caja.jpg",
      price: `${COMPLETO.split("<br />")[0]}<br />Permanente básico: $12.000, pago único.<br />PC con Windows 10 u 11, o desde el navegador.`,
    }),
  },
  {
    name: "rubro-gastronomia",
    html: rubroCard({
      tag: "Restó · Bar · Rotisería",
      title: "Mesas, comandas y caja <em>de tu restó</em>",
      lede: "Los mozos toman el pedido con el celular y sale directo a cocina.",
      features: [
        ["Mesas", "Cuenta por mesa, pre-cuenta, cambio de mesa y cobro por la caja."],
        ["QR en cada mesa", "El cliente ve la carta, pide, llama al mozo o pide la cuenta."],
        ["Mozos con el celular", "Cada mozo con su enlace. Sin instalar nada."],
        ["Carta online", "Con fotos y precios, siempre actualizada."],
      ],
      shot: "assets/shots/gastronomia/app-mesas.jpg",
      price: COMPLETO,
    }),
  },
  {
    name: "rubro-peluqueria",
    html: rubroCard({
      tag: "Peluquería · Barbería · Estética",
      title: "Turnos, caja y <em>comisiones</em> de tu salón",
      lede: "Sin cuaderno y sin contestar mensajes para dar turnos.",
      features: [
        ["Turnos online", "El cliente reserva desde el celular con tu link, sin bajar ninguna app."],
        ["Agenda por profesional", "Cada servicio con su duración. Los horarios no se pisan."],
        ["Cobrás desde el turno", "El servicio y los productos van en la misma venta."],
        ["Comisiones", "Cuánto le toca a cada uno, por día, semana o mes."],
      ],
      shot: "assets/shots/peluqueria/app-agenda.jpg",
      price: "Hasta 2 profesionales: $35.000 por mes.<br />Más de 2: $60.000. El año, 12 meses por 10.<br />PC con Windows 10 u 11, o desde el navegador.",
    }),
  },
  {
    name: "rubro-ropa-ferreteria-petshop",
    html: rubroCard({
      tag: "Ropa · Ferretería · Pet shop",
      title: "Tu stock en orden y <em>tu tienda online</em>",
      lede: "Vendés en el local y en internet con el mismo stock.",
      features: [
        ["Stock al día", "Cada venta descuenta sola y te avisa lo que se termina."],
        ["Tienda web", "Tus productos con fotos en walqo.pro/tulocal. El pedido llega a la caja."],
        ["Etiquetas y precios", "Imprimís etiquetas y subís precios por categoría o proveedor."],
        ["Proveedores", "Lo que les debés y el pedido para reponer por WhatsApp."],
      ],
      shot: "assets/shots/kiosco/app-stock.jpg",
      price: COMPLETO,
    }),
  },
  {
    name: "rubro-celulares",
    html: rubroCard({
      tag: "Celulares · Electrónica",
      title: "Cada equipo con <em>su IMEI</em>, en orden",
      lede: "Sabés qué vendiste, a quién y con qué garantía.",
      features: [
        ["IMEI y garantía", "Buscás por IMEI y la garantía sale al vender."],
        ["Precios en dólares", "Con dólar automático o fijo y tu margen."],
        ["Usados y reservas", "Tomás usados en parte de pago y reservás equipos."],
        ["Servicio técnico", "Las reparaciones de cada cliente, con su estado."],
      ],
      shot: "assets/shots/celulares/app-celulares.jpg",
      price: COMPLETO,
    }),
  },
  {
    name: "rubro-taller",
    html: rubroCard({
      tag: "Taller mecánico",
      title: "Órdenes de trabajo y <em>presupuestos</em> del taller",
      lede: "Cada auto con su historia, por patente.",
      features: [
        ["Órdenes de trabajo", "Lo que se hizo, los repuestos y la mano de obra."],
        ["Presupuestos", "Los armás en un minuto y los mandás por WhatsApp."],
        ["El cliente consulta", "Con la patente o el DNI ve cómo va su auto."],
        ["Turnos y caja", "La agenda del taller y lo que entró en el día."],
      ],
      shot: "assets/shots/taller/app-ordenes.jpg",
      price: PRO,
    }),
  },
  {
    name: "rubro-consultorio",
    html: rubroCard({
      tag: "Consultorio · Clínica",
      title: "La agenda de <em>cada profesional</em>",
      lede: "La recepción sabe a quién llamar y quién sigue.",
      features: [
        ["Agenda por profesional", "Cada uno con sus turnos y sus servicios."],
        ["Turnos online", "El paciente saca turno desde el celular."],
        ["Pacientes", "Con obra social, datos y notas internas de la atención."],
        ["Ficha dental", "Odontograma interno para odontología."],
      ],
      shot: "assets/shots/clinica/app-agenda-profesional.jpg",
      price: PRO,
    }),
  },
];

await mkdir(OUT_DIR, { recursive: true });
const dir = await mkdtemp(path.join(tmpdir(), "walqo-respuestas-"));
const browser = await chromium.launch({ channel: "msedge" });
try {
  const tab = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5 });
  for (const img of images) {
    const htmlPath = path.join(dir, `${img.name}.html`);
    await writeFile(htmlPath, img.html, "utf8");
    await tab.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    await tab.evaluate(() => document.fonts.ready);
    const out = path.join(OUT_DIR, `${img.name}.jpg`);
    await tab.screenshot({ path: out, type: "jpeg", quality: 88 });
    console.log(`OK ${path.relative(ROOT, out)}`);
  }
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
