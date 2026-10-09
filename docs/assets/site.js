/*
  Mapa de eventos (dataLayer, sin cargar Google Analytics):
  - cta_principal: clic en el botón principal «Probar WalQo»
  - probar_gratis: clic en «Probar gratis» de la barra
  - descargar: clic que inicia la descarga del instalador de Windows
  - instalacion: el mismo clic del instalador (la acción real disponible; no es una instalación ya terminada)
  - whatsapp: clic en un enlace de WhatsApp que no es la compra
  - visita_precios: al ver la sección #precios o al abrir /precios
  - inicio_compra: clic en «Comprar WalQo»
  - compra: reservado para un pago confirmado. No hay checkout en la web, así que no se dispara
  - registro: reservado para un alta de cuenta confirmada. No hay formulario de registro, así que no se dispara
  Cada evento incluye page_path y campaign (utm_* de la URL, o null).
*/
(function () {
  document.documentElement.classList.add("js");
  window.dataLayer = window.dataLayer || [];

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function campaign() {
    var q = new URLSearchParams(location.search);
    var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    var utm = {};
    var any = false;
    keys.forEach(function (key) {
      var value = q.get(key);
      if (value) {
        utm[key] = value;
        any = true;
      }
    });
    return any ? utm : null;
  }

  function track(eventName) {
    window.dataLayer.push({
      event: eventName,
      page_path: location.pathname,
      campaign: campaign()
    });
  }

  var REPO = "Walphur/gestion-comercios";
  var WA_HELP = "https://wa.me/5492664580915?text=" + encodeURIComponent("Hola! No me deja descargar el instalador de WalQo.");
  var btn = document.getElementById("dl-btn");
  var label = document.getElementById("dl-label");
  var meta = document.getElementById("dl-meta");
  var errEl = document.getElementById("dl-err");
  var downloads = document.querySelectorAll("[data-download]");

  function pickInstaller(assets) {
    if (!assets || !assets.length) return null;
    return (
      assets.find(function (a) { return /setup\.exe$/i.test(a.name) && /x64/i.test(a.name); }) ||
      assets.find(function (a) { return /setup\.exe$/i.test(a.name); }) ||
      assets.find(function (a) { return /\.exe$/i.test(a.name); })
    );
  }

  function formatSize(bytes) {
    if (!bytes) return "";
    var mb = bytes / (1024 * 1024);
    return mb >= 1 ? mb.toFixed(1) + " MB" : Math.round(bytes / 1024) + " KB";
  }

  function armDownloads(href, external) {
    downloads.forEach(function (el) {
      el.href = href;
      el.classList.remove("is-loading");
      el.removeAttribute("aria-busy");
      if (external) {
        el.target = "_blank";
        el.rel = "noopener";
        el.removeAttribute("download");
      } else {
        el.removeAttribute("target");
        el.setAttribute("download", "");
      }
    });
  }

  if (downloads.length) {
    fetch("https://api.github.com/repos/" + REPO + "/releases/latest", {
      headers: { Accept: "application/vnd.github+json" }
    }).then(function (res) {
      if (!res.ok) throw new Error("No se pudo obtener el instalador. Escribinos por WhatsApp.");
      return res.json();
    }).then(function (data) {
      var asset = pickInstaller(data.assets);
      if (!asset) throw new Error("No hay instalador disponible. Escribinos por WhatsApp.");
      armDownloads(asset.browser_download_url, false);
      if (meta) {
        var parts = [];
        if (data.tag_name) parts.push(data.tag_name);
        parts.push("Windows 64 bits");
        var size = formatSize(asset.size);
        if (size) parts.push(size);
        meta.textContent = parts.join(" · ");
      }
    }).catch(function (e) {
      armDownloads(WA_HELP, true);
      if (label) label.textContent = "Pedir el instalador";
      if (meta) meta.textContent = "Si falló la descarga, te lo mandamos nosotros";
      if (errEl) {
        errEl.textContent = e instanceof Error ? e.message : "Error al preparar la descarga.";
        errEl.hidden = false;
      }
    });
  }

  document.addEventListener("click", function (event) {
    var el = event.target.closest("[data-track], [data-download], [data-whatsapp], [data-buy]");
    if (!el) return;
    if (el.hasAttribute("data-track")) track(el.getAttribute("data-track"));
    if (el.hasAttribute("data-download")) {
      track("descargar");
      track("instalacion");
    }
    if (el.hasAttribute("data-whatsapp")) track("whatsapp");
    if (el.hasAttribute("data-buy")) track("inicio_compra");
  });

  var pricesSeen = false;
  function seePrices() {
    if (pricesSeen) return;
    pricesSeen = true;
    track("visita_precios");
  }
  if (/\/precios\/?$/.test(location.pathname.replace(/\/index\.html$/, ""))) seePrices();
  var priceBlock = document.getElementById("precios");
  if (priceBlock && "IntersectionObserver" in window && !pricesSeen) {
    var priceObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) seePrices();
      });
    }, { threshold: 0.35 });
    priceObserver.observe(priceBlock);
  }

  var nav = document.getElementById("nav");
  var toggle = document.getElementById("nav-toggle");
  if (nav && toggle) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  var visual = document.getElementById("hero-visual");
  var title = document.getElementById("hero-title");
  var aside = document.getElementById("hero-aside");
  var shift = document.getElementById("product-shift");
  var pin = document.querySelector(".hero-pin");

  if (nav) {
    var ticking = false;
    function onScroll() {
      nav.classList.toggle("is-scrolled", window.scrollY > 12);
      if (!title || !aside || !shift || !pin || reduce || window.innerWidth < 901) {
        if (title) title.style.transform = "";
        if (title) title.style.opacity = "";
        if (aside) aside.style.opacity = "";
        if (shift) shift.style.transform = "";
        return;
      }
      var max = pin.offsetHeight - window.innerHeight;
      if (max < 80) return;
      var p = Math.max(0, Math.min(1, window.scrollY / max));
      title.style.transform = "scale(" + (1 - p * 0.06) + ")";
      title.style.opacity = String(1 - p * 0.45);
      aside.style.opacity = String(1 - p * 0.7);
      shift.style.transform = "translate3d(0," + (p * 64) + "px,0)";
    }
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { onScroll(); ticking = false; });
    }, { passive: true });
    onScroll();
  }

  if (visual && !reduce && window.matchMedia("(pointer: fine)").matches) {
    visual.addEventListener("pointermove", function (e) {
      var r = visual.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      visual.style.setProperty("--mx", (x * -10).toFixed(2) + "deg");
      visual.style.setProperty("--my", (8 + y * 6).toFixed(2) + "deg");
    });
    visual.addEventListener("pointerleave", function () {
      visual.style.removeProperty("--mx");
      visual.style.removeProperty("--my");
    });
  }

  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.2) entry.target.classList.add("in");
        else if (entry.intersectionRatio === 0) entry.target.classList.remove("in");
      });
    }, { rootMargin: "-10% 0px -10% 0px", threshold: [0, 0.2] });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });

    var shots = document.querySelectorAll(".sticky-shot");
    if (shots.length) {
      var so = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.getAttribute("data-shot");
          shots.forEach(function (shot) {
            shot.classList.toggle("is-on", shot.getAttribute("data-shot") === id);
          });
        });
      }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
      document.querySelectorAll(".step").forEach(function (step) { so.observe(step); });
    }
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  var TUTORIALS = [
    { id: "instalacion", title: "Instalá el programa", description: "El instalador de Windows en la PC del comercio.", video: "/marketing/videos/instalacion.mp4" },
    { id: "sesion", title: "Iniciá sesión", description: "El primer ingreso y los usuarios del comercio.", video: "/marketing/videos/usuarios.mp4" },
    { id: "licencia", title: "Cargá la licencia", description: "La clave del plan, en esta computadora." },
    { id: "productos", title: "Cargá un producto", description: "Cómo se da de alta un producto.", video: "/marketing/videos/crear-producto.mp4", shot: "productos" },
    { id: "stock", title: "Stock", description: "Entradas, salidas y lo que falta.", shot: "stock" },
    { id: "ventas", title: "Hacé una venta", description: "Una venta en el mostrador.", video: "/marketing/videos/venta.mp4", shot: "pos" },
    { id: "caja", title: "Caja", description: "Abrir el turno y cerrarlo.", shot: "caja" },
    { id: "clientes", title: "Clientes", description: "La ficha y la cuenta corriente.", shot: "clientes" },
    { id: "facturacion", title: "Facturación", description: "La factura del día y la compra del proveedor.", shot: "facturas" },
    { id: "mercadopago", title: "Mercado Pago", description: "Cobrar con QR desde la venta.", shot: "mercadopago" },
    { id: "tiendanube", title: "Conectá Tienda Nube", description: "Vinculá la tienda para que el stock viaje solo.", video: "/marketing/videos/tiendanube.mp4" },
    { id: "reportes", title: "Reportes", description: "Leer el día sin exportar una planilla.", shot: "reportes" }
  ];

  var SHOTS = [
    { id: "pos", title: "Punto de venta", description: "Todo lo que necesitás para cobrar desde el mostrador.", src: "/marketing/shots/pos.png", alt: "Punto de venta de WalQo en una venta" },
    { id: "productos", title: "Productos", description: "El catálogo del local, con precio y código.", src: "/marketing/shots/productos.png", alt: "Listado de productos de WalQo" },
    { id: "stock", title: "Stock", description: "Cantidades y lo que hay que reponer.", src: "/marketing/shots/stock.png", alt: "Control de stock en WalQo" },
    { id: "clientes", title: "Clientes", description: "La cuenta de quien compra seguido.", src: "/marketing/shots/clientes.png", alt: "Ficha de clientes en WalQo" },
    { id: "reportes", title: "Reportes", description: "El cierre, leído en la misma PC.", src: "/marketing/shots/reportes.png", alt: "Reportes del día en WalQo" },
    { id: "mercadopago", title: "Mercado Pago", description: "El QR, sin salir de la venta.", src: "/marketing/shots/mercadopago.png", alt: "Cobro con Mercado Pago dentro de WalQo" },
    { id: "facturas", title: "Facturación", description: "La factura electrónica, desde el comercio.", src: "/marketing/shots/facturas.png", alt: "Facturas en WalQo" }
  ];

  var playSvg = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.3"/><path d="M7 5.6v4.8l4-2.4-4-2.4z" fill="currentColor"/></svg>';

  function showTutorial(index) {
    var item = TUTORIALS[index];
    if (!item) return;
    var video = document.getElementById("studio-video");
    var frame = document.getElementById("studio-frame");
    var title = document.getElementById("studio-title");
    var desc = document.getElementById("studio-desc");
    var bar = document.getElementById("studio-bar");
    if (title) title.textContent = item.title;
    if (desc) desc.textContent = item.description;
    if (bar) bar.textContent = item.title;
    document.querySelectorAll(".play-item").forEach(function (btn, i) {
      var on = i === index;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (!video) return;
    if (item.video) {
      if (frame) frame.hidden = false;
      video.hidden = false;
      video.removeAttribute("poster");
      var source = video.querySelector("source");
      if (source && source.getAttribute("src") !== item.video) {
        video.pause();
        source.setAttribute("src", item.video);
        video.load();
      }
      video.onloadedmetadata = function () {
        if (!isFinite(video.duration)) return;
        var mins = Math.floor(video.duration / 60);
        var secs = Math.round(video.duration % 60);
        var label = mins + ":" + (secs < 10 ? "0" : "") + secs;
        var row = playlist && playlist.children[index];
        if (row) row.querySelector("small").textContent = label;
      };
    } else {
      video.pause();
      video.hidden = true;
      if (frame) frame.hidden = true;
    }
  }

  var playlist = document.getElementById("playlist");
  if (playlist) {
    TUTORIALS.forEach(function (item, index) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "play-item" + (item.video ? "" : " is-soon");
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", "false");
      btn.dataset.tutorial = item.id;
      btn.dataset.shot = item.shot || "";
      btn.innerHTML = playSvg + "<span><strong></strong><small></small></span>";
      btn.querySelector("strong").textContent = item.title;
      btn.querySelector("small").textContent = item.video ? "Disponible" : "Próximamente";
      btn.addEventListener("click", function () { showTutorial(index); });
      playlist.appendChild(btn);
    });
    var firstPlayable = 0;
    TUTORIALS.forEach(function (item, index) {
      if (item.video && !TUTORIALS[firstPlayable].video) firstPlayable = index;
    });
    showTutorial(firstPlayable);
  }

  var shotIndex = 0;
  var shotImg = document.getElementById("shot-img");
  var shotDots = document.getElementById("shot-dots");
  function showShot(index) {
    if (!SHOTS.length || !shotImg) return;
    shotIndex = (index + SHOTS.length) % SHOTS.length;
    var shot = SHOTS[shotIndex];
    var apply = function () {
      shotImg.src = shot.src;
      shotImg.alt = shot.alt;
      var title = document.getElementById("shot-title");
      var desc = document.getElementById("shot-desc");
      var bar = document.getElementById("shot-bar");
      if (title) title.textContent = shot.title;
      if (desc) desc.textContent = shot.description;
      if (bar) bar.textContent = shot.title;
      shotImg.classList.remove("is-out");
    };
    if (reduce) apply();
    else {
      shotImg.classList.add("is-out");
      window.setTimeout(apply, 160);
    }
    if (shotDots) {
      shotDots.querySelectorAll("button").forEach(function (dot, i) {
        dot.classList.toggle("is-on", i === shotIndex);
        dot.setAttribute("aria-selected", i === shotIndex ? "true" : "false");
      });
    }
  }
  if (shotDots && shotImg) {
    SHOTS.forEach(function (shot, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", shot.title);
      dot.className = i === 0 ? "is-on" : "";
      dot.addEventListener("click", function () { showShot(i); });
      shotDots.appendChild(dot);
    });
    document.querySelectorAll("[data-shot-dir]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showShot(shotIndex + Number(btn.getAttribute("data-shot-dir")));
      });
    });
    var stage = document.querySelector(".shot-stage");
    var shotTimer = 0;
    function armShots() {
      window.clearInterval(shotTimer);
      if (reduce) return;
      shotTimer = window.setInterval(function () { showShot(shotIndex + 1); }, 4500);
    }
    function pauseShots() { window.clearInterval(shotTimer); }
    document.querySelectorAll("[data-shot-dir]").forEach(function (btn) {
      btn.addEventListener("click", armShots);
    });
    if (shotDots) shotDots.addEventListener("click", armShots);
    if (stage) {
      var startX = 0;
      stage.addEventListener("pointerdown", function (e) { startX = e.clientX; });
      stage.addEventListener("pointerup", function (e) {
        var dx = e.clientX - startX;
        if (Math.abs(dx) < 40) return;
        showShot(shotIndex + (dx < 0 ? 1 : -1));
        armShots();
      });
      stage.addEventListener("pointerenter", pauseShots);
      stage.addEventListener("pointerleave", armShots);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) pauseShots();
      else armShots();
    });
    armShots();
  }

  var RUBRO_COPY = {
    kiosco: { kicker: "Para kiosco", line: "Vendé rápido y controlá lo que falta.", points: ["Código de barras", "Vencimientos", "Caja del turno"] },
    farmacia: { kicker: "Para farmacia", line: "Lotes y vencimientos, en el mismo stock.", points: ["Lotes", "Vencimientos", "Código de barras"] },
    verduleria: { kicker: "Para verdulería", line: "Cobrá por kilo o por un monto.", points: ["Venta por peso", "Monto fijo", "Caja del turno"] },
    ferreteria: { kicker: "Para ferretería", line: "Unidad, metro o kilo, en la misma venta.", points: ["Código", "Metro y kilo", "Caja del turno"] },
    petshop: { kicker: "Para pet shop", line: "Alimento por kilo, con vencimiento.", points: ["Kilos", "Vencimientos", "Stock"] },
    ropa: { kicker: "Para indumentaria", line: "Cada talle y color, con su stock.", points: ["Talles", "Colores", "Stock"] },
    panaderia: { kicker: "Para panadería", line: "Vendé por unidad o por peso.", points: ["Venta rápida", "Por kilo", "Elaboración"] },
    gastronomia: { kicker: "Para gastronomía", line: "La carta en el mostrador, sin mesas.", points: ["Carta", "Ticket de cocina", "Propina"] },
    libreria: { kicker: "Para librería", line: "Código, categoría y stock por unidad.", points: ["Código de barras", "Categorías", "Stock"] },
    electronica: { kicker: "Para electrónica", line: "Color, capacidad y número de serie.", points: ["Variantes", "Número de serie", "Stock"] },
    general: { kicker: "Para cualquier rubro", line: "Unidad, kilo o un monto fijo.", points: ["Ventas", "Stock", "Caja del turno"] },
    supermercado: { kicker: "Para supermercado", line: "Catálogo grande y varias cajas.", points: ["Código de barras", "Por kilo", "Plan Pro"] },
    taller: { kicker: "Para taller", line: "Repuestos, presupuestos y órdenes.", points: ["Repuestos", "Presupuestos", "Plan Pro"] },
    estetica: { kicker: "Para estética", line: "Turnos y venta de productos.", points: ["Turnos", "Productos", "Plan Pro"] },
    clinica: { kicker: "Para clínica", line: "Turnos, pacientes y el cobro.", points: ["Turnos", "Pacientes", "Plan Pro"] }
  };

  function showRubro(btn) {
    var id = btn.getAttribute("data-rubro");
    var copy = RUBRO_COPY[id];
    document.querySelectorAll(".rubro").forEach(function (other) {
      var on = other === btn;
      other.classList.toggle("is-on", on);
      other.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var section = document.getElementById("rubros");
    if (section) section.setAttribute("data-selected", id || "");
    if (!copy) return;
    var kicker = document.getElementById("rubro-kicker");
    var line = document.getElementById("rubro-line");
    var points = document.getElementById("rubro-points");
    var mark = document.getElementById("rubro-stage-mark");
    if (kicker) kicker.textContent = copy.kicker;
    if (line) line.textContent = copy.line;
    if (points) {
      points.innerHTML = "";
      copy.points.forEach(function (text) {
        var li = document.createElement("li");
        li.textContent = text;
        points.appendChild(li);
      });
    }
    if (mark) {
      var icon = btn.querySelector(".rubro-icon");
      mark.innerHTML = icon ? icon.innerHTML : "";
    }
  }

  document.querySelectorAll(".rubro").forEach(function (btn) {
    btn.addEventListener("click", function () { showRubro(btn); });
  });
  var rubroOn = document.querySelector(".rubro.is-on");
  if (rubroOn) showRubro(rubroOn);

  var demoRoot = document.getElementById("demo");
  if (demoRoot) {
    var demoItems = [
      { id: "leche", name: "Leche 1 L", cat: "Lácteos", price: 1650, stock: 7 },
      { id: "yogur", name: "Yogur bebible", cat: "Lácteos", price: 980, stock: 11 },
      { id: "arroz", name: "Arroz 1 kg", cat: "Almacén", price: 1450, stock: 5 },
      { id: "fideos", name: "Fideos", cat: "Almacén", price: 890, stock: 16 },
      { id: "lavandina", name: "Lavandina 1 L", cat: "Limpieza", price: 1150, stock: 4 },
      { id: "esponja", name: "Esponja", cat: "Limpieza", price: 450, stock: 20 }
    ];
    var demoCat = "Todos";
    var demoQuery = "";
    var demoCart = {};
    var demoPay = "Efectivo";
    var money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
    var catsEl = document.getElementById("demo-cats");
    var productsEl = document.getElementById("demo-products");
    var linesEl = document.getElementById("demo-lines");
    var totalEl = document.getElementById("demo-total");
    var payBtn = document.getElementById("demo-pay");
    var modal = document.getElementById("demo-modal");
    var done = document.getElementById("demo-done");

    function demoTotal() {
      return demoItems.reduce(function (sum, item) {
        return sum + item.price * (demoCart[item.id] || 0);
      }, 0);
    }

    function renderDemo() {
      var cats = ["Todos"];
      demoItems.forEach(function (item) {
        if (cats.indexOf(item.cat) < 0) cats.push(item.cat);
      });
      catsEl.innerHTML = "";
      cats.forEach(function (cat) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = cat;
        b.className = cat === demoCat ? "is-on" : "";
        b.addEventListener("click", function () { demoCat = cat; renderDemo(); });
        catsEl.appendChild(b);
      });
      productsEl.innerHTML = "";
      demoItems.filter(function (item) {
        if (demoCat !== "Todos" && item.cat !== demoCat) return false;
        return item.name.toLowerCase().indexOf(demoQuery) >= 0;
      }).forEach(function (item) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "demo-product";
        b.disabled = item.stock < 1;
        b.setAttribute("aria-label", "Agregar " + item.name);
        b.innerHTML = "<span class='demo-mark' aria-hidden='true'></span><span><b></b><small></small></span><span class='demo-add' aria-hidden='true'>+</span>";
        b.querySelector(".demo-mark").textContent = item.name.slice(0, 1);
        b.querySelector("b").textContent = item.name;
        b.querySelector("small").textContent = money.format(item.price) + " · Quedan " + item.stock;
        b.addEventListener("click", function () {
          if (item.stock < 1) return;
          demoCart[item.id] = (demoCart[item.id] || 0) + 1;
          item.stock -= 1;
          renderDemo();
        });
        productsEl.appendChild(b);
      });
      linesEl.innerHTML = "";
      demoItems.forEach(function (item) {
        var qty = demoCart[item.id] || 0;
        if (!qty) return;
        var li = document.createElement("li");
        var name = document.createElement("span");
        name.textContent = qty + " × " + item.name;
        var price = document.createElement("span");
        price.textContent = money.format(item.price * qty);
        li.appendChild(name);
        li.appendChild(price);
        linesEl.appendChild(li);
      });
      if (!linesEl.children.length) {
        var empty = document.createElement("li");
        empty.textContent = "El ticket está vacío.";
        linesEl.appendChild(empty);
      }
      var total = demoTotal();
      totalEl.textContent = money.format(total);
      payBtn.disabled = total <= 0;
    }

    document.getElementById("demo-q").addEventListener("input", function (e) {
      demoQuery = e.target.value.trim().toLowerCase();
      renderDemo();
    });
    payBtn.addEventListener("click", function () {
      document.getElementById("demo-due").textContent = money.format(demoTotal());
      document.getElementById("demo-confirm").textContent = "Cobrar " + money.format(demoTotal());
      modal.hidden = false;
    });
    document.getElementById("demo-close").addEventListener("click", function () { modal.hidden = true; });
    document.getElementById("demo-pays").addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      demoPay = btn.getAttribute("data-pay");
      document.querySelectorAll("#demo-pays button").forEach(function (other) {
        other.classList.toggle("is-on", other === btn);
      });
    });
    document.getElementById("demo-confirm").addEventListener("click", function () {
      var lines = demoItems.filter(function (item) { return demoCart[item.id]; });
      var result = document.getElementById("demo-result");
      result.innerHTML = "";
      var paid = document.createElement("li");
      paid.textContent = "Medio: " + demoPay + ".";
      result.appendChild(paid);
      lines.forEach(function (item) {
        var li = document.createElement("li");
        li.textContent = "Stock de ejemplo: " + item.name + ", quedan " + item.stock + ".";
        result.appendChild(li);
      });
      document.getElementById("demo-done-total").textContent = money.format(demoTotal());
      modal.hidden = true;
      done.hidden = false;
    });
    document.getElementById("demo-again").addEventListener("click", function () {
      demoCart = {};
      done.hidden = true;
      renderDemo();
    });
    renderDemo();
  }
})();
