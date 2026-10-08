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
      var max = Math.max(1, pin.offsetHeight - window.innerHeight);
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

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    }, { threshold: 0.18 });
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
})();
