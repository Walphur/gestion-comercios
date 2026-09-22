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

  /** @type {{ id:number, name:string, price:number, category:string|null, description:string|null, is_daily_menu:boolean }[]} */
  let products = [];
  let currency = "$";
  let whatsapp = null;
  let businessName = "Mi local";
  /** @type {Map<number, number>} */
  const cart = new Map();
  let activeCat = "all";

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
      html += `<section class="menu-section"><h2>${escapeHtml(cat)}</h2>`;
      for (const p of items) {
        html += `<article class="product">
          <div class="min-w-0">
            <p class="product-name">${escapeHtml(p.name)}</p>
            ${p.description ? `<p class="product-desc">${escapeHtml(p.description)}</p>` : ""}
            ${p.is_daily_menu ? `<span class="badge">Menú del día</span>` : ""}
          </div>
          <div class="product-side">
            <div class="price">${escapeHtml(money(p.price))}</div>
            <button type="button" class="btn-add" data-id="${p.id}">Agregar</button>
          </div>
        </article>`;
      }
      html += `</section>`;
    }
    menuBody.innerHTML = html;
    menuBody.querySelectorAll(".btn-add").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-id"));
        cart.set(id, (cart.get(id) || 0) + 1);
        renderCart();
      });
    });
  }

  function renderCart() {
    const entries = Array.from(cart.entries()).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      cartEl.hidden = true;
      return;
    }
    cartEl.hidden = false;
    let total = 0;
    let count = 0;
    cartLines.innerHTML = entries
      .map(([id, qty]) => {
        const p = products.find((x) => x.id === id);
        if (!p) return "";
        total += p.price * qty;
        count += qty;
        return `<li>
          <span>${escapeHtml(p.name)}</span>
          <span>×${qty}</span>
          <span>
            <button type="button" class="qty-btn" data-id="${id}" data-d="-1">−</button>
            <button type="button" class="qty-btn" data-id="${id}" data-d="1">+</button>
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
        const id = Number(btn.getAttribute("data-id"));
        const d = Number(btn.getAttribute("data-d"));
        const next = (cart.get(id) || 0) + d;
        if (next <= 0) cart.delete(id);
        else cart.set(id, next);
        renderCart();
      });
    });
  }

  function buildWhatsAppText() {
    const lines = [];
    lines.push(`Hola! Quiero pedir en *${businessName}*:`);
    lines.push("");
    let total = 0;
    for (const [id, qty] of cart.entries()) {
      const p = products.find((x) => x.id === id);
      if (!p || qty <= 0) continue;
      total += p.price * qty;
      lines.push(`• ${p.name} × ${qty} — ${money(p.price * qty)}`);
    }
    lines.push("");
    lines.push(`Total: *${money(total)}*`);
    lines.push("");
    lines.push("Gracias!");
    return lines.join("\n");
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
