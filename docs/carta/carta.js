(() => {
  const API = (
    window.WALQO_LICENSE_API_URL ||
    "https://gestion-comercios-license.walphur.workers.dev"
  ).replace(/\/$/, "");

  const params = new URLSearchParams(window.location.search);
  const DEMO = window.WALQO_CARTA_DEMO && typeof window.WALQO_CARTA_DEMO === "object" ? window.WALQO_CARTA_DEMO : null;
  const prettySlug = DEMO ? String(DEMO.slug || "demo") : typeof window.WALQO_CARTA_SLUG === "string" ? window.WALQO_CARTA_SLUG : "";
  const slug = (prettySlug || params.get("t") || params.get("slug") || "").trim().toLowerCase();
  const CART_KEY = `walqo-cart:${slug}`;
  const CUSTOMER_KEY = "walqo-customer";

  const $ = (id) => document.getElementById(id);
  const bizName = $("biz-name");
  const bizLogo = $("biz-logo");
  const bizLead = $("biz-lead");
  const bizChips = $("biz-chips");
  const bizHours = $("biz-hours");
  const heroCover = $("hero-cover");
  const statusEl = $("status");
  const toolbar = $("toolbar");
  const searchInput = $("search");
  const catNav = $("cat-nav");
  const menuBody = $("menu-body");
  const cartBar = $("cart-bar");
  const cartCount = $("cart-count");
  const cartBarTotal = $("cart-bar-total");
  const checkout = $("checkout");
  const cartLines = $("cart-lines");
  const sumProducts = $("sum-products");
  const sumDeliveryRow = $("sum-delivery-row");
  const sumDelivery = $("sum-delivery");
  const sumTotal = $("sum-total");
  const orderForm = $("order-form");
  const fulfillmentEl = $("fulfillment");
  const deliveryLabel = $("delivery-label");
  const fName = $("f-name");
  const fPhone = $("f-phone");
  const fAddressWrap = $("f-address-wrap");
  const fAddress = $("f-address");
  const fNote = $("f-note");
  const fWebsite = $("f-website");
  const formError = $("form-error");
  const btnSend = $("btn-send");
  const waOnly = $("wa-only");
  const btnWa = $("btn-wa");
  const waHint = $("wa-hint");
  const done = $("done");
  const doneMark = $("done-mark");
  const doneTitle = $("done-title");
  const doneText = $("done-text");
  const doneCode = $("done-code");
  const doneWa = $("done-wa");
  const doneRetry = $("done-retry");
  const payChoice = $("pay-choice");
  const payCashLabel = $("pay-cash-label");
  const payHint = $("pay-hint");
  const PAY_KEY = "walqo-pay";
  const cookModal = $("cook-modal");
  const cookTitle = $("cook-title");
  const detail = $("detail");
  const detailTitle = $("detail-title");
  const galleryEl = $("gallery");
  const galleryTrack = $("gallery-track");
  const galleryPrev = $("gallery-prev");
  const galleryNext = $("gallery-next");
  const galleryDots = $("gallery-dots");
  const detailInfo = $("detail-info");
  const detailActions = $("detail-actions");

  /** @type {{ id:number, name:string, price:number, category:string|null, description:string|null, is_daily_menu:boolean, image_data_url?:string|null, available?:boolean, photos?:string[], price_usd?:number, units?:{capacity?:string, color?:string, condition:string, battery?:number}[] }[]} */
  let products = [];
  /** @type {number|null} */
  let detailId = null;
  let galleryIndex = 0;
  let currency = "$";
  let whatsapp = null;
  let businessName = "Mi local";
  let store = { pickup: true, delivery: false, delivery_cost: null, orders_enabled: false, hide_out_of_stock: false, pay_online: false };
  let retryUrl = null;
  /** @type {{ key:string, id:number, qty:number, cook:string|null }[]} */
  let lines = [];
  let activeCat = "all";
  let query = "";
  /** @type {number|null} */
  let cookForId = null;
  let lastWaUrl = null;
  let sending = false;

  function fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeDataImage(url) {
    return typeof url === "string" && /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(url)
      ? url
      : null;
  }

  function money(n, prefixOverride) {
    const v = Number(n) || 0;
    const prefix = prefixOverride || (currency === "$" || !currency ? "$" : currency);
    try {
      return `${prefix} ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(v)}`;
    } catch {
      return `${prefix} ${Math.round(v)}`;
    }
  }

  function photoHashes(p) {
    return Array.isArray(p.photos) ? p.photos.filter((h) => /^[0-9a-f]{16,40}$/.test(h)).slice(0, 4) : [];
  }

  function photoUrl(hash) {
    if (DEMO && DEMO.photos && DEMO.photos[hash]) return DEMO.photos[hash];
    return `${API}/v1/menu-portal/photo?t=${encodeURIComponent(slug)}&h=${hash}`;
  }

  function usdPrice(p) {
    const v = Number(p.price_usd);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  const CONDITION_LABEL = { nuevo: "Nuevo", usado: "Usado", reacondicionado: "Reacondicionado" };

  function isEmpanada(p) {
    return fold(p.category).includes("empanada") || fold(p.name).includes("empanada");
  }

  function isAvailable(p) {
    return p.available !== false;
  }

  function productById(id) {
    return products.find((x) => x.id === id) || null;
  }

  function catOf(p) {
    if (p.is_daily_menu) return "Menú del día";
    return p.category || "Otros";
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* modo privado */
    }
  }

  function saveCart() {
    writeJson(CART_KEY, lines);
  }

  /* ---------- Apariencia ---------- */

  function hexToRgb(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function applyTheme() {
    const rgb = hexToRgb(store.color);
    if (!rgb) return;
    const root = document.documentElement.style;
    root.setProperty("--accent", store.color);
    root.setProperty("--accent-soft", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`);
    const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    root.setProperty("--accent-ink", lum > 0.65 ? "#18181b" : "#ffffff");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", store.color);
  }

  function renderHero(logoUrl) {
    document.title = `${businessName} · Tienda`;
    bizName.textContent = businessName;
    const logo = safeDataImage(logoUrl);
    if (logo) {
      bizLogo.src = logo;
      bizLogo.hidden = false;
    }
    const cover = safeDataImage(store.cover_data_url) || (DEMO && DEMO.cover) || null;
    if (cover) heroCover.style.backgroundImage = `url("${cover}")`;
    bizLead.textContent = store.orders_enabled
      ? "Elegí tus productos y hacé tu pedido"
      : whatsapp
        ? "Elegí lo que querés y pedí por WhatsApp"
        : "Mirá los productos y precios";
    const chips = [];
    if (store.orders_enabled || whatsapp) {
      if (store.pickup) chips.push("Retiro en el local");
      if (store.delivery) {
        chips.push(store.delivery_cost ? `Envío ${money(store.delivery_cost)}` : "Envío a domicilio");
      }
    }
    if (store.orders_enabled && store.pay_online) chips.push("Pagá online con Mercado Pago");
    if (chips.length) {
      bizChips.innerHTML = chips.map((c) => `<span>${escapeHtml(c)}</span>`).join("");
      bizChips.hidden = false;
    }
    if (store.hours) {
      bizHours.textContent = store.hours;
      bizHours.hidden = false;
    }
  }

  /* ---------- Catálogo ---------- */

  function categories() {
    const seen = new Set();
    for (const p of products) seen.add(catOf(p));
    return ["all", ...seen];
  }

  function renderNav() {
    const cats = categories();
    if (cats.length <= 2) {
      catNav.hidden = true;
      return;
    }
    catNav.hidden = false;
    catNav.innerHTML = cats
      .map((c) => {
        const label = c === "all" ? "Todo" : escapeHtml(c);
        const active = c === activeCat ? " active" : "";
        return `<button type="button" class="${active.trim()}" data-cat="${escapeHtml(c)}">${label}</button>`;
      })
      .join("");
  }

  catNav.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    activeCat = btn.getAttribute("data-cat") || "all";
    renderNav();
    renderMenu();
  });

  let searchTimer = null;
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      query = fold(searchInput.value.trim());
      renderMenu();
    }, 120);
  });

  function qtyInCart(id) {
    return lines.filter((l) => l.id === id).reduce((acc, l) => acc + l.qty, 0);
  }

  function priceHtml(p) {
    const usd = usdPrice(p);
    return `<div class="price-wrap"><div class="price">${escapeHtml(money(p.price))}</div>${
      usd ? `<div class="price-usd">${escapeHtml(money(usd, "US$"))}</div>` : ""
    }</div>`;
  }

  function actionsHtml(p) {
    if (!isAvailable(p)) {
      return `<button type="button" class="btn-add" disabled>Sin stock</button>`;
    }
    const qty = qtyInCart(p.id);
    if (qty > 0 && !isEmpanada(p)) {
      return `<div class="stepper">
          <button type="button" data-act="dec" data-id="${p.id}" aria-label="Sacar uno">−</button>
          <span>${qty}</span>
          <button type="button" data-act="inc" data-id="${p.id}" aria-label="Agregar otro">+</button>
        </div>`;
    }
    const label = qty > 0 ? `Agregar (${qty} en tu pedido)` : "Agregar";
    return `<button type="button" class="btn-add" data-act="add" data-id="${p.id}">${label}</button>`;
  }

  function footHtml(p) {
    return priceHtml(p) + actionsHtml(p);
  }

  function cardHtml(p) {
    const initial = escapeHtml((p.name || "?").trim().charAt(0).toUpperCase() || "?");
    const hashes = photoHashes(p);
    const img = safeDataImage(p.image_data_url) || (hashes[0] ? photoUrl(hashes[0]) : null);
    const badge = isAvailable(p)
      ? `<span class="stock-badge ok">Disponible</span>`
      : `<span class="stock-badge no">Sin stock</span>`;
    const count = hashes.length > 1 ? `<span class="photo-count">${hashes.length} fotos</span>` : "";
    const label = `Ver ${escapeHtml(p.name)}`;
    const photo = img
      ? `<button type="button" class="product-photo" data-open="${p.id}" aria-label="${label}"><img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async" />${badge}${count}</button>`
      : `<button type="button" class="product-photo product-photo--empty" data-open="${p.id}" aria-label="${label}"><span aria-hidden="true">${initial}</span>${badge}</button>`;
    return `<article class="product${isAvailable(p) ? "" : " is-out"}" data-pid="${p.id}">
      ${photo}
      <div class="product-body">
        <p class="product-name">${escapeHtml(p.name)}</p>
        ${p.description ? `<p class="product-desc">${escapeHtml(p.description)}</p>` : ""}
        ${p.is_daily_menu ? `<span class="badge">Menú del día</span>` : ""}
        <div class="product-foot">${footHtml(p)}</div>
      </div>
    </article>`;
  }

  function matches(p) {
    if (activeCat !== "all" && catOf(p) !== activeCat) return false;
    if (!query) return true;
    return fold(`${p.name} ${p.description || ""} ${p.category || ""}`).includes(query);
  }

  function renderMenu() {
    menuBody.hidden = false;
    if (products.length === 0) {
      menuBody.innerHTML = `<p class="empty">Este local todavía no publicó productos.</p>`;
      return;
    }
    const groups = new Map();
    for (const p of products) {
      if (!matches(p)) continue;
      const cat = query ? "Resultados" : catOf(p);
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(p);
    }
    if (groups.size === 0) {
      menuBody.innerHTML = `<p class="empty">No encontramos «${escapeHtml(searchInput.value.trim())}».</p>`;
      return;
    }
    let html = "";
    for (const [cat, items] of groups) {
      html += `<section class="menu-section"><h2>${escapeHtml(cat)}</h2><div class="product-grid">`;
      html += items.map(cardHtml).join("");
      html += `</div></section>`;
    }
    menuBody.innerHTML = html;
  }

  function refreshCards(id) {
    const p = productById(id);
    if (!p) return;
    menuBody.querySelectorAll(`[data-pid="${id}"] .product-foot`).forEach((el) => {
      el.innerHTML = footHtml(p);
    });
  }

  menuBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (btn) {
      handleAct(btn);
      return;
    }
    const card = e.target.closest("[data-pid]");
    if (card) openDetail(Number(card.getAttribute("data-pid")));
  });

  function handleAct(btn) {
    const id = Number(btn.getAttribute("data-id"));
    const act = btn.getAttribute("data-act");
    const p = productById(id);
    if (!p || !isAvailable(p)) return;
    if (act === "add") {
      if (isEmpanada(p)) {
        cookForId = id;
        cookTitle.textContent = `${p.name}: ¿frita o al horno?`;
        cookModal.hidden = false;
        return;
      }
      addLine(id, null);
    } else if (act === "inc") {
      addLine(id, null);
    } else if (act === "dec") {
      changeLine(`${id}|`, -1);
    }
  }

  /* ---------- Detalle con fotos ---------- */

  function unitLabel(u) {
    const parts = [];
    if (u.capacity) parts.push(u.capacity);
    if (u.color) parts.push(u.color);
    parts.push(CONDITION_LABEL[u.condition] || "Nuevo");
    if (u.condition !== "nuevo" && Number(u.battery) > 0) parts.push(`Batería ${Math.round(u.battery)}%`);
    return parts.join(" · ");
  }

  function renderGallery(p) {
    const hashes = photoHashes(p);
    const thumb = safeDataImage(p.image_data_url);
    const sources = hashes.length ? hashes.map(photoUrl) : thumb ? [thumb] : [];
    galleryIndex = 0;
    galleryEl.classList.toggle("is-empty", sources.length === 0);
    if (sources.length === 0) {
      const initial = escapeHtml((p.name || "?").trim().charAt(0).toUpperCase() || "?");
      galleryTrack.innerHTML = `<div class="gallery-slide gallery-slide--empty"><span aria-hidden="true">${initial}</span></div>`;
    } else {
      galleryTrack.innerHTML = sources
        .map((src, i) => {
          const bg = i === 0 && thumb && hashes.length ? ` style="background-image:url('${thumb}')"` : "";
          return `<div class="gallery-slide" role="group" aria-roledescription="foto" aria-label="Foto ${i + 1} de ${sources.length}"${bg}>
            <img src="${escapeHtml(src)}" alt="${escapeHtml(p.name)}${sources.length > 1 ? ` (foto ${i + 1})` : ""}" loading="${i === 0 ? "eager" : "lazy"}" decoding="async" />
          </div>`;
        })
        .join("");
    }
    const multi = sources.length > 1;
    galleryPrev.hidden = !multi;
    galleryNext.hidden = !multi;
    galleryDots.hidden = !multi;
    galleryDots.innerHTML = multi
      ? sources
          .map((_, i) => `<button type="button" data-dot="${i}" aria-label="Ver foto ${i + 1}"></button>`)
          .join("")
      : "";
    galleryTrack.scrollLeft = 0;
    updateGalleryUi();
  }

  function slideCount() {
    return galleryTrack.children.length;
  }

  function updateGalleryUi() {
    const n = slideCount();
    galleryPrev.disabled = galleryIndex <= 0;
    galleryNext.disabled = galleryIndex >= n - 1;
    galleryDots.querySelectorAll("button").forEach((b, i) => {
      b.classList.toggle("active", i === galleryIndex);
      b.setAttribute("aria-current", i === galleryIndex ? "true" : "false");
    });
    const near = [galleryIndex - 1, galleryIndex, galleryIndex + 1];
    Array.from(galleryTrack.querySelectorAll("img")).forEach((img, i) => {
      if (near.includes(i)) img.loading = "eager";
    });
  }

  function goToPhoto(i) {
    const n = slideCount();
    if (n === 0) return;
    galleryIndex = Math.max(0, Math.min(n - 1, i));
    galleryTrack.scrollTo({ left: galleryIndex * galleryTrack.clientWidth, behavior: "smooth" });
    updateGalleryUi();
  }

  let galleryScrollRaf = 0;
  galleryTrack.addEventListener("scroll", () => {
    if (galleryScrollRaf) return;
    galleryScrollRaf = requestAnimationFrame(() => {
      galleryScrollRaf = 0;
      const w = galleryTrack.clientWidth || 1;
      const i = Math.round(galleryTrack.scrollLeft / w);
      if (i !== galleryIndex) {
        galleryIndex = i;
        updateGalleryUi();
      }
    });
  });
  galleryPrev.addEventListener("click", () => goToPhoto(galleryIndex - 1));
  galleryNext.addEventListener("click", () => goToPhoto(galleryIndex + 1));
  galleryDots.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-dot]");
    if (b) goToPhoto(Number(b.getAttribute("data-dot")));
  });

  function renderDetailInfo(p) {
    const usd = usdPrice(p);
    const units = Array.isArray(p.units) ? p.units.slice(0, 12) : [];
    let html = "";
    if (p.category && !p.is_daily_menu) html += `<p class="detail-cat">${escapeHtml(p.category)}</p>`;
    html += `<div class="detail-price">
      <strong>${escapeHtml(money(p.price))}</strong>
      ${usd ? `<span class="price-usd">${escapeHtml(money(usd, "US$"))}</span>` : ""}
      <span class="detail-stock ${isAvailable(p) ? "ok" : "no"}">${isAvailable(p) ? "Disponible" : "Sin stock"}</span>
    </div>`;
    if (p.is_daily_menu) html += `<span class="badge">Menú del día</span>`;
    if (p.description) html += `<p class="detail-desc">${escapeHtml(p.description)}</p>`;
    if (units.length && isAvailable(p)) {
      html += `<div class="detail-units">
        <h3>Equipos disponibles</h3>
        <ul>${units.map((u) => `<li>${escapeHtml(unitLabel(u))}</li>`).join("")}</ul>
        ${units.length > 1 ? `<p class="units-note">Si te interesa uno en particular, aclaralo en la nota del pedido o consultá por WhatsApp.</p>` : ""}
      </div>`;
    }
    detailInfo.innerHTML = html;
  }

  function renderDetailActions() {
    const p = detailId != null ? productById(detailId) : null;
    if (!p) return;
    const count = lines.reduce((acc, l) => acc + l.qty, 0);
    let html = `<div class="detail-add">${actionsHtml(p)}</div>`;
    if (whatsapp) {
      html += `<button type="button" class="btn-wa" data-detail="ask">Consultar por WhatsApp</button>`;
    }
    if (count > 0) {
      html += `<button type="button" class="btn-ghost" data-detail="cart">Ver mi pedido (${count}) · ${escapeHtml(money(productsTotal()))}</button>`;
    }
    detailActions.innerHTML = html;
  }

  function detailHash(id) {
    return id != null ? `#p${id}` : "";
  }

  function openDetail(id, focusClose = true) {
    const p = productById(id);
    if (!p) return;
    detailId = id;
    detailTitle.textContent = p.name;
    renderGallery(p);
    renderDetailInfo(p);
    renderDetailActions();
    detail.hidden = false;
    document.body.style.overflow = "hidden";
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search + detailHash(id));
    } catch {
      /* ok */
    }
    detail.querySelector(".sheet-body").scrollTop = 0;
    if (focusClose) $("detail-close").focus({ preventScroll: true });
  }

  function closeDetail() {
    if (detail.hidden) return;
    const id = detailId;
    detailId = null;
    closeSheet(detail);
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch {
      /* ok */
    }
    const back = id != null ? menuBody.querySelector(`[data-pid="${id}"] [data-open]`) : null;
    if (back) back.focus({ preventScroll: true });
  }

  detailActions.addEventListener("click", (e) => {
    const act = e.target.closest("button[data-act]");
    if (act) {
      handleAct(act);
      return;
    }
    const b = e.target.closest("button[data-detail]");
    if (!b) return;
    const p = detailId != null ? productById(detailId) : null;
    if (b.getAttribute("data-detail") === "ask" && p) {
      const url = waUrl(`Hola! Quiero consultar por *${p.name}* (${money(p.price)}) que vi en la tienda.`);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } else if (b.getAttribute("data-detail") === "cart") {
      closeDetail();
      openCheckout();
    }
  });
  $("detail-close").addEventListener("click", closeDetail);
  detail.addEventListener("click", (e) => {
    if (e.target === detail) closeDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (detail.hidden || !cookModal.hidden) return;
    if (e.key === "Escape") {
      closeDetail();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      e.preventDefault();
      goToPhoto(galleryIndex + (e.key === "ArrowRight" ? 1 : -1));
    }
  });

  /* ---------- Carrito ---------- */

  function addLine(id, cook) {
    const key = `${id}|${cook || ""}`;
    const found = lines.find((l) => l.key === key);
    if (found) found.qty = Math.min(99, found.qty + 1);
    else lines.push({ key, id, qty: 1, cook });
    afterCartChange(id);
  }

  function changeLine(key, d) {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    line.qty = Math.min(99, line.qty + d);
    if (line.qty <= 0) lines = lines.filter((l) => l.key !== key);
    afterCartChange(line.id);
  }

  function afterCartChange(id) {
    saveCart();
    refreshCards(id);
    renderCartBar();
    if (!checkout.hidden) renderCheckout();
    if (!detail.hidden) renderDetailActions();
  }

  function productsTotal() {
    let total = 0;
    for (const l of lines) {
      const p = productById(l.id);
      if (p && isAvailable(p)) total += p.price * l.qty;
    }
    return Math.round(total * 100) / 100;
  }

  function renderCartBar() {
    const count = lines.reduce((acc, l) => acc + l.qty, 0);
    if (count === 0) {
      cartBar.hidden = true;
      return;
    }
    cartBar.hidden = false;
    cartCount.textContent = String(count);
    cartBarTotal.textContent = money(productsTotal());
  }

  cartBar.addEventListener("click", openCheckout);

  function selectedFulfillment() {
    const el = orderForm.querySelector('input[name="fulfillment"]:checked');
    if (store.pickup && store.delivery) return el ? el.value : "pickup";
    return store.delivery && !store.pickup ? "delivery" : "pickup";
  }

  function selectedPay() {
    if (!store.pay_online) return "cash";
    const el = orderForm.querySelector('input[name="pay"]:checked');
    return el && el.value === "mercadopago" ? "mercadopago" : "cash";
  }

  function renderPay() {
    payChoice.hidden = !store.pay_online;
    const delivery = selectedFulfillment() === "delivery";
    payCashLabel.textContent = delivery ? "Pagar al recibir" : "Pagar al retirar";
    const online = selectedPay() === "mercadopago";
    if (!sending) btnSend.textContent = online ? "Ir a pagar" : "Enviar pedido";
    payHint.textContent = online
      ? "Te llevamos a Mercado Pago para pagar y después volvés acá."
      : delivery
        ? "Pagás al recibir."
        : "Pagás al retirar.";
    if (!store.pay_online) payHint.textContent = "Pagás al retirar o al recibir.";
  }

  function renderCheckout() {
    if (lines.length === 0) {
      cartLines.innerHTML = `<li><span class="line-name">Tu pedido está vacío.</span></li>`;
    } else {
      cartLines.innerHTML = lines
        .map((l) => {
          const p = productById(l.id);
          if (!p) return "";
          const label = l.cook ? `${p.name} (${l.cook})` : p.name;
          const out = !isAvailable(p);
          return `<li>
            <span class="line-name">${escapeHtml(label)}</span>
            <span class="line-price">${escapeHtml(money(p.price * l.qty))}</span>
            <div class="line-qty">
              <button type="button" data-key="${escapeHtml(l.key)}" data-d="-1" aria-label="Sacar uno">−</button>
              <strong>${l.qty}</strong>
              <button type="button" data-key="${escapeHtml(l.key)}" data-d="1" aria-label="Agregar otro" ${out ? "disabled" : ""}>+</button>
              <span class="line-unit">${escapeHtml(money(p.price))} c/u</span>
            </div>
            ${out ? `<span class="line-out">Sin stock: sacalo para poder enviar el pedido</span>` : ""}
          </li>`;
        })
        .join("");
    }
    const sub = productsTotal();
    const delivery = selectedFulfillment() === "delivery" && store.delivery_cost ? store.delivery_cost : 0;
    sumProducts.textContent = money(sub);
    sumDeliveryRow.hidden = !delivery;
    sumDelivery.textContent = money(delivery);
    sumTotal.textContent = money(sub + delivery);
    fAddressWrap.hidden = selectedFulfillment() !== "delivery";
    const hasOut = lines.some((l) => {
      const p = productById(l.id);
      return !p || !isAvailable(p);
    });
    btnSend.disabled = sending || lines.length === 0 || hasOut;
    btnWa.disabled = !whatsapp || lines.length === 0 || hasOut;
    renderPay();
  }

  cartLines.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-key]");
    if (!btn) return;
    changeLine(btn.getAttribute("data-key") || "", Number(btn.getAttribute("data-d")));
  });

  orderForm.addEventListener("change", (e) => {
    if (e.target && e.target.name === "fulfillment") renderCheckout();
    if (e.target && e.target.name === "pay") renderPay();
  });

  function openCheckout() {
    const saved = readJson(CUSTOMER_KEY, {});
    if (!fName.value && saved.name) fName.value = saved.name;
    if (!fPhone.value && saved.phone) fPhone.value = saved.phone;
    if (!fAddress.value && saved.address) fAddress.value = saved.address;
    formError.hidden = true;
    orderForm.hidden = !store.orders_enabled;
    waOnly.hidden = Boolean(store.orders_enabled);
    waHint.hidden = Boolean(whatsapp);
    fulfillmentEl.hidden = !(store.pickup && store.delivery);
    deliveryLabel.textContent = store.delivery_cost
      ? `Envío · ${money(store.delivery_cost)}`
      : "Envío a domicilio";
    renderCheckout();
    checkout.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeSheet(el) {
    el.hidden = true;
    if (checkout.hidden && done.hidden && detail.hidden) document.body.style.overflow = "";
  }

  $("checkout-close").addEventListener("click", () => closeSheet(checkout));
  checkout.addEventListener("click", (e) => {
    if (e.target === checkout) closeSheet(checkout);
  });
  $("done-close").addEventListener("click", () => closeSheet(done));

  function closeCook() {
    cookForId = null;
    cookModal.hidden = true;
  }
  cookModal.querySelectorAll("[data-cook]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (cookForId == null) return;
      addLine(cookForId, btn.getAttribute("data-cook"));
      closeCook();
    });
  });
  cookModal.addEventListener("click", (e) => {
    if (e.target === cookModal) closeCook();
  });
  $("cook-cancel").addEventListener("click", closeCook);

  /* ---------- Enviar ---------- */

  function waText(code, customer) {
    const out = [];
    out.push(code ? `Hola! Hice un pedido en *${businessName}* (#${code}):` : `Hola! Quiero pedir en *${businessName}*:`);
    out.push("");
    for (const l of lines) {
      const p = productById(l.id);
      if (!p) continue;
      const label = l.cook ? `${p.name} (${l.cook})` : p.name;
      out.push(`• ${label} × ${l.qty} — ${money(p.price * l.qty)}`);
    }
    out.push("");
    const sub = productsTotal();
    if (customer && customer.fulfillment === "delivery" && store.delivery_cost) {
      out.push(`Total: *${money(sub + store.delivery_cost)}* (con envío ${money(store.delivery_cost)})`);
    } else {
      out.push(`Total: *${money(sub)}*`);
    }
    if (customer) {
      out.push(customer.fulfillment === "delivery" ? `Envío a: ${customer.address}` : "Retiro en el local");
      out.push(`A nombre de: ${customer.name}`);
      if (customer.note) out.push(`Nota: ${customer.note}`);
    }
    out.push("");
    out.push("Gracias!");
    return out.join("\n");
  }

  function waUrl(text) {
    return whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}` : null;
  }

  btnWa.addEventListener("click", () => {
    const url = waUrl(waText(null, null));
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });

  doneWa.addEventListener("click", () => {
    if (lastWaUrl) window.open(lastWaUrl, "_blank", "noopener,noreferrer");
  });

  doneRetry.addEventListener("click", () => {
    if (retryUrl) window.location.href = retryUrl;
  });

  function showDone(opts) {
    doneMark.textContent = opts.mark || "✓";
    doneMark.className = `done-mark${opts.tone ? ` ${opts.tone}` : ""}`;
    doneTitle.textContent = opts.title;
    doneText.textContent = opts.text;
    doneCode.textContent = opts.code ? `#${opts.code}` : "";
    doneCode.parentElement.hidden = !opts.code;
    retryUrl = opts.retryUrl || null;
    doneRetry.hidden = !retryUrl;
    doneWa.hidden = !lastWaUrl;
    done.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function readPayMemo() {
    try {
      const raw = sessionStorage.getItem(PAY_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Al volver de Mercado Pago: el estado real sale del servidor, no de la dirección. */
  async function showPaymentResult(orderId) {
    const memo = readPayMemo();
    const mine = memo && memo.id === orderId ? memo : null;
    if (mine && mine.wa) lastWaUrl = mine.wa;
    const paymentId = params.get("payment_id") || params.get("collection_id") || "";
    const clean = new URL(window.location.href);
    for (const k of [...clean.searchParams.keys()]) {
      if (k !== "t" && k !== "slug") clean.searchParams.delete(k);
    }
    window.history.replaceState(null, "", clean.pathname + clean.search);

    let data = null;
    try {
      const q = new URLSearchParams({ id: orderId });
      if (/^\d{1,20}$/.test(paymentId)) q.set("payment_id", paymentId);
      const res = await fetch(`${API}/v1/menu-portal/order/status?${q.toString()}`, { cache: "no-store" });
      data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) data = null;
    } catch {
      data = null;
    }
    if (!data) {
      showDone({
        mark: "!",
        tone: "is-wait",
        title: "No pudimos ver tu pago",
        text: "Si pagaste, el local lo va a ver en un rato. Ante cualquier duda, escribile.",
        code: mine ? mine.code : "",
      });
      return;
    }
    const st = data.payment_status;
    if (st === "approved" || st === "review") {
      try {
        sessionStorage.removeItem(PAY_KEY);
      } catch {
        /* ok */
      }
      showDone({
        title: "¡Pago aprobado!",
        text:
          st === "approved"
            ? `Pagaste ${money(data.total)}. Tu pedido ya le llegó al local como pagado.`
            : "Recibimos tu pago. El local lo va a revisar y te escribe.",
        code: data.code,
      });
    } else if (st === "pending") {
      showDone({
        mark: "…",
        tone: "is-wait",
        title: "Tu pago está en proceso",
        text: "Cuando Mercado Pago lo apruebe, el local lo ve como pagado. No hace falta que pagues de nuevo.",
        code: data.code,
      });
    } else {
      showDone({
        mark: "×",
        tone: "is-bad",
        title: "El pago no se completó",
        text: data.pay_url
          ? "No se cobró nada. Podés intentar de nuevo o escribirle al local."
          : "No se cobró nada. Escribile al local para coordinar el pago.",
        code: data.code,
        retryUrl: data.pay_url || null,
      });
    }
  }

  function showFormError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
    formError.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  orderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    formError.hidden = true;
    const customer = {
      name: fName.value.trim(),
      phone: fPhone.value.trim(),
      fulfillment: selectedFulfillment(),
      address: fAddress.value.trim(),
      note: fNote.value.trim(),
    };
    if (customer.name.length < 2) return showFormError("Escribí tu nombre.");
    if (customer.phone.replace(/\D/g, "").length < 8) {
      return showFormError("Escribí tu WhatsApp con característica (ej. 11 2345 6789).");
    }
    if (customer.fulfillment === "delivery" && customer.address.length < 4) {
      return showFormError("Escribí la dirección de entrega.");
    }
    if (lines.length === 0) return showFormError("Tu pedido está vacío.");

    const pay = selectedPay();
    sending = true;
    btnSend.disabled = true;
    btnSend.textContent = pay === "mercadopago" ? "Abriendo Mercado Pago…" : "Enviando…";
    let leaving = false;
    try {
      const res = await fetch(`${API}/v1/menu-portal/order`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          name: customer.name,
          phone: customer.phone,
          fulfillment: customer.fulfillment,
          address: customer.fulfillment === "delivery" ? customer.address : "",
          note: customer.note,
          website: fWebsite.value,
          pay,
          items: lines.map((l) => ({ id: l.id, qty: l.qty, cook: l.cook, name: productById(l.id)?.name })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (data.error === "no_stock" && Array.isArray(data.items)) {
          const out = new Set(data.items.map(fold));
          for (const p of products) if (out.has(fold(p.name))) p.available = false;
          renderMenu();
          renderCheckout();
        }
        if (data.error === "mp_unavailable") {
          store.pay_online = false;
          renderCheckout();
        }
        showFormError(data.message || "No se pudo enviar el pedido. Probá de nuevo en un momento.");
        return;
      }
      writeJson(CUSTOMER_KEY, { name: customer.name, phone: customer.phone, address: customer.address });
      const code = data.order && data.order.code ? data.order.code : "";
      lastWaUrl = waUrl(waText(code, customer));
      const payUrl = typeof data.pay_url === "string" && data.pay_url.startsWith("https://") ? data.pay_url : null;
      lines = [];
      saveCart();
      fNote.value = "";
      if (payUrl && data.order && data.order.id) {
        try {
          sessionStorage.setItem(PAY_KEY, JSON.stringify({ id: data.order.id, code, wa: lastWaUrl }));
        } catch {
          /* modo privado */
        }
        leaving = true;
        window.location.href = payUrl;
        return;
      }
      renderMenu();
      renderCartBar();
      closeSheet(checkout);
      showDone({
        title: "¡Listo!",
        text: "Tu pedido llegó al local. Te van a escribir para confirmarlo.",
        code,
      });
      if (lastWaUrl) window.open(lastWaUrl, "_blank", "noopener,noreferrer");
    } catch {
      showFormError("No se pudo enviar. Revisá tu conexión e intentá de nuevo.");
    } finally {
      if (!leaving) {
        sending = false;
        renderCheckout();
      }
    }
  });

  /* ---------- Carga ---------- */

  async function load() {
    if (!slug) {
      statusEl.textContent = "Falta el nombre del local en el enlace.";
      return;
    }
    try {
      const res = DEMO ? null : await fetch(`${API}/v1/menu-portal/info?slug=${encodeURIComponent(slug)}`);
      const data = DEMO ? DEMO.info : await res.json().catch(() => ({}));
      if (res && (!res.ok || !data.ok)) {
        statusEl.textContent =
          res.status === 404 && prettySlug
            ? "Esta página no existe. Pedile el enlace de nuevo al local."
            : data.message || "Tienda no encontrada. Pedile al local que la publique desde WalQo.";
        bizLead.textContent = "";
        return;
      }
      businessName = data.business_name || "Mi local";
      currency = data.currency || "$";
      whatsapp = data.whatsapp || null;
      products = Array.isArray(data.products) ? data.products : [];
      if (data.store && typeof data.store === "object") store = { ...store, ...data.store };
      applyTheme();
      renderHero(data.logo_data_url);
      const saved = readJson(CART_KEY, []);
      lines = Array.isArray(saved)
        ? saved.filter((l) => {
            const p = l && productById(l.id);
            return p && isAvailable(p) && Number.isInteger(l.qty) && l.qty > 0;
          })
        : [];
      saveCart();
      statusEl.hidden = true;
      toolbar.hidden = products.length === 0;
      renderNav();
      renderMenu();
      renderCartBar();
      const returning = (params.get("pedido") || "").trim().toLowerCase();
      if (/^[0-9a-f-]{36}$/.test(returning)) void showPaymentResult(returning);
      else {
        const shared = /^#p(\d{1,10})$/.exec(window.location.hash);
        if (shared && productById(Number(shared[1]))) openDetail(Number(shared[1]), false);
      }
    } catch {
      statusEl.textContent = "No se pudo cargar la tienda. Revisá tu conexión.";
    }
  }

  window.addEventListener("hashchange", () => {
    const m = /^#p(\d{1,10})$/.exec(window.location.hash);
    if (m && productById(Number(m[1])) && Number(m[1]) !== detailId) openDetail(Number(m[1]), false);
  });

  window.addEventListener("pageshow", (e) => {
    if (e.persisted && sending) {
      sending = false;
      renderCheckout();
    }
  });

  void load();
})();
