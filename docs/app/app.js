(() => {
  const API =
    (window.WALQO_LICENSE_API_URL ||
      "https://gestion-comercios-license.walphur.workers.dev").replace(/\/$/, "");
  const TOKEN_KEY = "walqo_portal_token";
  const POLL_MS = 45 * 1000;
  /** Snapshot fresco: menos de 15 min */
  const FRESH_MS = 15 * 60 * 1000;
  /** Snapshot desactualizado: 15–60 min */
  const STALE_MS = 60 * 60 * 1000;

  const viewLogin = document.getElementById("view-login");
  const viewDash = document.getElementById("view-dash");
  const btnLogout = document.getElementById("btn-logout");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const btnLogin = document.getElementById("btn-login");
  const btnRefresh = document.getElementById("btn-refresh");
  const btnRetry = document.getElementById("btn-retry");
  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("error-state");
  const emptyState = document.getElementById("empty-state");
  const dashBody = document.getElementById("dash-body");

  let pollTimer = null;
  /** Último dashboard cargado (para cambiar de período sin refetch). */
  let lastDashboard = null;
  let selectedPeriod = "today";

  const PAYMENT_LABELS = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    debito: "Débito",
    credito: "Crédito",
    transferencia: "Transferencia",
    mercadopago: "Mercado Pago",
    payway: "Payway QR",
    fiado: "Fiado",
    cuenta_corriente: "Fiado",
  };

  const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

  function money(n) {
    const v = Number(n) || 0;
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      }).format(v);
    } catch {
      return `$ ${Math.round(v)}`;
    }
  }

  function moneyShort(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}k`;
    return money(v);
  }

  function avgTicket(total, count) {
    const c = Number(count) || 0;
    if (c <= 0) return 0;
    return (Number(total) || 0) / c;
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(iso);
    }
  }

  /** Tiempo relativo honesto desde pushed_at / updated_at. */
  function relativeAgo(iso) {
    if (!iso) return { text: "Sin fecha de actualización", ageMs: null };
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return { text: "Sin fecha de actualización", ageMs: null };
    const ageMs = Math.max(0, Date.now() - t);
    const mins = Math.floor(ageMs / 60000);
    if (mins < 1) return { text: "Actualizado hace instantes", ageMs };
    if (mins < 60) return { text: `Actualizado hace ${mins} min`, ageMs };
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      const rem = mins % 60;
      return {
        text: rem > 0 ? `Actualizado hace ${hours} h ${rem} min` : `Actualizado hace ${hours} h`,
        ageMs,
      };
    }
    const days = Math.floor(hours / 24);
    return { text: `Actualizado hace ${days} día${days === 1 ? "" : "s"}`, ageMs };
  }

  function snapshotHealth(ageMs) {
    if (ageMs == null) {
      return {
        level: "stale",
        title: "Datos desactualizados",
        cls: "status-card--warn",
      };
    }
    if (ageMs <= FRESH_MS) {
      return {
        level: "ok",
        title: "Todo funciona normalmente",
        cls: "status-card--ok",
      };
    }
    if (ageMs <= STALE_MS) {
      return {
        level: "stale",
        title: "Datos desactualizados",
        cls: "status-card--warn",
      };
    }
    return {
      level: "old",
      title: "Sin datos recientes",
      cls: "status-card--danger",
    };
  }

  function paymentLabel(method) {
    if (!method) return "";
    const key = String(method).toLowerCase().replace(/\s+/g, "_");
    return PAYMENT_LABELS[key] || method;
  }

  function registerLabel(row) {
    const name = row.device_name?.trim();
    if (name) return name;
    const code = row.device_code?.trim();
    return code && code !== "—" ? code : "Caja";
  }

  function stockClass(stock, minStock) {
    const s = Number(stock) || 0;
    const m = Number(minStock) || 0;
    if (s < 0) return "stock-critical";
    if (m > 0 && s <= m) return "stock-warn";
    return "";
  }

  function dayLabel(isoDay) {
    try {
      const [y, m, d] = String(isoDay).split("-").map(Number);
      if (!y || !m || !d) return isoDay;
      const dt = new Date(y, m - 1, d);
      return DOW[dt.getDay()] || isoDay.slice(5);
    } catch {
      return String(isoDay).slice(5);
    }
  }

  function vsYesterday(today, yesterday) {
    const t = Number(today) || 0;
    const y = Number(yesterday) || 0;
    if (y <= 0) return { text: "Sin comparación", cls: "flat" };
    const pct = ((t - y) / y) * 100;
    const abs = Math.abs(Math.round(pct));
    if (abs < 1) return { text: "Igual que ayer", cls: "flat" };
    if (pct > 0) return { text: `↑ ${abs}% vs ayer`, cls: "up" };
    return { text: `↓ ${abs}% vs ayer`, cls: "down" };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({ "content-type": "application/json" }, opts.headers || {});
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || data.error || `Error ${res.status}`);
      err.status = res.status;
      err.code = data.error;
      throw err;
    }
    return data;
  }

  function showLogin() {
    viewLogin.hidden = false;
    viewDash.hidden = true;
    btnLogout.hidden = true;
    stopPoll();
  }

  function showDash() {
    viewLogin.hidden = true;
    viewDash.hidden = false;
    btnLogout.hidden = false;
    startPoll();
  }

  function setViewMode(mode) {
    loadingState.hidden = mode !== "loading";
    errorState.hidden = mode !== "error";
    emptyState.hidden = mode !== "empty";
    dashBody.hidden = mode !== "dash";
  }

  function startPoll() {
    stopPoll();
    pollTimer = window.setInterval(() => {
      void loadDashboard({ silent: true });
    }, POLL_MS);
  }

  function stopPoll() {
    if (pollTimer != null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function dayLabelShort(isoDay) {
    try {
      const parts = String(isoDay).split("-");
      if (parts.length < 3) return dayLabel(isoDay);
      return `${parts[2]}/${parts[1]}`;
    } catch {
      return dayLabel(isoDay);
    }
  }

  function periodCompareLabel(compare) {
    if (!compare || typeof compare !== "object") {
      return { text: "Sin comparación disponible", cls: "flat" };
    }
    const prev = Number(compare.previous_total) || 0;
    const cur = Number(compare.current_total) || 0;
    if (prev <= 0) return { text: "Sin comparación disponible", cls: "flat" };
    const pct = ((cur - prev) / prev) * 100;
    const abs = Math.abs(Math.round(pct));
    if (abs < 1) return { text: "Igual que el período anterior", cls: "flat" };
    if (pct > 0) return { text: `↑ ${abs}% vs período anterior`, cls: "up" };
    return { text: `↓ ${abs}% vs período anterior`, cls: "down" };
  }

  function seriesForPeriod(data, period) {
    if (period === "7d") {
      return {
        series: Array.isArray(data.sales_last_7_days) ? data.sales_last_7_days : [],
        label: "7 días",
        compare: data.period_compare_7d,
        available: true,
      };
    }
    if (period === "30d") {
      const series = Array.isArray(data.sales_last_30_days) ? data.sales_last_30_days : [];
      return {
        series,
        label: "30 días",
        compare: data.period_compare_30d,
        available: series.length > 0,
      };
    }
    if (period === "month") {
      const series = Array.isArray(data.sales_month_to_date) ? data.sales_month_to_date : [];
      return {
        series,
        label: "Este mes",
        compare: null,
        available: series.length > 0,
      };
    }
    // today: single bar from today totals
    const todayKey = (() => {
      const n = new Date();
      return [
        n.getFullYear(),
        String(n.getMonth() + 1).padStart(2, "0"),
        String(n.getDate()).padStart(2, "0"),
      ].join("-");
    })();
    return {
      series: [
        {
          day: todayKey,
          count: data.sales_today_count ?? 0,
          total: data.sales_today_total ?? 0,
        },
      ],
      label: "Hoy",
      compare: null,
      vsYesterday: true,
      available: true,
    };
  }

  function updatePeriodTabs() {
    document.querySelectorAll(".period-tab").forEach((btn) => {
      const p = btn.getAttribute("data-period");
      const has30 = Array.isArray(lastDashboard?.sales_last_30_days) && lastDashboard.sales_last_30_days.length > 0;
      const hasMonth = Array.isArray(lastDashboard?.sales_month_to_date) && lastDashboard.sales_month_to_date.length > 0;
      if (p === "30d") btn.disabled = !has30;
      if (p === "month") btn.disabled = !hasMonth;
      btn.classList.toggle("is-active", p === selectedPeriod);
    });
  }

  function renderSalesPeriod(data) {
    updatePeriodTabs();
    const info = seriesForPeriod(data, selectedPeriod);
    const summaryEl = document.getElementById("period-summary");
    const chartEl = document.getElementById("week-chart");
    const footEl = document.getElementById("week-total");

    if (!info.available || !info.series.length) {
      summaryEl.innerHTML = `<p class="period-summary__note">Este período todavía no tiene datos publicados desde la PC.</p>`;
      chartEl.hidden = false;
      chartEl.innerHTML = `<p class="compare-meta">Sin historial para mostrar.</p>`;
      chartEl.className = "bar-chart bar-chart--empty";
      chartEl.style.gridTemplateColumns = "";
      footEl.textContent = "";
      return;
    }

    const series = info.series;
    const total = series.reduce((a, d) => a + (Number(d.total) || 0), 0);
    const count = series.reduce((a, d) => a + (Number(d.count) || 0), 0);
    const avg = avgTicket(total, count);

    let compareHtml = "";
    if (selectedPeriod === "today") {
      const delta = vsYesterday(data.sales_today_total ?? 0, data.sales_yesterday_total ?? 0);
      compareHtml = `<p class="kpi-hint ${delta.cls}">${escapeHtml(delta.text)}</p>`;
    } else if (info.compare) {
      const delta = periodCompareLabel(info.compare);
      compareHtml = `<p class="kpi-hint ${delta.cls}">${escapeHtml(delta.text)}</p>`;
    } else if (selectedPeriod === "month") {
      compareHtml = `<p class="kpi-hint flat">Sin comparación disponible</p>`;
    }

    summaryEl.innerHTML = `
      <div class="period-summary__main min-w-0">
        <p class="period-summary__label">${escapeHtml(info.label)}</p>
        <p class="period-summary__total">${escapeHtml(money(total))}</p>
        ${compareHtml}
      </div>
      <div class="period-summary__side">
        <p><strong>${escapeHtml(String(count))}</strong> tickets</p>
        <p>Promedio ${escapeHtml(money(avg))}</p>
      </div>`;

    // Hoy = 1 barra: el resumen ya muestra el total; un chart de 150px queda vacío.
    if (series.length <= 1) {
      chartEl.hidden = true;
      chartEl.innerHTML = "";
      chartEl.className = "bar-chart";
      chartEl.style.gridTemplateColumns = "";
      footEl.textContent = "";
      return;
    }

    chartEl.hidden = false;
    const maxRaw = Math.max(...series.map((d) => Number(d.total) || 0), 0);
    const allZero = maxRaw <= 0;
    const max = Math.max(maxRaw, 1);
    const todayKey = (() => {
      const n = new Date();
      return [
        n.getFullYear(),
        String(n.getMonth() + 1).padStart(2, "0"),
        String(n.getDate()).padStart(2, "0"),
      ].join("-");
    })();

    const many = series.length > 14;
    const plotMax = allZero ? 36 : many ? 100 : 110;
    chartEl.className = [
      "bar-chart",
      many ? "bar-chart--dense" : "",
      allZero ? "bar-chart--flat" : "",
    ]
      .filter(Boolean)
      .join(" ");
    chartEl.style.gridTemplateColumns = `repeat(${series.length}, minmax(0, 1fr))`;

    chartEl.innerHTML = series
      .map((d) => {
        const h = allZero
          ? 4
          : Math.max(4, Math.round(((Number(d.total) || 0) / max) * plotMax));
        const isToday = d.day === todayKey;
        const label = many ? dayLabelShort(d.day) : dayLabel(d.day);
        const showVal = !allZero && (!many || series.length <= 20);
        return `<div class="bar-col">
          ${showVal ? `<span class="bar-val">${escapeHtml(moneyShort(d.total))}</span>` : `<span class="bar-val" aria-hidden="true"></span>`}
          <div class="bar${isToday ? " is-today" : ""}" style="height:${h}px" title="${escapeHtml(money(d.total))} · ${escapeHtml(String(d.count || 0))} tickets"></div>
          <span class="bar-label">${escapeHtml(label)}</span>
        </div>`;
      })
      .join("");

    footEl.textContent = `Total ${info.label.toLowerCase()}: ${money(total)}`;
  }

  function renderEmptyList(ul, title, sub) {
    ul.innerHTML = `<li><div class="left"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(sub)}</span></div></li>`;
  }

  function renderDashboard(data) {
    lastDashboard = data;
    document.getElementById("biz-name").textContent = data.business_name || "Mi comercio";
    const syncEl = document.getElementById("sync-meta");

    if (data.empty) {
      syncEl.textContent = "Esperando primera subida desde la PC";
      setViewMode("empty");
      document.getElementById("empty-msg").textContent =
        data.message ||
        "En la PC del comercio: Configuración → Panel web del dueño → activá el interruptor. Los datos se actualizan desde la PC principal.";
      return;
    }

    setViewMode("dash");

    // Si el período elegido no tiene datos (snapshot viejo), volver a 7d o hoy.
    if (selectedPeriod === "30d" && !(Array.isArray(data.sales_last_30_days) && data.sales_last_30_days.length)) {
      selectedPeriod = "7d";
    }
    if (selectedPeriod === "month" && !(Array.isArray(data.sales_month_to_date) && data.sales_month_to_date.length)) {
      selectedPeriod = "7d";
    }

    const when = data.pushed_at || data.updated_at;
    const ago = relativeAgo(when);
    const health = snapshotHealth(ago.ageMs);
    const device = data.device_name ? ` · ${data.device_name}` : "";
    syncEl.textContent = `${ago.text}${device}`;

    const statusCard = document.getElementById("status-card");
    statusCard.className = `status-card ${health.cls}`;
    document.getElementById("status-title").textContent = health.title;
    document.getElementById("status-detail").textContent =
      `${ago.text}. Los datos se actualizan desde la PC principal.`;

    const todayTotal = data.sales_today_total ?? 0;
    const todayCount = data.sales_today_count ?? 0;
    const yesterdayTotal = data.sales_yesterday_total ?? 0;
    const delta = vsYesterday(todayTotal, yesterdayTotal);
    const ticketAvg = avgTicket(todayTotal, todayCount);
    const stockCount = data.low_stock_count ?? 0;

    document.getElementById("kpi-grid").innerHTML = `
      <article class="kpi kpi--primary">
        <p class="kpi-label">Ventas hoy</p>
        <p class="kpi-value">${escapeHtml(money(todayTotal))}</p>
        <p class="kpi-hint ${delta.cls}">${escapeHtml(delta.text)}</p>
        <p class="kpi-sub">Ayer ${escapeHtml(money(yesterdayTotal))}</p>
      </article>
      <article class="kpi">
        <p class="kpi-label">Tickets</p>
        <p class="kpi-value">${escapeHtml(String(todayCount))}</p>
        <p class="kpi-hint">Ticket promedio</p>
        <p class="kpi-sub kpi-sub--strong">${escapeHtml(money(ticketAvg))}</p>
      </article>
      <article class="kpi">
        <p class="kpi-label">Stock para revisar</p>
        <p class="kpi-value">${escapeHtml(String(stockCount))}</p>
        <p class="kpi-hint">Mínimo o stock negativo</p>
      </article>
      <article class="kpi">
        <p class="kpi-label">Actualización</p>
        <p class="kpi-value kpi-value--sm">${escapeHtml(ago.text.replace(/^Actualizado /, ""))}</p>
        <p class="kpi-hint">${escapeHtml(formatWhen(when))}</p>
      </article>`;

    const registers = Array.isArray(data.sales_by_register) ? data.sales_by_register : [];
    const regBox = document.getElementById("register-compare");
    if (!registers.length) {
      regBox.innerHTML = `<div class="card register-empty"><p class="compare-meta">Hoy todavía no hay ventas con caja identificada.</p></div>`;
    } else {
      regBox.innerHTML = registers
        .map((r) => {
          const label = registerLabel(r);
          const count = Number(r.count) || 0;
          const total = Number(r.total) || 0;
          const avg = avgTicket(total, count);
          return `<article class="register-card card">
            <p class="register-card__name">${escapeHtml(label)}</p>
            <p class="register-card__total">${escapeHtml(money(total))}</p>
            <p class="register-card__meta">${escapeHtml(String(count))} ticket${count === 1 ? "" : "s"}</p>
            <p class="register-card__avg">Ticket promedio ${escapeHtml(money(avg))}</p>
          </article>`;
        })
        .join("");
    }

    renderSalesPeriod(data);

    const employees = Array.isArray(data.sales_by_employee) ? data.sales_by_employee : [];
    const empUl = document.getElementById("employee-list");
    if (!employees.length) {
      renderEmptyList(empUl, "Sin ventas por empleado", "Aparece cuando hay tickets con cajero");
    } else {
      empUl.innerHTML = employees
        .map((e) => {
          const count = Number(e.count) || 0;
          const total = Number(e.total) || 0;
          const avg = avgTicket(total, count);
          return `<li>
            <div class="left">
              <strong>${escapeHtml(e.name || "Sin asignar")}</strong>
              <span>${escapeHtml(String(count))} ticket${count === 1 ? "" : "s"} · prom. ${escapeHtml(money(avg))}</span>
            </div>
            <div class="right">${escapeHtml(money(total))}</div>
          </li>`;
        })
        .join("");
    }

    const stockSummaryEl = document.getElementById("stock-summary");
    const summary = data.stock_summary;
    const productsTotal = Number(summary?.products_total ?? data.products_total) || 0;
    const critical = Number(summary?.critical_count) || 0;
    const lowOnly = Number(summary?.low_count) || 0;
    if (summary && (critical > 0 || lowOnly > 0 || productsTotal > 0)) {
      stockSummaryEl.hidden = false;
      const normal =
        productsTotal > 0 ? Math.max(0, productsTotal - critical - lowOnly) : null;
      stockSummaryEl.innerHTML = `
        <div class="stock-pill stock-pill--critical"><span>Crítico</span><strong>${critical}</strong></div>
        <div class="stock-pill stock-pill--low"><span>Bajo</span><strong>${lowOnly}</strong></div>
        ${
          normal != null
            ? `<div class="stock-pill stock-pill--ok"><span>Normal</span><strong>${normal}</strong></div>`
            : ""
        }`;
    } else {
      stockSummaryEl.hidden = true;
      stockSummaryEl.innerHTML = "";
    }

    const stockUl = document.getElementById("stock-list");
    const low = Array.isArray(data.low_stock) ? data.low_stock : [];
    const totalAlerts = data.low_stock_count ?? low.length;
    const more =
      totalAlerts > low.length
        ? `<li class="list-more"><span>+ ${totalAlerts - low.length} más en la PC</span></li>`
        : "";
    if (!low.length) {
      renderEmptyList(stockUl, "Sin alertas", "Nada urgente para pedir");
    } else {
      stockUl.innerHTML =
        low
          .map((p) => {
            const cls = stockClass(p.stock, p.min_stock);
            const minLabel =
              Number(p.min_stock) > 0 ? `Mín. ${p.min_stock}` : "Stock negativo";
            const cover =
              typeof p.estimated_days_cover === "number" && Number.isFinite(p.estimated_days_cover)
                ? ` · ${p.estimated_days_cover < 10 ? p.estimated_days_cover.toFixed(1) : Math.round(p.estimated_days_cover)} días est.`
                : "";
            return `<li class="${cls}">
              <div class="left">
                <strong>${escapeHtml(p.name || "?")}</strong>
                <span>${escapeHtml(minLabel)}${escapeHtml(cover)}</span>
              </div>
              <div class="right">${escapeHtml(String(p.stock ?? 0))}</div>
            </li>`;
          })
          .join("") + more;
    }

    const topUl = document.getElementById("top-list");
    const top = Array.isArray(data.top_products_today) ? data.top_products_today : [];
    if (!top.length) {
      renderEmptyList(topUl, "Sin ventas de productos", "Cuando haya tickets aparece el ranking");
    } else {
      topUl.innerHTML = top
        .map(
          (p) => `<li>
            <div class="left"><strong>${escapeHtml(p.name || "?")}</strong></div>
            <div class="right">${escapeHtml(String(Math.round(Number(p.qty) || 0)))} u.</div>
          </li>`,
        )
        .join("");
    }

    const salesUl = document.getElementById("sales-list");
    const sales = Array.isArray(data.recent_sales) ? data.recent_sales : [];
    if (!sales.length) {
      renderEmptyList(salesUl, "Sin ventas recientes", "Hoy todavía no hubo tickets");
    } else {
      salesUl.innerHTML = sales
        .map((s) => {
          const pay = paymentLabel(s.payment_method);
          const meta = [s.device || "Caja", s.seller, pay].filter(Boolean).join(" · ");
          return `<li>
            <div class="left">
              <strong>${escapeHtml(formatWhen(s.at))}</strong>
              <span>${escapeHtml(meta)}</span>
            </div>
            <div class="right">${escapeHtml(money(s.total))}</div>
          </li>`;
        })
        .join("");
    }
  }

  async function loadDashboard({ silent } = {}) {
    if (!silent) {
      btnRefresh.classList.add("is-loading");
      if (dashBody.hidden && emptyState.hidden) setViewMode("loading");
    }
    try {
      const data = await api("/v1/portal/dashboard");
      renderDashboard(data);
      errorState.hidden = true;
    } catch (err) {
      if (err.status === 401) {
        setToken("");
        showLogin();
        return;
      }
      if (!silent || dashBody.hidden) {
        setViewMode("error");
        document.getElementById("error-msg").textContent =
          err.message || "No se pudo conectar. Revisá internet e intentá de nuevo.";
      }
    } finally {
      if (!silent) btnRefresh.classList.remove("is-loading");
    }
  }

  async function boot() {
    if (!getToken()) {
      showLogin();
      return;
    }
    try {
      await api("/v1/portal/me");
      showDash();
      setViewMode("loading");
      await loadDashboard();
    } catch {
      setToken("");
      showLogin();
    }
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    btnLogin.disabled = true;
    try {
      const data = await api("/v1/portal/login", {
        method: "POST",
        body: JSON.stringify({
          email: document.getElementById("email").value,
          password: document.getElementById("password").value,
        }),
      });
      setToken(data.token);
      showDash();
      setViewMode("loading");
      await loadDashboard();
    } catch (err) {
      loginError.textContent = err.message || "No se pudo iniciar sesión";
      loginError.hidden = false;
    } finally {
      btnLogin.disabled = false;
    }
  });

  btnLogout.addEventListener("click", async () => {
    try {
      await api("/v1/portal/logout", { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    setToken("");
    showLogin();
  });

  async function refreshClick() {
    btnRefresh.disabled = true;
    try {
      await loadDashboard();
    } finally {
      btnRefresh.disabled = false;
    }
  }

  btnRefresh.addEventListener("click", () => void refreshClick());
  btnRetry.addEventListener("click", () => void refreshClick());

  document.getElementById("period-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".period-tab");
    if (!btn || btn.disabled) return;
    const period = btn.getAttribute("data-period");
    if (!period || period === selectedPeriod) return;
    selectedPeriod = period;
    if (lastDashboard && !lastDashboard.empty) {
      renderSalesPeriod(lastDashboard);
      updatePeriodTabs();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && getToken() && !viewDash.hidden) {
      void loadDashboard({ silent: true });
    }
  });

  void boot();
})();
