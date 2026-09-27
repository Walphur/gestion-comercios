(() => {
  const API = (
    window.WALQO_LICENSE_API_URL ||
    "https://gestion-comercios-license.walphur.workers.dev"
  ).replace(/\/$/, "");

  const params = new URLSearchParams(window.location.search);
  const slug = (params.get("t") || params.get("slug") || "").trim().toLowerCase();

  const bizName = document.getElementById("biz-name");
  const bizLogo = document.getElementById("biz-logo");
  const bizLead = document.getElementById("biz-lead");
  const statusEl = document.getElementById("status");
  const catNav = document.getElementById("cat-nav");
  const menuBody = document.getElementById("menu-body");
  const cartEl = document.getElementById("cart");
  const cartLines = document.getElementById("cart-lines");
  const cartCount = document.getElementById("cart-count");
  const cartTotal = document.getElementById("cart-total");
  const btnWa = document.getElementById("btn-wa");
  const waHint = document.getElementById("wa-hint");

  /** @type {{ id:number, name:string, price:number, category:string|null, description:string|null, is_daily_menu:boolean, image_data_url?:string|null }[]} */
  let products = [];
  let currency = "$";
  let whatsapp = null;
  let businessName = "Mi local";
  /** @type {{ key:string, id:number, qty:number, cook:string|null }[]} */
  let lines = [];
  let activeCat = "all";
  /** @type {number|null} */
  let cookForId = null;

  function fold(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function isEmpanada(p) {
    return fold(p.category).includes("empanada") || fold(p.name).includes("empanada");
  }

  const cookModal = document.getElementById("cook-modal");
  const cookTitle = document.getElementById("cook-title");
  const cookCancel = document.getElementById("cook-cancel");

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    const v = Number(n) || 0;
    const prefix = currency === "$" || !currency ? "$" : currency;
    try {
      return `${prefix} ${new Intl.NumberFormat("es-AR", {
        maximumFractionDigits: 0,
      }).format(v)}`;
    } catch {
      return `${prefix} ${Math.round(v)}`;
    }
  }

  function showLogo(url) {
    if (!bizLogo) return;
    if (url) {
      bizLogo.src = url;
      bizLogo.hidden = false;
    } else {
      bizLogo.hidden = true;
      bizLogo.removeAttribute("src");
    }
  }

  function categories() {
    const set = new Set();
    for (const p of products) {
      if (p.is_daily_menu) set.add("Menú del día");
      else if (p.category) set.add(p.category);
      else set.add("Otros");
    }
    return ["all", ...Array.from(set)];
  }

  function catOf(p) {
    if (p.is_daily_menu) return "Menú del día";
    return p.category || "Otros";
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
        return `<button type="button" class="${active}" data-cat="${escapeHtml(c)}">${label}</button>`;
      })
      .join("");
    catNav.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeCat = btn.getAttribute("data-cat") || "all";
        renderMenu();
        renderNav();
      });
    });
  }

  function renderMenu() {
    const groups = new Map();
    for (const p of products) {
      const cat = catOf(p);
      if (activeCat !== "all" && cat !== activeCat) continue;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(p);
    }
    if (groups.size === 0) {
      menuBody.hidden = false;
      menuBody.innerHTML = `<p class="status">No hay productos publicados todavía.</p>`;
      return;
    }
    menuBody.hidden = false;
    let html = "";
    for (const [cat, items] of groups) {
      html += `<section class="menu-section"><h2>${escapeHtml(cat)}</h2><div class="product-grid">`;
      for (const p of items) {
        const initial = escapeHtml((p.name || "?").trim().charAt(0).toUpperCase() || "?");
        const photo = p.image_data_url
          ? `<div class="product-photo"><img src="${escapeHtml(p.image_data_url)}" alt="" loading="lazy" /></div>`
          : `<div class="product-photo product-photo--empty" aria-hidden="true">${initial}</div>`;
        html += `<article class="product">
          ${photo}
          <div class="product-body min-w-0">
            <p class="product-name">${escapeHtml(p.name)}</p>
            ${p.description ? `<p class="product-desc">${escapeHtml(p.description)}</p>` : ""}
            ${p.is_daily_menu ? `<span class="badge">Menú del día</span>` : ""}
            <div class="product-foot">
              <div class="price">${escapeHtml(money(p.price))}</div>
              <button type="button" class="btn-add" data-id="${p.id}">Agregar</button>
            </div>
          </div>
        </article>`;
      }
      html += `</div></section>`;
    }
    menuBody.innerHTML = html;
    menuBody.querySelectorAll(".btn-add").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-id"));
        const p = products.find((x) => x.id === id);
        if (p && isEmpanada(p)) {
          cookForId = id;
          if (cookTitle) cookTitle.textContent = `${p.name}: ¿frita o al horno?`;
          if (cookModal) cookModal.hidden = false;
          return;
        }
        addLine(id, null);
      });
    });
  }

  function addLine(id, cook) {
    const key = `${id}|${cook || ""}`;
    const found = lines.find((l) => l.key === key);
    if (found) found.qty += 1;
    else lines.push({ key, id, qty: 1, cook });
    renderCart();
  }

  function closeCook() {
    cookForId = null;
    if (cookModal) cookModal.hidden = true;
  }

  if (cookModal) {
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
  }
  if (cookCancel) cookCancel.addEventListener("click", closeCook);

  function renderCart() {
    const entries = lines.filter((l) => l.qty > 0);
    if (entries.length === 0) {
      cartEl.hidden = true;
      return;
    }
    cartEl.hidden = false;
    let total = 0;
    let count = 0;
    cartLines.innerHTML = entries
      .map((line) => {
        const p = products.find((x) => x.id === line.id);
        if (!p) return "";
        total += p.price * line.qty;
        count += line.qty;
        const label = line.cook ? `${p.name} (${line.cook})` : p.name;
        return `<li>
          <span>${escapeHtml(label)}</span>
          <span>×${line.qty}</span>
          <span>
            <button type="button" class="qty-btn" data-key="${escapeHtml(line.key)}" data-d="-1">−</button>
            <button type="button" class="qty-btn" data-key="${escapeHtml(line.key)}" data-d="1">+</button>
          </span>
        </li>`;
      })
      .join("");
    cartCount.textContent = String(count);
    cartTotal.textContent = money(total);
    btnWa.disabled = !whatsapp || entries.length === 0;
    waHint.hidden = Boolean(whatsapp);

    cartLines.querySelectorAll(".qty-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-key") || "";
        const d = Number(btn.getAttribute("data-d"));
        const line = lines.find((l) => l.key === key);
        if (!line) return;
        line.qty += d;
        if (line.qty <= 0) lines = lines.filter((l) => l.key !== key);
        renderCart();
      });
    });
  }

  function buildWhatsAppText() {
    const textLines = [];
    textLines.push(`Hola! Quiero pedir en *${businessName}*:`);
    textLines.push("");
    let total = 0;
    for (const line of lines) {
      const p = products.find((x) => x.id === line.id);
      if (!p || line.qty <= 0) continue;
      total += p.price * line.qty;
      const label = line.cook ? `${p.name} (${line.cook})` : p.name;
      textLines.push(`• ${label} × ${line.qty} — ${money(p.price * line.qty)}`);
    }
    textLines.push("");
    textLines.push(`Total: *${money(total)}*`);
    textLines.push("");
    textLines.push("Gracias!");
    return textLines.join("\n");
  }

  btnWa.addEventListener("click", () => {
    if (!whatsapp) return;
    const text = encodeURIComponent(buildWhatsAppText());
    const url = `https://wa.me/${whatsapp}?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  });

  async function load() {
    if (!slug) {
      statusEl.textContent = "Falta el código del local en el enlace (ej. ?t=mi-resto).";
      return;
    }
    try {
      const res = await fetch(`${API}/v1/menu-portal/info?slug=${encodeURIComponent(slug)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        statusEl.textContent =
          data.message || "Carta no encontrada. Pedile al local que la publique desde WalQo.";
        return;
      }
      businessName = data.business_name || "Mi local";
      currency = data.currency || "$";
      whatsapp = data.whatsapp || null;
      products = Array.isArray(data.products) ? data.products : [];
      document.title = `${businessName} · Carta`;
      bizName.textContent = businessName;
      showLogo(data.logo_data_url);
      bizLead.textContent = whatsapp
        ? "Elegí lo que querés y pedí por WhatsApp"
        : "Mirás productos y precios (WhatsApp del local aún no configurado)";
      statusEl.hidden = true;
      renderNav();
      renderMenu();
      renderCart();
    } catch {
      statusEl.textContent = "No se pudo cargar la carta. Revisá tu conexión.";
    }
  }

  void load();
})();
