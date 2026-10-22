(() => {
  const API = (window.WALQO_LICENSE_API_URL || "https://gestion-comercios-license.walphur.workers.dev").replace(/\/+$/, "");
  const TOKEN_KEY = "walqo_mozo_token";
  const OUTBOX_KEY = "walqo_mozo_outbox";
  const LOCAL_KEY = "walqo_mozo_local";
  const CARTS_KEY = "walqo_mozo_carts";
  const MENU_KEY = "walqo_mozo_menu";
  const PC_STALE_MS = 90_000;
  const MENU_MAX_AGE_MS = 10 * 60_000;
  const POLL_FAST_MS = 3_000;
  const POLL_MS = 10_000;
  const POLL_IDLE_MS = 30_000;

  const $ = (id) => document.getElementById(id);
  const el = {
    status: $("status"),
    topBiz: $("top-biz"),
    topTitle: $("top-title"),
    connPill: $("conn-pill"),
    connBanner: $("conn-banner"),
    btnOpts: $("btn-opts"),
    unlinked: $("view-unlinked"),
    unlinkedTitle: $("unlinked-title"),
    unlinkedText: $("unlinked-text"),
    vTables: $("view-tables"),
    vTable: $("view-table"),
    vMenu: $("view-menu"),
    vOrders: $("view-orders"),
    summary: $("tables-summary"),
    zoneNav: $("zone-nav"),
    grid: $("tables-grid"),
    tTitle: $("t-title"),
    tState: $("t-state"),
    tMeta: $("t-meta"),
    tCalls: $("t-calls"),
    tCallsText: $("t-calls-text"),
    tOpen: $("t-open"),
    guestsValue: $("guests-value"),
    tInflight: $("t-inflight"),
    tItems: $("t-items"),
    btnAdd: $("btn-add"),
    btnPrebill: $("btn-prebill"),
    btnOpen: $("btn-open"),
    btnAttend: $("btn-attend"),
    search: $("search"),
    catNav: $("cat-nav"),
    menuList: $("menu-list"),
    ordersList: $("orders-list"),
    ordersBadge: $("orders-badge"),
    cartBar: $("cart-bar"),
    cartCount: $("cart-count"),
    cartLabel: $("cart-label"),
    cartTotal: $("cart-total"),
    tabs: $("tabs"),
    sheet: $("sheet"),
    sheetTitle: $("sheet-title"),
    cartLines: $("cart-lines"),
    cartNote: $("cart-note"),
    sheetTotal: $("sheet-total"),
    btnSend: $("btn-send"),
    cook: $("cook"),
    cookTitle: $("cook-title"),
    opts: $("opts"),
    optsWho: $("opts-who"),
    toast: $("toast"),
  };

  const S = {
    token: null,
    data: null,
    menu: null,
    netError: false,
    view: "tables",
    tableNo: null,
    zone: "",
    cat: "",
    search: "",
    guests: 2,
    carts: {},
    cookFor: null,
    fastPolls: 0,
    timer: null,
    loading: false,
  };

  /* ---------- Utilidades ---------- */

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

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function fold(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function money(n) {
    const cur = S.menu?.currency && S.menu.currency !== "$" ? S.menu.currency : "$";
    const v = Number(n) || 0;
    try {
      return `${cur} ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(v)}`;
    } catch {
      return `${cur} ${Math.round(v)}`;
    }
  }

  function qtyText(q) {
    const n = Number(q) || 0;
    return Number.isInteger(n) ? String(n) : n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
  }

  function hhmm(iso) {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "";
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.toast.hidden = true), 3200);
  }

  function hexToRgb(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function applyTheme(color) {
    const rgb = hexToRgb(color);
    if (!rgb) return;
    const root = document.documentElement.style;
    root.setProperty("--accent", color);
    root.setProperty("--accent-soft", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`);
    const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    root.setProperty("--accent-ink", lum > 0.65 ? "#18181b" : "#ffffff");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  }

  function syncTopHeight() {
    const h = document.querySelector(".top")?.getBoundingClientRect().height || 64;
    document.documentElement.style.setProperty("--top-h", `${Math.round(h)}px`);
  }

  /* ---------- Servidor ---------- */

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  async function api(path, body) {
    let res;
    try {
      res = await fetch(`${API}/v1/menu-portal/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${S.token}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
    } catch {
      throw new ApiError("Sin conexión.", 0, "network");
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (res.status === 401) {
      unlink(data?.message);
      throw new ApiError(data?.message || "Este celular no está vinculado.", 401, "unlinked");
    }
    if (!res.ok || !data?.ok) {
      throw new ApiError(data?.message || "No se pudo conectar. Probá de nuevo.", res.status, data?.error);
    }
    return data;
  }

  function unlink(message) {
    S.token = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(OUTBOX_KEY);
    localStorage.removeItem(LOCAL_KEY);
    localStorage.removeItem(CARTS_KEY);
    localStorage.removeItem(MENU_KEY);
    S.data = null;
    S.menu = null;
    clearTimeout(S.timer);
    if (message) el.unlinkedTitle.textContent = message;
    showView("unlinked");
  }

  /* ---------- Comandas (se guardan hasta que el servidor las acepta) ---------- */

  function outbox() {
    return readJson(OUTBOX_KEY, []);
  }

  /** Comandas que el servidor rechazó (no se reintentan). */
  function localFailed() {
    return readJson(LOCAL_KEY, []);
  }

  async function flushOutbox() {
    let list = outbox();
    for (const entry of list) {
      try {
        await api("waiter/command", entry.cmd);
        list = outbox().filter((e) => e.cmd.id !== entry.cmd.id);
        writeJson(OUTBOX_KEY, list);
        S.fastPolls = 4;
      } catch (e) {
        if (e.code === "network" || e.status === 429 || e.status >= 500 || e.status === 401) {
          S.netError = e.code === "network";
          break;
        }
        writeJson(OUTBOX_KEY, outbox().filter((x) => x.cmd.id !== entry.cmd.id));
        writeJson(LOCAL_KEY, [{ ...entry, error: e.message, at: new Date().toISOString() }, ...localFailed()].slice(0, 20));
        toast(e.message);
      }
    }
  }

  async function sendCommand(kind, extra, summary) {
    const cmd = { id: uuid(), kind, table: S.tableNo, ...extra };
    writeJson(OUTBOX_KEY, [...outbox(), { cmd, items: summary || [], created_at: new Date().toISOString() }]);
    renderAll();
    await flushOutbox();
    S.fastPolls = 4;
    await refresh();
  }

  /* ---------- Carga ---------- */

  async function loadMenu(force) {
    const cached = readJson(MENU_KEY, null);
    if (!force && cached && Date.now() - cached.at < MENU_MAX_AGE_MS) {
      S.menu = cached.menu;
      applyTheme(S.menu.color);
      return;
    }
    try {
      const menu = await api("waiter/menu");
      S.menu = { currency: menu.currency, color: menu.color, products: menu.products || [] };
      writeJson(MENU_KEY, { at: Date.now(), menu: S.menu });
      applyTheme(S.menu.color);
    } catch (e) {
      if (cached) S.menu = cached.menu;
      if (force || !cached) toast(e.message);
    }
  }

  function nextDelay() {
    if (S.fastPolls > 0) {
      S.fastPolls -= 1;
      return POLL_FAST_MS;
    }
    const waiting = outbox().length > 0 || myCommands().some((c) => c.status === "sent" || c.status === "received");
    return waiting || S.view !== "menu" ? POLL_MS : POLL_IDLE_MS;
  }

  function schedule() {
    clearTimeout(S.timer);
    if (!S.token || document.hidden) return;
    S.timer = setTimeout(() => void refresh(), nextDelay());
  }

  async function refresh() {
    if (!S.token || S.loading) return;
    S.loading = true;
    try {
      if (outbox().length) await flushOutbox();
      const data = await api("waiter/state");
      S.data = data;
      S.netError = false;
    } catch (e) {
      if (e.code === "network") S.netError = true;
      else if (e.status !== 401 && !S.data) el.status.textContent = e.message;
    } finally {
      S.loading = false;
    }
    if (!S.token) return;
    renderAll();
    schedule();
  }

  /* ---------- Estado de mesas ---------- */

  function tables() {
    return S.data?.tables || [];
  }

  function tableByNo(n) {
    return tables().find((t) => t.number === n) || null;
  }

  function tableLabel(t) {
    return t?.name || `Mesa ${t?.number ?? ""}`;
  }

  function stateOf(t) {
    if (t.calls?.includes("waiter")) return "call";
    if (t.state === "bill" || t.calls?.includes("bill")) return "bill";
    return t.state === "busy" ? "busy" : "free";
  }

  const STATE_TEXT = { free: "Libre", busy: "Ocupada", bill: "Pidió la cuenta", call: "Llama al mozo" };

  function pcAge() {
    if (!S.data?.pc?.seen_at) return Infinity;
    const now = Date.parse(S.data.now) || Date.now();
    return now - Date.parse(S.data.pc.seen_at);
  }

  function myCommands() {
    const server = S.data?.commands || [];
    const seen = new Set(server.map((c) => c.id));
    const pending = outbox()
      .filter((e) => !seen.has(e.cmd.id))
      .map((e) => ({
        id: e.cmd.id,
        table_number: e.cmd.table,
        kind: e.cmd.kind,
        status: "outbox",
        items: e.items,
        created_at: e.created_at,
      }));
    const failed = localFailed().map((e) => ({
      id: e.cmd.id,
      table_number: e.cmd.table,
      kind: e.cmd.kind,
      status: "failed",
      note: e.error,
      items: e.items,
      created_at: e.created_at,
    }));
    return [...pending, ...server, ...failed].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  /* ---------- Vistas ---------- */

  function showView(view) {
    S.view = view;
    el.unlinked.hidden = view !== "unlinked";
    el.vTables.hidden = view !== "tables";
    el.vTable.hidden = view !== "table";
    el.vMenu.hidden = view !== "menu";
    el.vOrders.hidden = view !== "orders";
    el.tabs.hidden = view === "unlinked";
    el.btnOpts.hidden = view === "unlinked";
    el.status.hidden = view === "unlinked" || Boolean(S.data);
    for (const b of el.tabs.querySelectorAll("button")) {
      b.classList.toggle("active", b.dataset.tab === (view === "orders" ? "orders" : "tables"));
    }
    if (view === "unlinked") {
      el.connPill.hidden = true;
      el.connBanner.hidden = true;
      el.cartBar.hidden = true;
      el.topTitle.textContent = "Mozo";
    }
    renderAll();
    window.scrollTo(0, 0);
  }

  function renderConn() {
    if (!S.token) return;
    const age = pcAge();
    let banner = "";
    let err = false;
    if (S.netError) {
      banner = "Sin señal. Lo que mandes queda guardado y sale solo cuando vuelva la conexión.";
      err = true;
    } else if (S.data && !S.data.pc) {
      banner = "La caja todavía no se conectó. Pedí que abran WalQo en la computadora.";
    } else if (S.data && age > PC_STALE_MS) {
      const min = Math.max(1, Math.round(age / 60_000));
      banner = `La caja no responde hace ${min} min: WalQo está cerrado o sin internet. Las comandas quedan guardadas y entran cuando vuelva.`;
    }
    el.connBanner.textContent = banner;
    el.connBanner.hidden = !banner;
    el.connBanner.classList.toggle("err", err);
    el.connPill.hidden = !S.data;
    const ok = !banner;
    el.connPill.textContent = ok ? "Caja conectada" : "Sin caja";
    el.connPill.classList.toggle("off", !ok);
    syncTopHeight();
  }

  function renderTables() {
    const list = tables();
    const zones = [...new Set(list.map((t) => t.zone).filter(Boolean))];
    if (S.zone && !zones.includes(S.zone)) S.zone = "";
    el.zoneNav.hidden = zones.length < 2;
    el.zoneNav.innerHTML = zones.length < 2
      ? ""
      : ["", ...zones]
          .map((z) => `<button type="button" data-zone="${esc(z)}" class="${S.zone === z ? "active" : ""}">${esc(z || "Todas")}</button>`)
          .join("");
    const shown = S.zone ? list.filter((t) => t.zone === S.zone) : list;
    const counts = { free: 0, busy: 0, bill: 0, call: 0 };
    for (const t of list) counts[stateOf(t)] += 1;
    el.summary.innerHTML = list.length
      ? `<strong>${counts.free}</strong> libres · <strong>${counts.busy + counts.bill + counts.call}</strong> ocupadas` +
        (counts.call ? ` · <strong>${counts.call}</strong> llaman` : "") +
        (counts.bill ? ` · <strong>${counts.bill}</strong> piden la cuenta` : "")
      : "";
    if (!S.data) {
      el.grid.innerHTML = "";
      return;
    }
    if (list.length === 0) {
      el.grid.innerHTML = `<p class="empty">Todavía no hay mesas. Se cargan en WalQo, en «Mesas».</p>`;
      return;
    }
    el.grid.innerHTML = shown
      .map((t) => {
        const s = stateOf(t);
        const badge = t.calls?.includes("waiter") ? "Mozo" : t.calls?.includes("bill") ? "Cuenta" : "";
        const meta = [t.guests ? `${t.guests} pers.` : "", t.waiter || ""].filter(Boolean).join(" · ");
        return `<button type="button" class="tcard ${s}" data-table="${t.number}">
          ${badge ? `<span class="tcard-badge">${badge}</span>` : ""}
          <span class="tcard-name">${esc(tableLabel(t))}</span>
          ${t.zone ? `<span class="tcard-zone">${esc(t.zone)}</span>` : ""}
          <span class="tcard-state">${STATE_TEXT[s]}</span>
          ${t.state !== "free" ? `<span class="tcard-total">${esc(money(t.total))}</span>` : ""}
          ${meta ? `<span class="tcard-meta">${esc(meta)}</span>` : ""}
        </button>`;
      })
      .join("");
  }

  function itemGroup(title, items) {
    if (!items.length) return "";
    return `<h3>${esc(title)}</h3><ul class="item-list">${items
      .map(
        (i) => `<li><span class="item-qty">${esc(qtyText(i.qty))}</span>
          <span class="item-name">${esc(i.label)}${i.note ? `<span class="item-note">${esc(i.note)}</span>` : ""}</span>
          <span class="item-price">${esc(money(i.total))}</span></li>`,
      )
      .join("")}</ul>`;
  }

  function renderTable() {
    const t = tableByNo(S.tableNo);
    if (!t) {
      el.tTitle.textContent = `Mesa ${S.tableNo ?? ""}`;
      el.tState.textContent = "";
      el.tMeta.textContent = S.data ? "Esta mesa ya no está en el salón." : "";
      el.tItems.innerHTML = "";
      el.tOpen.hidden = true;
      el.tCalls.hidden = true;
      el.btnAdd.disabled = true;
      el.btnPrebill.disabled = true;
      return;
    }
    const s = stateOf(t);
    el.tTitle.textContent = tableLabel(t);
    el.tState.textContent = STATE_TEXT[s];
    el.tState.className = `state-pill ${s}`;
    const meta = [];
    if (t.zone) meta.push(t.zone);
    if (t.guests) meta.push(`${t.guests} comensales`);
    if (t.waiter) meta.push(`Mozo: ${t.waiter}`);
    if (t.opened_at) meta.push(`Abierta ${hhmm(t.opened_at.replace(" ", "T"))}`);
    el.tMeta.textContent = meta.join(" · ");
    el.tMeta.hidden = meta.length === 0;

    const calls = t.calls || [];
    el.tCalls.hidden = calls.length === 0;
    el.tCallsText.textContent = calls.map((c) => (c === "bill" ? "Pide la cuenta" : "Llama al mozo")).join(" · ");

    const free = t.state === "free";
    el.tOpen.hidden = !free;
    el.guestsValue.textContent = String(S.guests);
    el.btnAdd.disabled = false;
    el.btnPrebill.disabled = free || !t.items?.length;

    const inflight = myCommands().filter(
      (c) => c.table_number === t.number && (c.status === "outbox" || c.status === "sent"),
    );
    el.tInflight.hidden = inflight.length === 0;
    el.tInflight.textContent =
      inflight.length === 1 ? "Tenés 1 comanda en camino a la caja." : `Tenés ${inflight.length} comandas en camino a la caja.`;

    const items = t.items || [];
    if (free) {
      el.tItems.innerHTML = `<p class="empty">Mesa libre. Abrila o cargá el pedido directo.</p>`;
      return;
    }
    el.tItems.innerHTML =
      (items.length === 0 ? `<p class="empty">Todavía no pidieron nada.</p>` : "") +
      itemGroup("En cocina", items.filter((i) => i.status === "sent")) +
      itemGroup("Cargado en la caja, sin mandar", items.filter((i) => i.status === "new")) +
      itemGroup("Pidieron por el QR, sin confirmar", items.filter((i) => i.status === "pending")) +
      `<p class="total-row"><span>Total</span><strong>${esc(money(t.total))}</strong></p>`;
  }

  function cart() {
    return S.carts[S.tableNo] || [];
  }

  function saveCart(lines) {
    if (lines.length) S.carts[S.tableNo] = lines;
    else delete S.carts[S.tableNo];
    writeJson(CARTS_KEY, S.carts);
  }

  function lineKey(id, cook) {
    return `${id}|${cook || ""}`;
  }

  function cartQtyFor(id) {
    return cart().filter((l) => l.id === id).reduce((a, l) => a + l.qty, 0);
  }

  function isEmpanada(p) {
    return fold(p.category).includes("empanada") || fold(p.name).includes("empanada");
  }

  function renderMenu() {
    const products = S.menu?.products || [];
    if (!S.menu) {
      el.menuList.innerHTML = `<p class="empty">Cargando la carta…</p>`;
      el.catNav.innerHTML = "";
      return;
    }
    const catOf = (p) => (p.is_daily_menu ? "Menú del día" : p.category || "Otros");
    const cats = [...new Set(products.map(catOf))];
    if (S.cat && !cats.includes(S.cat)) S.cat = "";
    el.catNav.hidden = cats.length < 2;
    el.catNav.innerHTML = ["", ...cats]
      .map((c) => `<button type="button" data-cat="${esc(c)}" class="${S.cat === c ? "active" : ""}">${esc(c || "Todo")}</button>`)
      .join("");
    const q = fold(S.search.trim());
    const list = products.filter(
      (p) => (!S.cat || catOf(p) === S.cat) && (!q || fold(p.name).includes(q) || fold(p.description).includes(q)),
    );
    if (list.length === 0) {
      el.menuList.innerHTML = `<p class="empty">${products.length ? "No hay nada con esa búsqueda." : "La carta está vacía."}</p>`;
      return;
    }
    const groups = new Map();
    for (const p of list) {
      const c = catOf(p);
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(p);
    }
    el.menuList.innerHTML = [...groups]
      .map(
        ([c, ps]) => `<section class="menu-section"><h3>${esc(c)}</h3>${ps
          .map((p) => {
            const n = cartQtyFor(p.id);
            const out = p.available === false;
            return `<div class="prow ${out ? "is-out" : ""}" data-pid="${p.id}">
              <div style="min-width:0">
                <p class="prow-name">${esc(p.name)}${n ? `<span class="prow-qty">${n}</span>` : ""}</p>
                ${p.description ? `<p class="prow-desc">${esc(p.description)}</p>` : ""}
                <p class="prow-price">${esc(money(p.price))} ${out ? `<span class="prow-out">· Sin stock</span>` : ""}</p>
              </div>
              <button type="button" class="btn-plus" data-add="${p.id}" aria-label="Sumar ${esc(p.name)}" ${out ? "disabled" : ""}>+</button>
            </div>`;
          })
          .join("")}</section>`,
      )
      .join("");
  }

  function cartTotal(lines) {
    return lines.reduce((a, l) => a + l.price * l.qty, 0);
  }

  function renderCartBar() {
    const lines = cart();
    const show = (S.view === "menu" || S.view === "table") && lines.length > 0;
    el.cartBar.hidden = !show;
    if (!show) return;
    const n = lines.reduce((a, l) => a + l.qty, 0);
    el.cartCount.textContent = String(n);
    el.cartLabel.textContent = "Ver comanda";
    el.cartTotal.textContent = money(cartTotal(lines));
  }

  function renderSheet() {
    const lines = cart();
    const t = tableByNo(S.tableNo);
    el.sheetTitle.textContent = `Comanda · ${tableLabel(t || { number: S.tableNo })}`;
    el.cartLines.innerHTML = lines.length
      ? lines
          .map(
            (l) => `<li data-key="${esc(l.key)}">
              <div class="cline-top">
                <span class="cline-name">${esc(l.name)}${l.cook ? ` (${esc(l.cook)})` : ""}
                  <span class="cline-price">${esc(money(l.price))} c/u</span></span>
                <div class="stepper">
                  <button type="button" data-qty="-1" aria-label="Uno menos">−</button>
                  <span>${l.qty}</span>
                  <button type="button" data-qty="1" aria-label="Uno más">+</button>
                </div>
              </div>
              <input class="cline-note" data-note maxlength="120" placeholder="Nota (ej. sin cebolla)" value="${esc(l.note || "")}" />
            </li>`,
          )
          .join("")
      : `<li class="empty">La comanda está vacía.</li>`;
    el.sheetTotal.textContent = money(cartTotal(lines));
    el.btnSend.disabled = lines.length === 0;
    el.btnSend.textContent = t && t.state === "free" ? `Abrir mesa y enviar a cocina` : "Enviar a cocina";
  }

  function renderOrders() {
    const list = myCommands();
    const open = list.filter((c) => c.status === "outbox" || c.status === "sent").length;
    el.ordersBadge.hidden = open === 0;
    el.ordersBadge.textContent = String(open);
    if (S.view !== "orders") return;
    if (list.length === 0) {
      el.ordersList.innerHTML = `<p class="empty">Todavía no mandaste comandas desde este celular.</p>`;
      return;
    }
    const KIND = { order: "Pedido", open: "Abrir mesa", prebill: "Pre-cuenta", attend: "Atendido" };
    el.ordersList.innerHTML = list
      .map((c) => {
        const t = tableByNo(c.table_number);
        const title = `${tableLabel(t || { number: c.table_number })} · ${KIND[c.kind] || "Comanda"}`;
        const items = (c.items || []).slice(0, 8);
        let foot = "";
        if (c.kind === "order" && (c.status === "sent" || c.status === "received" || c.status === "printed" || c.status === "outbox")) {
          const level = { outbox: 0, sent: 1, received: 2, printed: 3 }[c.status];
          const steps = ["Enviado", "Recibido en la caja", "Impreso en cocina"];
          foot = `<div class="steps">${steps.map((s, i) => `<span class="step ${level > i ? "done" : ""}">${s}</span>`).join("")}</div>`;
          if (c.status === "outbox") foot += `<span class="ostatus warn">Sin enviar: sale solo cuando haya señal</span>`;
          else if (c.status === "sent" && pcAge() > PC_STALE_MS) foot += `<span class="ostatus warn">Esperando que se conecte la caja</span>`;
        } else {
          const map = {
            outbox: ["Sin enviar: sale solo cuando haya señal", "warn"],
            sent: [pcAge() > PC_STALE_MS ? "Esperando que se conecte la caja" : "Enviado", pcAge() > PC_STALE_MS ? "warn" : ""],
            received: [c.kind === "prebill" ? "Recibido en la caja" : "Listo", ""],
            printed: [c.kind === "prebill" ? "Pre-cuenta impresa" : "Impreso", ""],
            rejected: ["No se cargó", "err"],
            failed: ["No se pudo mandar", "err"],
          };
          const [text, tone] = map[c.status] || ["Enviado", ""];
          foot = `<span class="ostatus ${tone}">${esc(text)}</span>`;
        }
        if (c.kind === "order" && (c.status === "rejected" || c.status === "failed")) {
          foot = `<span class="ostatus err">${c.status === "failed" ? "No se pudo mandar" : "No se cargó"}</span>`;
        }
        return `<article class="ocard">
          <div class="ocard-head"><span class="ocard-title">${esc(title)}</span><span class="ocard-time">${esc(hhmm(c.created_at))}</span></div>
          ${items.length ? `<ul class="ocard-items">${items.map((i) => `<li>${esc(qtyText(i.qty))} × ${esc(i.name)}</li>`).join("")}</ul>` : ""}
          ${c.note ? `<p class="ocard-note">${esc(c.note)}</p>` : ""}
          ${foot}
        </article>`;
      })
      .join("");
  }

  function renderAll() {
    if (!S.token) return;
    el.status.hidden = Boolean(S.data) || S.view === "unlinked";
    if (S.data) {
      el.topBiz.textContent = `${S.data.business_name} · ${S.data.waiter?.name || "Mozo"}`;
      document.title = `Mozo · ${S.data.business_name}`;
    }
    el.topTitle.textContent =
      S.view === "orders" ? "Comandas" : S.view === "table" || S.view === "menu" ? tableLabel(tableByNo(S.tableNo) || { number: S.tableNo }) : "Mesas";
    renderConn();
    if (S.view === "tables") renderTables();
    if (S.view === "table") renderTable();
    if (S.view === "menu") renderMenu();
    renderOrders();
    renderCartBar();
    if (!el.sheet.hidden) renderSheet();
  }

  /* ---------- Acciones ---------- */

  function openTable(n) {
    S.tableNo = n;
    S.guests = 2;
    showView("table");
  }

  function addProduct(id, cook) {
    const p = (S.menu?.products || []).find((x) => x.id === id);
    if (!p || p.available === false) return;
    if (isEmpanada(p) && cook === undefined) {
      S.cookFor = id;
      el.cookTitle.textContent = p.name;
      el.cook.hidden = false;
      return;
    }
    const lines = cart().map((l) => ({ ...l }));
    const cur = lines.find((l) => l.id === id && (l.cook || null) === (cook || null) && !l.note);
    if (cur) cur.qty = Math.min(99, cur.qty + 1);
    else lines.push({ key: `${lineKey(id, cook)}|${uuid().slice(0, 8)}`, id, name: p.name, price: p.price, qty: 1, note: "", cook: cook || null });
    saveCart(lines);
    renderAll();
  }

  async function sendCart() {
    const lines = cart();
    if (!lines.length) return;
    const t = tableByNo(S.tableNo);
    el.btnSend.disabled = true;
    const note = el.cartNote.value.trim().slice(0, 200);
    const items = lines.map((l) => ({ id: l.id, qty: l.qty, note: (l.note || "").trim().slice(0, 120) || null, cook: l.cook }));
    const summary = lines.map((l) => ({ name: l.cook ? `${l.name} (${l.cook})` : l.name, qty: l.qty }));
    saveCart([]);
    el.cartNote.value = "";
    el.sheet.hidden = true;
    showView("table");
    toast("Comanda enviada");
    await sendCommand("order", { items, ...(note ? { note } : {}), ...(t?.state === "free" ? { guests: S.guests } : {}) }, summary);
  }

  /* ---------- Eventos ---------- */

  el.grid.addEventListener("click", (e) => {
    const b = e.target.closest("[data-table]");
    if (b) openTable(Number(b.dataset.table));
  });
  el.zoneNav.addEventListener("click", (e) => {
    const b = e.target.closest("[data-zone]");
    if (!b) return;
    S.zone = b.dataset.zone;
    renderTables();
  });
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) showView(go.dataset.go);
  });
  el.tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) showView(b.dataset.tab);
  });
  document.getElementById("guests-stepper").addEventListener("click", (e) => {
    const b = e.target.closest("[data-guests]");
    if (!b) return;
    S.guests = Math.max(1, Math.min(99, S.guests + Number(b.dataset.guests)));
    el.guestsValue.textContent = String(S.guests);
  });
  el.btnOpen.addEventListener("click", () => {
    toast("Mesa abierta");
    void sendCommand("open", { guests: S.guests });
  });
  el.btnAdd.addEventListener("click", () => {
    showView("menu");
    if (!S.menu) void loadMenu(false).then(renderAll);
  });
  el.btnPrebill.addEventListener("click", () => {
    toast("Pre-cuenta pedida a la caja");
    void sendCommand("prebill", {});
  });
  el.btnAttend.addEventListener("click", () => {
    toast("Listo, marcado como atendido");
    void sendCommand("attend", {});
  });
  el.search.addEventListener("input", () => {
    S.search = el.search.value;
    renderMenu();
  });
  el.catNav.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    S.cat = b.dataset.cat;
    renderMenu();
  });
  el.menuList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (b) addProduct(Number(b.dataset.add));
  });
  el.cook.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cook]");
    if (b && S.cookFor != null) addProduct(S.cookFor, b.dataset.cook);
    if (b || e.target === el.cook || e.target.closest("[data-close]")) {
      el.cook.hidden = true;
      S.cookFor = null;
    }
  });
  el.cartBar.addEventListener("click", () => {
    renderSheet();
    el.sheet.hidden = false;
  });
  el.sheet.addEventListener("click", (e) => {
    if (e.target === el.sheet || e.target.closest("[data-close]")) {
      el.sheet.hidden = true;
      renderAll();
      return;
    }
    const b = e.target.closest("[data-qty]");
    if (!b) return;
    const key = b.closest("[data-key]")?.dataset.key;
    const lines = cart()
      .map((l) => (l.key === key ? { ...l, qty: Math.min(99, l.qty + Number(b.dataset.qty)) } : l))
      .filter((l) => l.qty > 0);
    saveCart(lines);
    renderSheet();
    renderCartBar();
  });
  el.cartLines.addEventListener("change", (e) => {
    const input = e.target.closest("[data-note]");
    if (!input) return;
    const key = input.closest("[data-key]")?.dataset.key;
    saveCart(cart().map((l) => (l.key === key ? { ...l, note: input.value.slice(0, 120) } : l)));
  });
  el.btnSend.addEventListener("click", () => void sendCart());
  el.btnOpts.addEventListener("click", () => {
    el.optsWho.textContent = S.data ? `Vinculado como ${S.data.waiter?.name || "mozo"} en ${S.data.business_name}.` : "";
    el.opts.hidden = false;
  });
  el.opts.addEventListener("click", (e) => {
    if (e.target === el.opts || e.target.closest("[data-close]")) el.opts.hidden = true;
  });
  document.getElementById("btn-reload-menu").addEventListener("click", () => {
    el.opts.hidden = true;
    void loadMenu(true).then(() => {
      renderAll();
      toast("Carta actualizada");
    });
  });
  document.getElementById("btn-unlink").addEventListener("click", () => {
    if (!window.confirm("¿Desvincular este celular? Para volver a usarlo vas a necesitar un enlace nuevo del encargado.")) return;
    el.opts.hidden = true;
    unlink("Desvinculaste este celular");
    el.unlinkedText.textContent = "Para volver a tomar pedidos, pedile al encargado un enlace nuevo.";
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refresh();
    else clearTimeout(S.timer);
  });
  window.addEventListener("online", () => void refresh());
  window.addEventListener("resize", syncTopHeight);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    for (const s of [el.cook, el.sheet, el.opts]) s.hidden = true;
  });

  /* ---------- Inicio ---------- */

  const fromHash = new URLSearchParams(location.hash.replace(/^#/, "")).get("k");
  if (fromHash && /^wq_[A-Za-z0-9_-]{43}$/.test(fromHash)) {
    if (localStorage.getItem(TOKEN_KEY) !== fromHash) {
      for (const k of [OUTBOX_KEY, LOCAL_KEY, CARTS_KEY, MENU_KEY]) localStorage.removeItem(k);
    }
    localStorage.setItem(TOKEN_KEY, fromHash);
  }
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  S.token = localStorage.getItem(TOKEN_KEY);
  S.carts = readJson(CARTS_KEY, {});
  syncTopHeight();
  if (!S.token) {
    showView("unlinked");
    el.status.hidden = true;
    return;
  }
  showView("tables");
  void refresh();
  void loadMenu(false).then(() => {
    if (S.view === "menu") renderAll();
  });
})();
