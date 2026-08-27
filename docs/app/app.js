(() => {
  const API =
    (window.WALQO_LICENSE_API_URL ||
      "https://gestion-comercios-license.walphur.workers.dev").replace(/\/$/, "");
  const TOKEN_KEY = "walqo_portal_token";
  const POLL_MS = 45 * 1000;

  const viewLogin = document.getElementById("view-login");
  const viewDash = document.getElementById("view-dash");
  const btnLogout = document.getElementById("btn-logout");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const btnLogin = document.getElementById("btn-login");
  const btnRefresh = document.getElementById("btn-refresh");

  let pollTimer = null;

  const PAYMENT_LABELS = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    debito: "Débito",
    credito: "Crédito",
    transferencia: "Transferencia",
    mercadopago: "Mercado Pago",
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
    if (y <= 0 && t <= 0) return { text: "Igual que ayer", cls: "flat" };
    if (y <= 0) return { text: "Sin ventas ayer", cls: "up" };
    const pct = ((t - y) / y) * 100;
    const abs = Math.abs(Math.round(pct));
    if (abs < 1) return { text: "Igual que ayer", cls: "flat" };
    if (pct > 0) return { text: `+${abs}% vs ayer`, cls: "up" };
    return { text: `−${abs}% vs ayer`, cls: "down" };
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

  function renderEmptyList(ul, title, sub) {
    ul.innerHTML = `<li><div class="left"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(sub)}</span></div></li>`;
  }

  function renderDashboard(data) {
    document.getElementById("biz-name").textContent = data.business_name || "Mi comercio";
    const syncEl = document.getElementById("sync-meta");
    const empty = document.getElementById("empty-state");
    const body = document.getElementById("dash-body");

    if (data.empty) {
      syncEl.textContent = "Esperando primera subida desde la PC";
      empty.hidden = false;
      body.hidden = true;
      document.getElementById("empty-msg").textContent =
        data.message ||
        "En la PC del comercio: Configuración → Panel web del dueño → activá el interruptor.";
      return;
    }

    empty.hidden = true;
    body.hidden = false;

    const when = data.pushed_at || data.updated_at;
    const device = data.device_name ? ` · ${data.device_name}` : "";
    syncEl.textContent = `Última sync: ${formatWhen(when)}${device} · se actualiza sola`;

    const todayTotal = data.sales_today_total ?? 0;
    const yesterdayTotal = data.sales_yesterday_total ?? 0;
    const delta = vsYesterday(todayTotal, yesterdayTotal);

    document.getElementById("kpi-grid").innerHTML = `
      <article class="kpi">
        <p class="kpi-label">Ventas de hoy</p>
        <p class="kpi-value">${escapeHtml(money(todayTotal))}</p>
        <p class="kpi-hint ${delta.cls}">${escapeHtml(delta.text)} · ayer ${escapeHtml(money(yesterdayTotal))}</p>
      </article>
      <article class="kpi">
        <p class="kpi-label">Tickets hoy</p>
        <p class="kpi-value">${escapeHtml(String(data.sales_today_count ?? 0))}</p>
        <p class="kpi-hint">Ayer: ${escapeHtml(String(data.sales_yesterday_count ?? 0))}</p>
      </article>
      <article class="kpi">
        <p class="kpi-label">Para pedir</p>
        <p class="kpi-value">${escapeHtml(String(data.low_stock_count ?? 0))}</p>
        <p class="kpi-hint">Mínimo o stock negativo</p>
      </article>`;

    const registers = Array.isArray(data.sales_by_register) ? data.sales_by_register : [];
    const regMax = Math.max(...registers.map((r) => Number(r.total) || 0), 1);
    const regBox = document.getElementById("register-compare");
    if (!registers.length) {
      regBox.innerHTML =
        `<p class="compare-meta">Hoy todavía no hay ventas con caja identificada.</p>`;
    } else {
      regBox.innerHTML = registers
        .map((r) => {
          const label = registerLabel(r);
          const pct = Math.round(((Number(r.total) || 0) / regMax) * 100);
          const share =
            todayTotal > 0
              ? Math.round(((Number(r.total) || 0) / todayTotal) * 100)
              : 0;
          return `<div class="compare-row">
            <div class="compare-top">
              <span class="compare-name">${escapeHtml(label)}</span>
              <span class="compare-total">${escapeHtml(money(r.total))}</span>
            </div>
            <div class="compare-track"><div class="compare-fill" style="width:${pct}%"></div></div>
            <p class="compare-meta">${escapeHtml(String(r.count ?? 0))} ticket${Number(r.count) === 1 ? "" : "s"} · ${share}% del día</p>
          </div>`;
        })
        .join("");
    }

    const week = Array.isArray(data.sales_last_7_days) ? data.sales_last_7_days : [];
    const weekMax = Math.max(...week.map((d) => Number(d.total) || 0), 1);
    const weekSum = week.reduce((a, d) => a + (Number(d.total) || 0), 0);
    const todayKey = (() => {
      const n = new Date();
      return [
        n.getFullYear(),
        String(n.getMonth() + 1).padStart(2, "0"),
        String(n.getDate()).padStart(2, "0"),
      ].join("-");
    })();
    document.getElementById("week-chart").innerHTML = week.length
      ? week
          .map((d) => {
            const h = Math.max(4, Math.round(((Number(d.total) || 0) / weekMax) * 120));
            const isToday = d.day === todayKey;
            return `<div class="bar-col">
              <span class="bar-val">${escapeHtml(moneyShort(d.total))}</span>
              <div class="bar${isToday ? " is-today" : ""}" style="height:${h}px" title="${escapeHtml(money(d.total))}"></div>
              <span class="bar-label">${escapeHtml(dayLabel(d.day))}</span>
            </div>`;
          })
          .join("")
      : `<p class="compare-meta">Sin historial de la semana todavía.</p>`;
    document.getElementById("week-total").textContent = week.length
      ? `Total 7 días: ${money(weekSum)}`
      : "";

    const employees = Array.isArray(data.sales_by_employee) ? data.sales_by_employee : [];
    const empUl = document.getElementById("employee-list");
    if (!employees.length) {
      renderEmptyList(empUl, "Sin ventas por empleado", "Aparece cuando hay tickets con cajero");
    } else {
      empUl.innerHTML = employees
        .map(
          (e) => `<li>
            <div class="left">
              <strong>${escapeHtml(e.name || "Sin asignar")}</strong>
              <span>${escapeHtml(String(e.count ?? 0))} ticket${Number(e.count) === 1 ? "" : "s"}</span>
            </div>
            <div class="right">${escapeHtml(money(e.total))}</div>
          </li>`,
        )
        .join("");
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
            return `<li class="${cls}">
              <div class="left">
                <strong>${escapeHtml(p.name || "?")}</strong>
                <span>${escapeHtml(minLabel)}</span>
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
    if (!silent) btnRefresh.classList.add("is-loading");
    try {
      const data = await api("/v1/portal/dashboard");
      renderDashboard(data);
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

  btnRefresh.addEventListener("click", async () => {
    btnRefresh.disabled = true;
    try {
      await loadDashboard();
    } catch (err) {
      if (err.status === 401) {
        setToken("");
        showLogin();
      }
    } finally {
      btnRefresh.disabled = false;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && getToken() && !viewDash.hidden) {
      void loadDashboard({ silent: true });
    }
  });

  void boot();
})();
